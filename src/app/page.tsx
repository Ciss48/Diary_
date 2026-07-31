import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import StatsBar from '@/components/StatsBar'
import HeatmapCard from '@/components/HeatmapCard'
import { getTodayInTimezone } from '@/lib/dates'
import { computeStats } from '@/lib/streaks'
import type { EntryLite } from '@/lib/streaks'
import {
  isValidMonthString,
  monthOf,
  buildMonthGrid,
  buildYearGrid,
  monthLabelOffsets,
  yearStats,
  monthStats,
  isValidYear,
} from '@/lib/calendar'

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, timezone')
    .eq('id', user.id)
    .single()

  const tz = profile?.timezone ?? 'Asia/Ho_Chi_Minh'
  const today = getTodayInTimezone(tz)
  const currentMonth = monthOf(today)
  const currentYear = Number(today.slice(0, 4))

  // ── Parse URL params ──────────────────────────────────────────────────
  const params = await searchParams
  const rawHView = typeof params.hview === 'string' ? params.hview : undefined
  const rawYear = typeof params.y === 'string' ? params.y : undefined
  const rawHm = typeof params.hm === 'string' ? params.hm : undefined

  const mode: 'year' | 'month' = rawHView === 'month' ? 'month' : 'year'

  // Year mode: validate & clamp
  const year = isValidYear(rawYear, currentYear) ?? currentYear

  // Month mode: validate & clamp
  let hmStr: string
  if (rawHm && isValidMonthString(rawHm) && rawHm <= currentMonth) {
    hmStr = rawHm
  } else {
    hmStr = currentMonth
  }

  // ── Fetch entries ─────────────────────────────────────────────────────
  const { data: rows } = await supabase
    .from('entries')
    .select('entry_date, is_backfill, word_count, mood')

  const entries: EntryLite[] = (rows ?? []).map((r) => ({
    date: r.entry_date as string,
    isBackfill: r.is_backfill as boolean,
    wordCount: r.word_count as number,
    mood: (r.mood as EntryLite['mood']) ?? null,
  }))

  // ── Compute derived data ──────────────────────────────────────────────
  const stats = computeStats(entries, today)

  // Year grid
  const yGrid = buildYearGrid(entries, year, today)
  const yLabels = monthLabelOffsets(yGrid)
  const yStats = yearStats(entries, year)

  // Month grid
  const mGrid = buildMonthGrid(entries, hmStr, today)
  const mStats = monthStats(entries, hmStr)

  // Month dropdown options (12 months of the viewed month's year)
  const mYear = Number(hmStr.slice(0, 4))
  const monthOptions = MONTHS_FULL.map((label, i) => {
    const val = `${mYear}-${String(i + 1).padStart(2, '0')}`
    return {
      value: val,
      label: `${label} ${mYear}`,
      disabled: val > currentMonth,
    }
  })

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Diary</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt=""
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-gray-700">
              {profile?.display_name ?? user.email}
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="max-w-[1160px] mx-auto px-6 py-10 space-y-6">
        <StatsBar stats={stats} />

        <HeatmapCard
          mode={mode}
          yearGrid={yGrid}
          yearLabelOffsets={yLabels}
          year={year}
          currentYear={currentYear}
          yearEntryCount={yStats.entries}
          monthGrid={mGrid}
          monthStr={hmStr}
          today={today}
          monthDays={mStats.daysInMonth}
          monthEntryCount={mStats.entries}
          monthOptions={monthOptions}
          currentMonth={currentMonth}
        />

        <Link
          href={`/diary/${today}`}
          className="inline-block bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
        >
          Write today&apos;s entry
        </Link>
      </div>
    </main>
  )
}
