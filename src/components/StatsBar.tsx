import type { Stats } from '@/lib/streaks'

type Props = {
  stats: Stats
}

export default function StatsBar({ stats }: Props) {
  const items = [
    { label: 'Current streak', value: stats.currentStreak, unit: 'days' },
    { label: 'Longest streak', value: stats.longestStreak, unit: 'days' },
    { label: 'Total entries',  value: stats.totalEntries,  unit: 'entries' },
    { label: 'Total words',    value: stats.totalWords,    unit: 'words' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, unit }) => (
        <div
          key={label}
          className="bg-white border border-stone-200 rounded-xl px-4 py-4 text-center"
        >
          <div className="text-3xl font-bold text-stone-900 tabular-nums">
            {value.toLocaleString()}
          </div>
          <div className="text-xs text-stone-500 mt-1">{label}</div>
          <div className="text-xs text-stone-400">{unit}</div>
        </div>
      ))}
    </div>
  )
}
