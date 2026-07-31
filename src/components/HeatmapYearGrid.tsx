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
    <div className="flex flex-col gap-2 overflow-x-auto">
      {/* Month labels */}
      <div className="flex gap-2.5 min-w-[640px]">
        <div className="w-7 shrink-0" />
        <div
          className="flex-1 grid text-[11px] text-stone-400"
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
      <div className="flex gap-2.5 min-w-[640px]">
        <div className="w-7 shrink-0 grid grid-rows-7 gap-[3px] text-[10.5px] text-stone-400">
          {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
            <span key={i} className="leading-none">{d}</span>
          ))}
        </div>
        <div
          className="flex-1 grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridAutoColumns: '1fr' }}
        >
          {cells.map((cell, i) => {
            if (!cell.inYear) {
              return <div key={i} className="aspect-square" />
            }

            const isToday = cell.date === today

            const bg =
              cell.state === 'future' ? 'bg-stone-100 opacity-40' :
              cell.state === 'ontime' ? 'bg-emerald-500' :
              cell.state === 'backfill' ? 'bg-emerald-300' :
              'bg-stone-200'

            const ring = isToday ? 'ring-1 ring-amber-500' : ''

            const m = Number(cell.date.slice(5, 7)) - 1
            const d = Number(cell.date.slice(8, 10))
            const tip = `${SHORT[m]} ${d}, ${cell.date.slice(0, 4)}` +
              (cell.state === 'ontime' ? ` · ${cell.wordCount} words` :
               cell.state === 'backfill' ? ` · ${cell.wordCount} words (backfilled)` :
               cell.state === 'future' ? ' · upcoming' : ' · no entry')

            const el = (
              <div
                className={`aspect-square rounded-[3px] ${bg} ${ring} box-border transition-transform duration-100 hover:scale-[1.35]`}
                title={tip}
              />
            )

            if (cell.state === 'future') {
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
