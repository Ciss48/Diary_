import Link from 'next/link'
import type { MonthCell } from '@/lib/calendar'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

type Props = {
  weeks: MonthCell[][]
  today: string
}

export default function HeatmapMonthGrid({ weeks, today }: Props) {
  const cells = weeks.flat()

  return (
    <div className="flex flex-col gap-2">
      {/* DOW headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-[10px] sm:text-[11.5px] font-medium text-stone-400 tracking-wide">
        {DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell, i) => {
          if (!cell.inMonth) {
            return <div key={i} className="aspect-[1.35]" />
          }

          const isToday = cell.date === today
          const isFuture = cell.state === 'future'

          const bg =
            isFuture ? 'bg-stone-50' :
            cell.state === 'ontime' ? 'bg-emerald-500' :
            cell.state === 'backfill' ? 'bg-emerald-300' :
            'bg-stone-200'

          const border = isFuture ? 'border border-stone-200' : ''
          const opacity = isFuture ? 'opacity-55' : ''
          const ring = isToday ? 'ring-2 ring-amber-500' : ''

          const dayColor =
            cell.state === 'ontime' ? 'text-white' :
            isFuture ? 'text-stone-300' :
            'text-stone-800'

          const metaColor =
            cell.state === 'ontime' ? 'text-white/80' :
            cell.state === 'backfill' ? 'text-emerald-900/70' :
            'text-stone-400'

          const meta =
            (cell.state === 'ontime' || cell.state === 'backfill')
              ? `${cell.wordCount}w`
              : isFuture ? '' : '\u2014'

          const moodDot =
            cell.mood === 'happy' ? 'bg-amber-400' :
            cell.mood === 'sad' ? 'bg-blue-400' :
            null

          const tip = `${cell.date}${
            cell.state === 'ontime' ? ` · ${cell.wordCount} words` :
            cell.state === 'backfill' ? ` · ${cell.wordCount} words (backfilled)` :
            isFuture ? ' · upcoming' : ' · no entry'
          }`

          const inner = (
            <div
              className={`aspect-[1.35] rounded-[9px] ${bg} ${border} ${opacity} ${ring} box-border p-1.5 sm:p-2.5 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md`}
              title={tip}
            >
              <div className="flex items-start justify-between">
                <span className={`text-[11px] sm:text-[13px] font-semibold ${dayColor}`}>
                  {cell.dayOfMonth}
                </span>
                {moodDot && (
                  <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${moodDot} shrink-0`} />
                )}
              </div>
              <span className={`text-[9px] sm:text-[11px] ${metaColor} truncate`}>
                {meta}
              </span>
            </div>
          )

          if (isFuture) {
            return <div key={i} className="pointer-events-none">{inner}</div>
          }

          return (
            <Link key={i} href={`/diary/${cell.date}`} className="block">
              {inner}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
