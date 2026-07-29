import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import StatsBar from '@/components/StatsBar'
import HeatmapGrid from '@/components/HeatmapGrid'
import MonthCalendar from '@/components/MonthCalendar'
import { getTodayInTimezone } from '@/lib/dates'
import { computeStats, buildHeatmapWeeks } from '@/lib/streaks'
import type { EntryLite } from '@/lib/streaks'
import { isValidMonthString, monthOf, buildMonthGrid } from '@/lib/calendar'

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

  // Resolve month from URL, validate, clamp future
  const params = await searchParams
  const rawMonth = typeof params.month === 'string' ? params.month : undefined
  let monthStr: string
  if (rawMonth && isValidMonthString(rawMonth) && rawMonth <= currentMonth) {
    monthStr = rawMonth
  } else {
    monthStr = currentMonth
  }

  const canGoNext = monthStr < currentMonth

  const { data: rows } = await supabase
    .from('entries')
    .select('entry_date, is_backfill, word_count, mood')

  const entries: EntryLite[] = (rows ?? []).map((r) => ({
    date: r.entry_date as string,
    isBackfill: r.is_backfill as boolean,
    wordCount: r.word_count as number,
    mood: (r.mood as EntryLite['mood']) ?? null,
  }))

  const stats = computeStats(entries, today)
  const weeks = buildHeatmapWeeks(entries, today, 53)
  const monthGrid = buildMonthGrid(entries, monthStr, today)

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

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <StatsBar stats={stats} />

        <section>
          <h2 className="text-sm font-medium text-stone-500 mb-3">
            Last 53 weeks
          </h2>
          <HeatmapGrid weeks={weeks} today={today} />
        </section>

        <MonthCalendar
          weeks={monthGrid}
          monthStr={monthStr}
          today={today}
          canGoNext={canGoNext}
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
