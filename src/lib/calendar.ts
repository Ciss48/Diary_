import type { EntryLite, CellState, Mood } from './streaks'

export type YearCell = {
  date: string       // 'YYYY-MM-DD'
  inYear: boolean    // false = padding from adjacent year (render blank)
  state: CellState   // 'future' | 'empty' | 'ontime' | 'backfill'
  mood: Mood | null
  wordCount: number
}

export type MonthCell = {
  date: string       // 'YYYY-MM-DD'
  dayOfMonth: number // 1..31
  inMonth: boolean   // false = padding cell from adjacent month
  state: CellState   // 'future' | 'empty' | 'ontime' | 'backfill'
  mood: Mood | null
  wordCount: number
}

// ── helpers (shared) ──────────────────────────────────────────────────────

function formatUTCDate(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateToUTCMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// ── public functions ───────────────────────────────────────────────────────

/** True iff monthStr is exactly 'YYYY-MM' with month 01–12. */
export function isValidMonthString(monthStr: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return false
  const month = Number(monthStr.slice(5, 7))
  return month >= 1 && month <= 12
}

/** 'YYYY-MM' → previous month, handles year boundaries. */
export function previousMonth(monthStr: string): string {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))
  if (month === 1) {
    return `${year - 1}-12`
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`
}

/** 'YYYY-MM' → next month, handles year boundaries. */
export function nextMonth(monthStr: string): string {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))
  if (month === 12) {
    return `${year + 1}-01`
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/**
 * Build a 6-week × 7-day month grid (always exactly 42 cells).
 * - Weeks run Mon → Sun (consistent with HeatmapGrid).
 * - The first cell is the Monday of the week containing the 1st of monthStr.
 * - Padding cells (inMonth=false) still get proper state/mood.
 * - state: date > today → 'future'; entry present → 'ontime'/'backfill'; else → 'empty'.
 */
export function buildMonthGrid(
  entries: EntryLite[],
  monthStr: string,
  today: string
): MonthCell[][] {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7)) // 1-based

  // Build lookup by date
  const byDate = new Map<string, EntryLite>()
  for (const e of entries) {
    byDate.set(e.date, e)
  }

  // Find Monday of the week containing the 1st of this month
  const firstOfMonthMs = Date.UTC(year, month - 1, 1)
  const firstDow = new Date(firstOfMonthMs).getUTCDay() // 0=Sun..6=Sat
  // Days since Monday: Sun→6, Mon→0, Tue→1, ..., Sat→5
  const daysSinceMon = firstDow === 0 ? 6 : firstDow - 1
  const gridStartMs = firstOfMonthMs - daysSinceMon * 86400000

  const weeks: MonthCell[][] = []

  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellMs = gridStartMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const cellYear = new Date(cellMs).getUTCFullYear()
      const cellMonth = new Date(cellMs).getUTCMonth() + 1 // 1-based
      const dayOfMonth = new Date(cellMs).getUTCDate()
      const inMonth = cellYear === year && cellMonth === month

      const entry = byDate.get(dateStr)
      let state: CellState
      if (dateStr > today) {
        state = 'future'
      } else if (entry) {
        state = entry.isBackfill ? 'backfill' : 'ontime'
      } else {
        state = 'empty'
      }

      week.push({
        date: dateStr,
        dayOfMonth,
        inMonth,
        state,
        mood: entry?.mood ?? null,
        wordCount: entry?.wordCount ?? 0,
      })
    }
    weeks.push(week)
  }

  return weeks
}

// ── year grid ─────────────────────────────────────────────────────────────

/**
 * Build a year grid covering Jan 1 – Dec 31, with leading/trailing padding
 * from adjacent years so each row is a full Mon→Sun week.
 * Usually 53 weeks; can be 54 for leap years starting on Sunday (Mon-first).
 */
export function buildYearGrid(
  entries: EntryLite[],
  year: number,
  today: string
): YearCell[][] {
  const byDate = new Map<string, EntryLite>()
  for (const e of entries) byDate.set(e.date, e)

  // Monday of week containing Jan 1
  const jan1Ms = Date.UTC(year, 0, 1)
  const jan1Dow = new Date(jan1Ms).getUTCDay() // 0=Sun..6=Sat
  const daysSinceMon = jan1Dow === 0 ? 6 : jan1Dow - 1
  const gridStartMs = jan1Ms - daysSinceMon * 86400000

  // Sunday of week containing Dec 31
  const dec31Ms = Date.UTC(year, 11, 31)
  const dec31Dow = new Date(dec31Ms).getUTCDay()
  const daysUntilSun = dec31Dow === 0 ? 0 : 7 - dec31Dow
  const gridEndMs = dec31Ms + daysUntilSun * 86400000

  const totalDays = Math.round((gridEndMs - gridStartMs) / 86400000) + 1
  const totalWeeks = totalDays / 7

  const weeks: YearCell[][] = []
  for (let w = 0; w < totalWeeks; w++) {
    const week: YearCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellMs = gridStartMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const cellYear = new Date(cellMs).getUTCFullYear()
      const inYear = cellYear === year

      const entry = byDate.get(dateStr)
      let state: CellState
      if (dateStr > today) {
        state = 'future'
      } else if (entry) {
        state = entry.isBackfill ? 'backfill' : 'ontime'
      } else {
        state = 'empty'
      }

      week.push({
        date: dateStr,
        inYear,
        state,
        mood: entry?.mood ?? null,
        wordCount: entry?.wordCount ?? 0,
      })
    }
    weeks.push(week)
  }

  return weeks
}

/**
 * For each of the 12 months, return the 0-based week-column index where that
 * month's label should sit (the column of the first inYear cell in that month).
 */
export function monthLabelOffsets(
  weeks: YearCell[][]
): { month: number; weekIndex: number }[] {
  const result: { month: number; weekIndex: number }[] = []
  const seen = new Set<number>()

  for (let w = 0; w < weeks.length; w++) {
    for (const cell of weeks[w]) {
      if (!cell.inYear) continue
      const month = Number(cell.date.slice(5, 7)) - 1 // 0-based
      if (!seen.has(month)) {
        seen.add(month)
        result.push({ month, weekIndex: w })
      }
    }
  }

  return result.sort((a, b) => a.month - b.month)
}

/** Count entries and total words for a specific year. */
export function yearStats(
  entries: EntryLite[],
  year: number
): { entries: number; words: number } {
  const prefix = String(year)
  let count = 0
  let words = 0
  for (const e of entries) {
    if (e.date.slice(0, 4) === prefix) {
      count++
      words += e.wordCount
    }
  }
  return { entries: count, words }
}

/** Days in month + entry count for a 'YYYY-MM' string. */
export function monthStats(
  entries: EntryLite[],
  monthStr: string
): { daysInMonth: number; entries: number } {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  let count = 0
  for (const e of entries) {
    if (e.date.startsWith(monthStr)) {
      count++
    }
  }
  return { daysInMonth, entries: count }
}

/**
 * Validate and parse a year string. Returns the year if it's a 4-digit number
 * between 2020 and currentYear (inclusive), else null.
 */
export function isValidYear(
  raw: string | undefined,
  currentYear: number
): number | null {
  if (raw === undefined) return null
  if (!/^\d{4}$/.test(raw)) return null
  const year = Number(raw)
  if (year < 2020 || year > currentYear) return null
  return year
}
