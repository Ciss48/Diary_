import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import ThemeToggle from '@/components/ThemeToggle'
import StatsBar from '@/components/StatsBar'
import HeatmapCard from '@/components/HeatmapCard'
import { getTodayInTimezone } from '@/lib/dates'
import { computeStats, previousDay } from '@/lib/streaks'
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

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function formatGreetingDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayName = WEEKDAYS[dt.getUTCDay()]
  return `${dayName}, ${MONTHS_FULL[m - 1]} ${d}, ${y}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

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

  const year = isValidYear(rawYear, currentYear) ?? currentYear

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

  // Month dropdown options
  const mYear = Number(hmStr.slice(0, 4))
  const monthOptions = MONTHS_FULL.map((label, i) => {
    const val = `${mYear}-${String(i + 1).padStart(2, '0')}`
    return {
      value: val,
      label: `${label} ${mYear}`,
      disabled: val > currentMonth,
    }
  })

  // ── Beads for last 7 days ─────────────────────────────────────────────
  const byDate = new Map<string, EntryLite>()
  for (const e of entries) byDate.set(e.date, e)

  const beads: { state: 'ontime' | 'backfill' | 'empty'; label: string }[] = []
  let beadDate = today
  for (let i = 6; i >= 0; i--) {
    const d = i === 0 ? today : (() => {
      let dd = today
      for (let j = 0; j < i; j++) dd = previousDay(dd)
      return dd
    })()
    const entry = byDate.get(d)
    const m = Number(d.slice(5, 7)) - 1
    const day = Number(d.slice(8, 10))
    beads.push({
      state: entry ? (entry.isBackfill ? 'backfill' : 'ontime') : 'empty',
      label: `${SHORT[m]} ${day}`,
    })
  }
  // beads is built oldest-first (6 days ago → today) which matches the reference

  // ── Earliest date + longest range ─────────────────────────────────────
  const sortedDates = entries.map(e => e.date).sort()
  const earliestDate = sortedDates.length > 0 ? sortedDates[0] : null

  // Compute longest streak range for display
  const ontimeDates = entries
    .filter(e => !e.isBackfill)
    .map(e => e.date)
    .sort()

  let longestRange: string | null = null
  if (ontimeDates.length > 0 && stats.longestStreak > 0) {
    let bestLen = 0
    let bestStart = ''
    let bestEnd = ''
    let runLen = 1
    let runStart = ontimeDates[0]
    let prev = ontimeDates[0]

    for (let i = 1; i < ontimeDates.length; i++) {
      const d = ontimeDates[i]
      const expected = (() => {
        const [y, m, dd] = prev.split('-').map(Number)
        const ms = Date.UTC(y, m - 1, dd) + 86400000
        const dt = new Date(ms)
        return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
      })()
      if (d === expected) {
        runLen++
      } else {
        if (runLen > bestLen) {
          bestLen = runLen
          bestStart = runStart
          bestEnd = prev
        }
        runLen = 1
        runStart = d
      }
      prev = d
    }
    if (runLen > bestLen) {
      bestLen = runLen
      bestStart = runStart
      bestEnd = prev
    }

    if (bestLen > 1) {
      const [sy, sm, sd] = bestStart.split('-').map(Number)
      const [ey, em, ed] = bestEnd.split('-').map(Number)
      longestRange = `${SHORT[sm - 1]} ${sd} \u2013 ${SHORT[em - 1]} ${ed}, ${ey}`
    }
  }

  // ── Display name ──────────────────────────────────────────────────────
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? ''
  const dateLabel = formatGreetingDate(today).toUpperCase()
  const greeting = getGreeting()

  return (
    <div className="min-h-screen">
      <div
        className="an-rise max-w-[1500px] mx-auto px-[18px] sm:px-10 py-[22px] sm:py-[34px] pb-[60px] sm:pb-[72px] flex flex-col gap-[26px]"
      >
        {/* Header */}
        <div className="flex items-end justify-between gap-[18px] flex-wrap">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[10.5px] font-medium tracking-[.16em] text-ink-3 uppercase">
              {dateLabel}
            </span>
            <h1 className="m-0 font-serif text-[24px] sm:text-[31px] font-medium tracking-tight">
              {greeting}, {displayName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>

        {/* Stats */}
        <StatsBar
          stats={stats}
          beads={beads}
          earliestDate={earliestDate}
          longestRange={longestRange}
        />

        {/* Heatmap */}
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

        {/* CTA */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href={`/diary/${today}`}
            className="hv-lift inline-block border-0 cursor-pointer bg-wax text-white font-sans text-[14.5px] font-medium px-6 py-[14px] rounded-[11px] shadow-[var(--shadow-2)] hover:text-white"
          >
            Write today&apos;s entry
          </Link>
          <span className="font-serif italic text-[14px] text-ink-3">
            Keep the chain going — day {stats.currentStreak + 1} is one page away.
          </span>
        </div>
      </div>
    </div>
  )
}
