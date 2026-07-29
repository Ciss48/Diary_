import Link from 'next/link'
import { previousMonth, nextMonth } from '@/lib/calendar'
import type { MonthCell } from '@/lib/calendar'

interface Props {
  weeks: MonthCell[][]
  monthStr: string   // 'YYYY-MM'
  today: string      // 'YYYY-MM-DD'
  canGoNext: boolean
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  )
}

function cellClasses(cell: MonthCell, today: string): string {
  const base = 'relative aspect-square rounded p-1 text-xs font-medium leading-none'

  let state = ''
  switch (cell.state) {
    case 'future':
      state = 'bg-stone-50 text-stone-300'
      break
    case 'empty':
      state = 'bg-white border border-stone-200 text-stone-600'
      break
    case 'ontime':
      state = 'bg-emerald-50 border border-emerald-400 text-emerald-900'
      break
    case 'backfill':
      state = 'bg-emerald-50/60 border border-dashed border-emerald-400 text-emerald-900'
      break
  }

  const opacity = cell.inMonth ? '' : 'opacity-40'
  const ring = cell.date === today ? 'ring-2 ring-amber-500' : ''

  return [base, state, opacity, ring].filter(Boolean).join(' ')
}

function MoodDot({ mood }: { mood: MonthCell['mood'] }) {
  if (!mood || mood === 'normal') return null
  const color = mood === 'happy' ? 'bg-amber-400' : 'bg-blue-400'
  return (
    <span
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <span className={`h-3 w-3 rounded-full ${color}`} />
    </span>
  )
}

export default function MonthCalendar({ weeks, monthStr, today, canGoNext }: Props) {
  const prev = previousMonth(monthStr)
  const next = nextMonth(monthStr)

  return (
    <section>
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/?month=${prev}`}
          className="text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100 transition-colors text-sm font-medium"
          aria-label="Previous month"
        >
          ‹
        </Link>
        <h2 className="text-sm font-medium text-stone-600">
          {monthLabel(monthStr)}
        </h2>
        {canGoNext ? (
          <Link
            href={`/?month=${next}`}
            className="text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100 transition-colors text-sm font-medium"
            aria-label="Next month"
          >
            ›
          </Link>
        ) : (
          <span
            className="text-stone-300 px-2 py-1 text-sm font-medium cursor-not-allowed"
            aria-disabled="true"
            aria-label="Next month (unavailable)"
          >
            ›
          </span>
        )}
      </div>

      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DOW_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[10px] font-medium text-stone-400 py-0.5"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((cell) => {
          const cls = cellClasses(cell, today)
          const content = (
            <>
              <span>{cell.dayOfMonth}</span>
              <MoodDot mood={cell.mood} />
            </>
          )

          if (cell.state === 'future') {
            return (
              <div key={cell.date} className={cls}>
                {content}
              </div>
            )
          }

          return (
            <Link
              key={cell.date}
              href={`/diary/${cell.date}`}
              className={cls}
              title={cell.date}
            >
              {content}
            </Link>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-stone-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-stone-200 bg-white" />
          No entry
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-emerald-400 bg-emerald-50" />
          On time
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-dashed border-emerald-400 bg-emerald-50/60" />
          Backfilled
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-stone-50" />
          Future
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
          Happy
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-400" />
          Sad
        </span>
        <span className="text-stone-400">(Normal = no dot)</span>
      </div>
    </section>
  )
}
