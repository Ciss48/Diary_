import Link from 'next/link'
import type { HeatmapCell } from '@/lib/streaks'

type Props = {
  weeks: HeatmapCell[][]
  today: string
}

const STATE_CLASSES: Record<HeatmapCell['state'], string> = {
  empty:    'bg-stone-200',
  ontime:   'bg-emerald-500',
  backfill: 'bg-emerald-300',
  future:   'bg-stone-100 opacity-40 pointer-events-none',
}

function cellTitle(cell: HeatmapCell): string {
  if (cell.state === 'future') return cell.date
  if (cell.wordCount > 0) return `${cell.date} — ${cell.wordCount} words`
  return `${cell.date} — no entry`
}

export default function HeatmapGrid({ weeks, today }: Props) {
  return (
    <div>
      {/* Mobile: scroll horizontally with fixed-size cells. Desktop: fluid grid, no scroll. */}
      <div className="overflow-x-auto pb-2 md:overflow-visible">
        <div
          className="
            grid grid-flow-col grid-rows-7
            gap-[3px] w-max
            md:w-full md:grid-cols-[repeat(53,minmax(0,1fr))] md:gap-[2px]
          "
        >
          {weeks.map((week, wi) =>
            week.map((cell, di) => {
              const isToday = cell.date === today
              const base = [
                'aspect-square rounded-[2px]',
                'w-3 md:w-auto',
                STATE_CLASSES[cell.state],
                isToday ? 'ring-1 ring-amber-500' : '',
              ].filter(Boolean).join(' ')

              if (cell.state === 'future') {
                return (
                  <div
                    key={`${wi}-${di}`}
                    className={base}
                    title={cell.date}
                  />
                )
              }

              return (
                <Link
                  key={`${wi}-${di}`}
                  href={`/diary/${cell.date}`}
                  className={base}
                  title={cellTitle(cell)}
                />
              )
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-stone-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[2px] bg-stone-200 inline-block" />
          No entry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[2px] bg-emerald-500 inline-block" />
          Written on time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[2px] bg-emerald-300 inline-block" />
          Backfilled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[2px] bg-stone-100 opacity-40 inline-block" />
          Future
        </span>
      </div>
    </div>
  )
}
