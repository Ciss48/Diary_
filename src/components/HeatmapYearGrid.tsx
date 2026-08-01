import Link from 'next/link'
import type { YearCell } from '@/lib/calendar'

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Props = {
  weeks: YearCell[][]
  labelOffsets: { month: number; weekIndex: number }[]
  today: string
}

export default function HeatmapYearGrid({ weeks, labelOffsets, today }: Props) {
  const weekCount = weeks.length
  const cells = weeks.flat()

  return (
    <div className="an-rise flex flex-col gap-[7px] overflow-x-auto">
      {/* Month labels */}
      <div className="flex gap-[9px] min-w-[720px]">
        <div className="w-[30px] shrink-0" />
        <div
          className="flex-1 grid text-[10.5px] tracking-[.06em] text-ink-3"
          style={{ gridTemplateColumns: `repeat(${weekCount}, 1fr)` }}
        >
          {labelOffsets.map(({ month, weekIndex }) => (
            <span
              key={month}
              style={{ gridRow: 1, gridColumn: `${weekIndex + 1} / span 4` }}
            >
              {SHORT[month]}
            </span>
          ))}
        </div>
      </div>

      {/* Grid with weekday labels */}
      <div className="flex gap-[9px] min-w-[720px]">
        <div className="w-[30px] shrink-0 grid grid-rows-7 gap-[3px] text-[10px] text-ink-3 items-center">
          {['MON', '', 'WED', '', 'FRI', '', 'SUN'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div
          className="flex-1 grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridAutoColumns: '1fr' }}
        >
          {cells.map((cell, i) => {
            if (!cell.inYear) {
              return <div key={i} />
            }

            const isToday = cell.date === today
            const isFuture = cell.state === 'future'

            const style: React.CSSProperties = {
              background:
                isFuture ? 'var(--future)' :
                cell.state === 'ontime' ? 'var(--leaf)' :
                cell.state === 'backfill' ? 'var(--backfill-fill)' :
                'var(--empty)',
              border: isFuture ? '1px dashed var(--line-2)' : '1px solid transparent',
              boxShadow: isToday ? '0 0 0 2px var(--brass)' : 'none',
              cursor: isFuture ? 'default' : 'pointer',
              opacity: isFuture ? 0.6 : 1,
            }

            const m = Number(cell.date.slice(5, 7)) - 1
            const d = Number(cell.date.slice(8, 10))
            const tip = `${SHORT[m]} ${d}, ${cell.date.slice(0, 4)}` +
              (cell.state === 'ontime' ? ` · ${cell.wordCount} words · on time` :
               cell.state === 'backfill' ? ` · ${cell.wordCount} words · backfilled` :
               isFuture ? ' · upcoming' : ' · no entry')

            const el = (
              <div
                className="hv-cell aspect-square rounded-[3.5px] box-border"
                style={style}
                title={tip}
              />
            )

            if (isFuture) {
              return <div key={i} className="pointer-events-none">{el}</div>
            }

            return (
              <Link key={i} href={`/diary/${cell.date}`} className="block">
                {el}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
