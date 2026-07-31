'use client'

import type { DiffChange } from '@/lib/diff'

const TYPE_LABELS: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  style: 'Style',
  spelling: 'Spelling',
}

const TYPE_COLORS: Record<string, string> = {
  grammar: 'bg-blue-100 text-blue-700',
  vocabulary: 'bg-purple-100 text-purple-700',
  style: 'bg-green-100 text-green-700',
  spelling: 'bg-red-100 text-red-700',
}

interface Props {
  changes: DiffChange[]
  feedback: string
  contentDrifted: boolean
  selectedChange: number | null
  onSelectChange: (idx: number) => void
}

export default function SuggestionDetails({
  changes,
  feedback,
  contentDrifted,
  selectedChange,
  onSelectChange,
}: Props) {
  return (
    <div className="space-y-4 mt-5">
      {contentDrifted && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
          Your entry has changed since this suggestion.
        </p>
      )}

      {changes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Changes
          </p>
          <ol className="space-y-2">
            {changes.map((change, idx) => (
              <li
                key={idx}
                onClick={() => onSelectChange(idx)}
                className={`rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  selectedChange === idx
                    ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  {change.original && (
                    <span className="text-sm text-gray-500 line-through shrink-0">
                      {change.original}
                    </span>
                  )}
                  <span className="text-sm text-gray-400 shrink-0">→</span>
                  <span className="text-sm font-medium text-gray-800 shrink-0">
                    {change.corrected}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      change.type ? (TYPE_COLORS[change.type] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {change.type ? (TYPE_LABELS[change.type] ?? change.type) : 'Change'}
                  </span>
                </div>
                {change.explanation && (
                  <p className="mt-1 text-xs text-gray-500">{change.explanation}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
            Feedback
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{feedback}</p>
        </div>
      )}
    </div>
  )
}
