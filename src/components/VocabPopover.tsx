'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { computePopoverPosition } from '@/lib/vocab'

interface Props {
  anchorRect: DOMRect
  fragment: string
  originalText: string
  isSaved: boolean
  hasEnglishVoice: boolean
  onCopy: () => void
  onSound: () => void
  onSave: () => void
  onRemove: () => void
  onClose: () => void
  paneRef: React.RefObject<HTMLElement | null>
}

type ViState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; meaning: string; explanation: string }
  | { status: 'error'; message: string }

export default function VocabPopover({
  anchorRect,
  fragment,
  originalText,
  isSaved,
  hasEnglishVoice,
  onCopy,
  onSound,
  onSave,
  onRemove,
  onClose,
  paneRef,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [vi, setVi] = useState<ViState>({ status: 'idle' })

  const viLoading = vi.status === 'loading'

  // Stable close that respects loading state
  const safeClose = useCallback(() => {
    if (viLoading) return
    onClose()
  }, [viLoading, onClose])

  // Position after first render (need measured height)
  useEffect(() => {
    const el = popoverRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pos = computePopoverPosition(
      anchorRect,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
    )
    el.style.top = `${pos.top}px`
    el.style.left = `${pos.left}px`
    el.style.opacity = '1'
  }, [anchorRect])

  // Reposition after Vietnamese content loads or loading state changes
  useEffect(() => {
    if (vi.status === 'idle') return
    const el = popoverRef.current
    if (!el) return
    // Wait a frame for the DOM to update
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const pos = computePopoverPosition(
        anchorRect,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      )
      el.style.top = `${pos.top}px`
      el.style.left = `${pos.left}px`
    })
  }, [vi, anchorRect])

  // Close on Escape (always works, even during loading)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on outside click (suppressed during loading)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        safeClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [safeClose])

  // Close on pane scroll (suppressed during loading)
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const handleScroll = () => safeClose()
    pane.addEventListener('scroll', handleScroll, { passive: true })
    return () => pane.removeEventListener('scroll', handleScroll)
  }, [paneRef, safeClose])

  // Close on resize (always works — position is invalid)
  useEffect(() => {
    const handleResize = () => onClose()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [onClose])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fragment).catch(() => {})
    onCopy()
  }, [fragment, onCopy])

  const handleSound = useCallback(() => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(fragment)
    const voices = window.speechSynthesis.getVoices()
    const englishVoice = voices.find(v => v.lang.startsWith('en-'))
    if (englishVoice) utterance.voice = englishVoice
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
    onSound()
  }, [fragment, onSound])

  const fetchVietnamese = useCallback(async () => {
    setVi({ status: 'loading' })
    try {
      const res = await fetch('/api/vocab/vietnamese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fragment,
          original: originalText,
        }),
      })

      const data = await res.json().catch(() => null)

      // Even an error response may carry a cached meaning — show it rather
      // than making the user retry for something we already have.
      if (data?.meaning) {
        setVi({
          status: 'loaded',
          meaning: data.meaning,
          explanation: data.explanation ?? '',
        })
        return
      }

      if (!res.ok) {
        // The server tells us whether this is temporary; a rate limit reads very
        // differently to the user than a genuine failure.
        const retryAfter = typeof data?.retryAfter === 'number' ? data.retryAfter : null
        const message =
          data?.code === 'rate_limited'
            ? retryAfter
              ? `Too busy — retry in ${retryAfter}s`
              : 'Too busy — tap to retry'
            : typeof data?.error === 'string' && data.error
              ? `${data.error} — tap to retry`
              : 'Failed — tap to retry'
        setVi({ status: 'error', message })
        return
      }

      setVi({
        status: 'loaded',
        meaning: data?.meaning || '',
        explanation: data?.explanation || '',
      })
    } catch {
      setVi({ status: 'error', message: 'Could not reach the server — tap to retry' })
    }
  }, [fragment, originalText])

  const handleVietnamese = useCallback(() => {
    if (vi.status === 'loaded') {
      // Toggle off
      setVi({ status: 'idle' })
      return
    }
    void fetchVietnamese()
  }, [vi.status, fetchVietnamese])

  const handleRetry = useCallback(() => {
    void fetchVietnamese()
  }, [fetchVietnamese])

  const viExpanded = vi.status !== 'idle'

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        zIndex: 9999,
        opacity: 0,
        transition: 'opacity 120ms ease',
      }}
      className="bg-card border border-line-2 rounded-[10px] shadow-[var(--shadow-3)] p-1 an-rise"
    >
      {/* Button row */}
      <div className="flex items-stretch whitespace-nowrap">
        <button
          onClick={handleCopy}
          title="Copy the word"
          className="border-0 bg-transparent cursor-pointer font-sans text-[12.5px] text-ink-2
            px-[10px] py-[7px] rounded-[7px] transition-all duration-[140ms]
            hover:bg-paper-2 hover:text-ink"
        >
          Copy
        </button>
        <span className="w-px bg-line my-[5px] mx-[1px]" />
        {hasEnglishVoice && (
          <>
            <button
              onClick={handleSound}
              title="Hear it"
              className="border-0 bg-transparent cursor-pointer font-sans text-[13px] text-ink-2
                px-[10px] py-[7px] rounded-[7px] transition-all duration-[140ms]
                hover:bg-paper-2 hover:text-leaf"
            >
              ♪
            </button>
            <span className="w-px bg-line my-[5px] mx-[1px]" />
          </>
        )}
        <button
          onClick={handleVietnamese}
          title="Vietnamese meaning"
          disabled={viLoading}
          className={`border-0 cursor-pointer font-sans text-[12.5px] font-medium
            px-[10px] py-[7px] rounded-[7px] transition-all duration-[140ms]
            ${vi.status === 'loaded'
              ? 'bg-brass-soft text-brass'
              : 'bg-transparent text-ink-2 hover:bg-paper-2 hover:text-brass'
            }
            ${viLoading ? 'opacity-60 cursor-wait' : ''}`}
        >
          Vn
        </button>
        <span className="w-px bg-line my-[5px] mx-[1px]" />
        <button
          onClick={isSaved ? onRemove : onSave}
          title={isSaved ? 'Remove from vocabulary' : 'Note to vocabulary'}
          className={`flex-1 justify-center border-0 cursor-pointer font-sans text-[12.5px] font-medium
            px-[10px] py-[7px] rounded-[7px] transition-all duration-[140ms]
            flex items-center gap-[6px]
            ${isSaved
              ? 'bg-wax-soft text-wax hover:bg-wax-soft hover:text-wax'
              : 'bg-transparent text-ink-2 hover:bg-brass-soft hover:text-brass'
            }`}
        >
          <span className="text-[13px]">{isSaved ? '×' : '✎'}</span>
          {isSaved ? 'Remove' : 'Note'}
        </button>
      </div>

      {/* Vietnamese content area */}
      {viExpanded && (
        <div className="border-t border-line mx-1 mt-[3px] pt-[7px] pb-[5px] px-[9px] max-w-[280px]">
          {vi.status === 'loading' && (
            <span className="text-[12.5px] text-ink-3 italic">Loading…</span>
          )}
          {vi.status === 'loaded' && (
            <>
              {vi.meaning ? (
                <p className="m-0 text-[13px] leading-[1.5] text-ink font-medium">
                  {vi.meaning}
                </p>
              ) : (
                <p className="m-0 text-[12.5px] leading-[1.5] text-ink-3 italic">
                  No translation available.
                </p>
              )}
              {vi.explanation && (
                <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ink-2">
                  {vi.explanation}
                </p>
              )}
            </>
          )}
          {vi.status === 'error' && (
            <button
              onClick={handleRetry}
              className="border-0 bg-transparent cursor-pointer font-sans text-[12.5px] text-wax hover:underline p-0 text-left"
            >
              {vi.message}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
