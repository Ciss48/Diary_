'use client'

import { useState } from 'react'
import type { Segment } from '@/lib/suggestions'

// Thin, muted scrollbar — applied to both panes so they look matched.
// Webkit: 6px track, transparent background, rounded gray thumb.
// Firefox: thin system scrollbar via scrollbar-width.
const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 ' +
  '[scrollbar-width:thin]'

interface Props {
  segments: Segment[]
  changesCount: number
  correctedVersion: string
  selectedChange: number | null
  onSelectChange: (idx: number) => void
  onDismiss: () => void
}

export default function ImprovedVersionPane({
  segments,
  changesCount,
  correctedVersion,
  selectedChange,
  onSelectChange,
  onDismiss,
}: Props) {
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied' | 'Copy failed'>('Copy')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(correctedVersion)
      setCopyLabel('Copied')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    } catch {
      setCopyLabel('Copy failed')
      setTimeout(() => setCopyLabel('Copy'), 3000)
    }
  }

  return (
    // Mobile: own fixed height (45vh). Desktop: fills the two-column wrapper (h-full).
    <div className="flex flex-col h-[45vh] md:h-full min-h-0">
      {/* Column header — fixed height, does not flex */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Improved Version
          </span>
          {changesCount > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {changesCount} {changesCount === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss improved version"
          className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2 shrink-0"
        >
          ×
        </button>
      </div>

      {/* Scrollable text — fills remaining height, never grows the page */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto rounded-lg border border-gray-200 bg-white
                    px-5 py-4 text-gray-800 text-base leading-relaxed whitespace-pre-wrap ${SCROLLBAR}`}
      >
        {segments.map((seg, idx) =>
          seg.changeIndex !== null ? (
            <mark
              key={idx}
              onClick={() => onSelectChange(seg.changeIndex!)}
              className={`rounded px-0.5 cursor-pointer transition-colors ${
                selectedChange === seg.changeIndex
                  ? 'bg-emerald-300'
                  : 'bg-emerald-100 hover:bg-emerald-200'
              }`}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={idx}>{seg.text}</span>
          )
        )}
      </div>

      {/* Footer: Copy button */}
      <div className="mt-2 shrink-0 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white
                     text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          {copyLabel === 'Copied' ? 'Copied ✓' : copyLabel === 'Copy failed' ? 'Copy failed' : 'Copy'}
        </button>
        {copyLabel === 'Copy failed' && (
          <span className="text-xs text-gray-400">Select the text manually.</span>
        )}
      </div>
    </div>
  )
}
