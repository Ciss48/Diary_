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
    <div className="an-rise flex flex-col gap-2">
      {/* DOW headers */}
      <div className="grid grid-cols-7 gap-[5px] sm:gap-[9px] text-[10.5px] font-medium tracking-[.1em] text-ink-3">
        {DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-[5px] sm:gap-[9px]">
        {cells.map((cell, i) => {
          if (!cell.inMonth) {
            return <div key={i} />
          }

          const isToday = cell.date === today
          const isFuture = cell.state === 'future'
          const hasEntry = cell.state === 'ontime' || cell.state === 'backfill'

          const bg =
            isFuture ? 'var(--future)' :
            cell.state === 'ontime' ? 'var(--leaf)' :
            cell.state === 'backfill' ? 'var(--backfill-fill)' :
            'var(--empty)'

          const dayColor = hasEntry ? '#f3f7f3' : 'var(--ink-2)'
          const metaColor = hasEntry ? 'rgba(243,247,243,.8)' : 'var(--ink-3)'
          const meta = hasEntry ? `${cell.wordCount}w` : isFuture ? '' : '\u2014'

          // Mood dot
          let moodBg = 'transparent'
          let moodBorder = '0'
          if (cell.mood === 'happy') {
            moodBg = 'var(--brass)'
          } else if (cell.mood === 'normal') {
            moodBg = hasEntry ? '#f3f7f3' : 'transparent'
          } else if (cell.mood === 'sad') {
            moodBorder = hasEntry ? '1.4px solid rgba(243,247,243,.85)' : '0'
          }
          const showMoodDot = cell.mood === 'happy' || cell.mood === 'sad' || (cell.mood === 'normal' && hasEntry)

          const tip = `${cell.date}` +
            (cell.state === 'ontime' ? ` · ${cell.wordCount} words · on time` :
             cell.state === 'backfill' ? ` · ${cell.wordCount} words · backfilled` :
             isFuture ? ' · upcoming' : ' · no entry') +
            (cell.mood ? ` · ${cell.mood}` : '')

          const inner = (
            <div
              className="hv-day aspect-square sm:aspect-[1.25] rounded-[10px] box-border p-[6px] sm:p-[9px] flex flex-col justify-between relative"
              style={{
                background: bg,
                border: isFuture ? '1px dashed var(--line-2)' : '1px solid transparent',
                boxShadow: isToday ? '0 0 0 2px var(--brass)' : 'none',
                cursor: isFuture ? 'default' : 'pointer',
                opacity: isFuture ? 0.6 : 1,
              }}
              title={tip}
            >
              <span
                className="font-mono text-[12px] sm:text-[14px] font-medium"
                style={{ color: dayColor }}
              >
                {cell.dayOfMonth}
              </span>
              {showMoodDot && (
                <span
                  className="absolute top-[6px] right-[6px] sm:top-[9px] sm:right-[9px] w-[7px] h-[7px] rounded-full box-border"
                  style={{ background: moodBg, border: moodBorder }}
                />
              )}
              <span
                className="font-mono text-[10.5px]"
                style={{ color: metaColor }}
              >
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
