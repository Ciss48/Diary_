'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { computePopoverPosition } from '@/lib/vocab'

interface Props {
  anchorRect: DOMRect
  fragment: string
  isSaved: boolean
  hasEnglishVoice: boolean
  onCopy: () => void
  onSound: () => void
  onSave: () => void
  onRemove: () => void
  onClose: () => void
  paneRef: React.RefObject<HTMLElement | null>
}

export default function VocabPopover({
  anchorRect,
  fragment,
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
  const measuredRef = useRef(false)

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
    measuredRef.current = true
  }, [anchorRect])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid the click that opened the popover from closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  // Close on pane scroll
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const handleScroll = () => onClose()
    pane.addEventListener('scroll', handleScroll, { passive: true })
    return () => pane.removeEventListener('scroll', handleScroll)
  }, [paneRef, onClose])

  // Close on resize
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

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        zIndex: 9999,
        opacity: 0,
        transition: 'opacity 120ms ease',
      }}
      className="flex items-stretch bg-card border border-line-2 rounded-[10px] shadow-[var(--shadow-3)] p-1 whitespace-nowrap an-rise"
    >
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
    </div>,
    document.body,
  )
}
