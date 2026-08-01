import type { Stats } from '@/lib/streaks'

type Bead = {
  state: 'ontime' | 'backfill' | 'empty'
  label: string
}

type Props = {
  stats: Stats
  beads: Bead[]
  earliestDate: string | null
  longestRange: string | null
}

const LABEL = 'text-[10.5px] font-medium tracking-[.15em] text-ink-3 uppercase'
const BIG = 'font-mono text-[34px] sm:text-[44px] font-bold leading-[.9] tracking-tight'
const SUB = 'font-serif italic text-[11.5px] text-ink-3'

export default function StatsBar({ stats, beads, earliestDate, longestRange }: Props) {
  const totalWordsStr = stats.totalWords.toLocaleString()
  const sinceLabel = earliestDate
    ? `since ${formatShortDate(earliestDate)}`
    : ''

  return (
    <div className="relative rounded-2xl overflow-hidden bg-card border border-line shadow-[var(--shadow-2)]">
      {/* Wax spine */}
      <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-wax" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line">
        {/* Current Streak */}
        <div className="bg-card px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-2">
          <span className={LABEL}>Current Streak</span>
          <div className="flex items-baseline gap-2">
            <span className={`${BIG} text-wax`}>{stats.currentStreak}</span>
            <span className="font-serif italic text-[15px] text-ink-3">days</span>
          </div>
          <div className="flex items-center gap-1">
            {beads.map((b, i) => (
              <span
                key={i}
                title={b.label}
                className="w-[11px] h-[11px] rounded-[3px]"
                style={{
                  background:
                    b.state === 'ontime'
                      ? 'var(--leaf)'
                      : b.state === 'backfill'
                        ? 'var(--backfill-fill)'
                        : 'var(--empty)',
                  boxShadow:
                    i === beads.length - 1
                      ? '0 0 0 1.5px var(--brass)'
                      : 'none',
                }}
              />
            ))}
            <span className="text-[11px] text-ink-3 ml-1">last 7</span>
          </div>
        </div>

        {/* Longest Streak */}
        <div className="bg-card px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-2">
          <span className={LABEL}>Longest Streak</span>
          <div className="flex items-baseline gap-2">
            <span className={BIG}>{stats.longestStreak}</span>
            <span className="font-serif italic text-[15px] text-ink-3">days</span>
          </div>
          {longestRange && <span className={SUB}>{longestRange}</span>}
        </div>

        {/* Total Entries */}
        <div className="bg-card px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-2">
          <span className={LABEL}>Total Entries</span>
          <span className={BIG}>{stats.totalEntries}</span>
          {sinceLabel && <span className={SUB}>{sinceLabel}</span>}
        </div>

        {/* Total Words */}
        <div className="bg-card px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-2">
          <span className={LABEL}>Total Words</span>
          <span className={BIG}>{totalWordsStr}</span>
          <span className={SUB}>
            {stats.totalWords >= 40000
              ? '≈ a short novel'
              : stats.totalWords >= 10000
                ? '≈ a long essay'
                : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function formatShortDate(dateStr: string): string {
  const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m] = dateStr.split('-').map(Number)
  return `${SHORT[m - 1]} ${y}`
}
