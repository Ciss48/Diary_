import type { EntryLite, CellState, Mood } from './streaks'

export type MonthCell = {
  date: string       // 'YYYY-MM-DD'
  dayOfMonth: number // 1..31
  inMonth: boolean   // false = padding cell from adjacent month
  state: CellState   // 'future' | 'empty' | 'ontime' | 'backfill'
  mood: Mood | null
  wordCount: number
}

// ── helpers ────────────────────────────────────────────────────────────────

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
