'use client'

import { useState, useMemo } from 'react'
import type { Segment } from '@/lib/suggestions'

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
}: Props) {
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied ✓' | 'Copy failed'>('Copy')

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
          className={`flex-1 min-h-0 overflow-y-auto px-[26px] py-[26px] pl-[34px]
            font-serif text-[16.5px] sm:text-[17.5px] leading-[1.78] text-ink ${SCROLLBAR}`}
        >
          {paragraphs.map((para, pi) => (
            <p key={pi} className="m-0 mb-[18px] last:mb-0">
              {para.map((seg, si) =>
                seg.changeIndex !== null ? (
                  <span
                    key={si}
                    onClick={() => onSelectChange(seg.changeIndex!)}
                    title="Click to see note"
                    className="rounded-[3px] cursor-pointer transition-[background,box-shadow] duration-[160ms]"
                    style={
                      selectedChange === seg.changeIndex
                        ? {
                            background: 'var(--brass-soft)',
                            boxShadow: '0 0 0 2px var(--brass-soft), 0 0 0 3.5px var(--brass)',
                          }
                        : {
                            background: 'var(--leaf-soft)',
                            boxShadow: '0 0 0 2px var(--leaf-soft)',
                          }
                    }
                  >
                    {seg.text}
                  </span>
                ) : (
                  <span key={si}>{seg.text}</span>
                )
              )}
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
    </div>
  )
}
