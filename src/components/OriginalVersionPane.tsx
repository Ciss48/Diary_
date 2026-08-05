'use client'

import { useMemo } from 'react'
import type { Segment } from '@/lib/suggestions'

const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink-3/30 ' +
  '[scrollbar-width:thin]'

interface Props {
  segments: Segment[]
  selectedChange: number | null
  onSelectChange: (idx: number) => void
  onEdit: () => void
  wordCount: number
  stageLabel: string
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

export default function OriginalVersionPane({
  segments,
  selectedChange,
  onSelectChange,
  onEdit,
  wordCount,
  stageLabel,
}: Props) {
  const paragraphs = useMemo(() => splitIntoParagraphs(segments), [segments])

  return (
    <div className="flex flex-col h-[45vh] md:h-full min-h-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2 shrink-0">
        <span className="text-[10.5px] font-medium tracking-[.15em] text-ink-3 uppercase">
          {stageLabel}
        </span>
        <div className="flex items-baseline gap-3">
          <button
            onClick={onEdit}
            className="text-[12px] text-ink-3 hover:text-ink cursor-pointer bg-transparent border-0 font-sans underline underline-offset-2"
          >
            Edit
          </button>
          <span className="font-mono text-[12px] text-ink-3">
            {wordCount} words
          </span>
        </div>
      </div>

      {/* Paper surface with wax spine */}
      <div
        className="relative flex-1 min-h-0 flex flex-col rounded-[4px] bg-card border border-line shadow-[var(--shadow-2)] overflow-hidden"
        style={{ backgroundImage: 'var(--grain)' }}
      >
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-wax" />
        {/* Margin rule */}
        <span
          className="absolute top-0 bottom-0 w-px bg-wax opacity-[.22]"
          style={{ left: '30px' }}
        />

        {/* Scrollable text */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto pl-[44px] sm:pl-[44px] pr-[26px] py-[26px]
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
                            background: 'var(--wax-soft)',
                            boxShadow: '0 0 0 2px var(--wax-soft)',
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
      </div>
    </div>
  )
}
