'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import type { Segment } from '@/lib/suggestions'
import type { DiffChange } from '@/lib/diff'
import VocabPopover from '@/components/VocabPopover'

const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink-3/30 ' +
  '[scrollbar-width:thin]'

interface Props {
  segments: Segment[]
  changesCount: number
  correctedVersion: string
  selectedChange: number | null
  onSelectChange: (idx: number) => void
  onDismiss: () => void
  savedChangeIndices: Set<number>
  onVocabSave: (changeIndex: number, fragment: string) => void
  onVocabRemove: (changeIndex: number) => void
  diffChanges: DiffChange[]
}

/** Split segments into paragraphs on "\n\n" boundaries. */
function splitIntoParagraphs(segments: Segment[]): Segment[][] {
  const paragraphs: Segment[][] = [[]]
  for (const seg of segments) {
    if (seg.changeIndex !== null) {
      paragraphs[paragraphs.length - 1].push(seg)
      continue
    }
    const parts = seg.text.split('\n\n')
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([])
      if (part) paragraphs[paragraphs.length - 1].push({ text: part, changeIndex: null })
    })
  }
  return paragraphs.filter(p => p.length > 0)
}

export default function ImprovedVersionPane({
  segments,
  changesCount,
  correctedVersion,
  selectedChange,
  onSelectChange,
  onDismiss,
  savedChangeIndices,
  onVocabSave,
  onVocabRemove,
  diffChanges,
}: Props) {
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied ✓' | 'Copy failed'>('Copy')
  const [popover, setPopover] = useState<{ changeIndex: number; rect: DOMRect; text: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Check for English voice (lazy, on first render)
  const [hasEnglishVoice] = useState(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false
    const voices = window.speechSynthesis.getVoices()
    // Voices might not be loaded yet on first render — fallback to true
    // so button shows up; it'll just use default voice
    return voices.length === 0 || voices.some(v => v.lang.startsWith('en-'))
  })

  const paragraphs = useMemo(() => splitIntoParagraphs(segments), [segments])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(correctedVersion)
      setCopyLabel('Copied ✓')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    } catch {
      setCopyLabel('Copy failed')
      setTimeout(() => setCopyLabel('Copy'), 3000)
    }
  }

  const handleSpanClick = useCallback((changeIndex: number, e: React.MouseEvent<HTMLSpanElement>) => {
    onSelectChange(changeIndex)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const text = (e.currentTarget as HTMLElement).textContent ?? ''
    setPopover(prev =>
      prev?.changeIndex === changeIndex
        ? null // toggle off if same
        : { changeIndex, rect, text }
    )
  }, [onSelectChange])

  const handlePopoverClose = useCallback(() => {
    setPopover(null)
  }, [])

  const handlePopoverCopy = useCallback(() => {
    // Copy already handled in VocabPopover
    setPopover(null)
  }, [])

  const handlePopoverSound = useCallback(() => {
    // Sound already handled in VocabPopover
  }, [])

  const handlePopoverSave = useCallback(() => {
    if (!popover) return
    onVocabSave(popover.changeIndex, popover.text)
    setPopover(null)
  }, [popover, onVocabSave])

  const handlePopoverRemove = useCallback(() => {
    if (!popover) return
    onVocabRemove(popover.changeIndex)
    setPopover(null)
  }, [popover, onVocabRemove])

  return (
    <div className="an-unroll flex flex-col h-[45vh] md:h-full min-h-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2 shrink-0">
        <div className="flex items-baseline gap-[9px]">
          <span className="text-[10.5px] font-medium tracking-[.15em] text-leaf uppercase">
            TUTOR&apos;S COPY
          </span>
          {changesCount > 0 && (
            <span className="font-mono text-[11px] font-medium text-leaf bg-leaf-soft px-2 py-[2px] rounded-full">
              {changesCount} {changesCount === 1 ? 'note' : 'notes'}
            </span>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss improved version"
          className="text-ink-3 hover:text-ink text-xl leading-none ml-2 shrink-0 cursor-pointer bg-transparent border-0"
        >
          ×
        </button>
      </div>

      {/* Paper surface with leaf spine */}
      <div
        className="relative flex-1 min-h-0 flex flex-col rounded-[4px] bg-card border border-line shadow-[var(--shadow-2)] overflow-hidden"
        style={{ backgroundImage: 'var(--grain)' }}
      >
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-leaf" />

        {/* Scrollable text */}
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 overflow-y-auto px-[26px] py-[26px] pl-[34px]
            font-serif text-[16.5px] sm:text-[17.5px] leading-[1.78] text-ink ${SCROLLBAR}`}
        >
          {paragraphs.map((para, pi) => (
            <p key={pi} className="m-0 mb-[18px] last:mb-0">
              {para.map((seg, si) => {
                if (seg.changeIndex === null) {
                  return <span key={si}>{seg.text}</span>
                }
                const isSaved = savedChangeIndices.has(seg.changeIndex)
                const isSelected = selectedChange === seg.changeIndex
                return (
                  <span
                    key={si}
                    onClick={(e) => handleSpanClick(seg.changeIndex!, e)}
                    title="Click to see note"
                    className="rounded-[3px] cursor-pointer transition-[background,box-shadow] duration-[160ms]"
                    style={
                      isSelected
                        ? {
                            background: 'var(--brass-soft)',
                            boxShadow: '0 0 0 2px var(--brass-soft), 0 0 0 3.5px var(--brass)',
                          }
                        : isSaved
                        ? {
                            background: 'transparent',
                            textDecoration: 'underline',
                            textDecorationColor: 'var(--brass)',
                            textDecorationStyle: 'dashed' as const,
                            textDecorationThickness: '2px',
                            textUnderlineOffset: '3px',
                          }
                        : {
                            background: 'var(--leaf-soft)',
                            boxShadow: '0 0 0 2px var(--leaf-soft)',
                          }
                    }
                  >
                    {seg.text}
                  </span>
                )
              })}
            </p>
          ))}
        </div>

        {/* Copy footer */}
        <div className="border-t border-line px-4 py-[11px] flex items-center justify-between gap-3 bg-paper-2 shrink-0">
          <span className="font-serif italic text-[12.5px] text-ink-3">
            Your own words stay exactly as you wrote them.
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="hv-out border border-line-2 bg-card cursor-pointer font-sans text-[13px] text-ink
              px-[15px] py-2 rounded-lg"
          >
            {copyLabel}
          </button>
        </div>
      </div>

      {/* Popover */}
      {popover && (
        <VocabPopover
          anchorRect={popover.rect}
          fragment={popover.text}
          originalText={diffChanges[popover.changeIndex]?.original ?? ''}
          isSaved={savedChangeIndices.has(popover.changeIndex)}
          hasEnglishVoice={hasEnglishVoice}
          onCopy={handlePopoverCopy}
          onSound={handlePopoverSound}
          onSave={handlePopoverSave}
          onRemove={handlePopoverRemove}
          onClose={handlePopoverClose}
          paneRef={scrollRef}
        />
      )}
    </div>
  )
}
