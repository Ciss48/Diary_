export type Mood = 'happy' | 'normal' | 'sad'

export type EntryLite = {
  date: string        // 'YYYY-MM-DD'
  isBackfill: boolean
  wordCount: number
  mood?: Mood | null  // optional — existing tests need no change
}

export type CellState = 'future' | 'empty' | 'ontime' | 'backfill'

export type HeatmapCell = {
  date: string        // 'YYYY-MM-DD'
  state: CellState
  wordCount: number   // 0 nếu không có entry
}

export type Stats = {
  currentStreak: number
  longestStreak: number
  totalEntries: number
  totalWords: number
}

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

/** Lùi 1 ngày trên chuỗi 'YYYY-MM-DD'. Thuần lịch, KHÔNG dính timezone:
 *  parse bằng Date.UTC(y, m-1, d), trừ 86400000, format lại bằng các getUTC*.
 *  Phải đúng qua ranh giới tháng, năm và năm nhuận. */
export function previousDay(dateStr: string): string {
  return formatUTCDate(dateToUTCMs(dateStr) - 86400000)
}

/** Tiến 1 ngày, cùng nguyên tắc như previousDay. */
export function nextDay(dateStr: string): string {
  return formatUTCDate(dateToUTCMs(dateStr) + 86400000)
}

/** Tính toàn bộ chỉ số.
 *  LUẬT (đã chốt trong plan.md, không được diễn giải khác):
 *  - Chỉ ngày có entry với isBackfill === false mới tính vào streak.
 *  - Ngày có entry backfill được đối xử Y HỆT ngày trống khi tính streak
 *    (tức là nó LÀM ĐỨT chuỗi).
 *  - currentStreak: nếu `today` là ngày on-time thì đếm lùi từ `today`;
 *    nếu không, đếm lùi từ previousDay(today). Nghĩa là hôm nay chưa viết
 *    thì chuỗi CHƯA đứt (đang ở trạng thái chờ).
 *  - longestStreak: chuỗi on-time liên tiếp dài nhất trong toàn bộ lịch sử.
 *  - totalEntries: đếm TẤT CẢ entries (kể cả backfill).
 *  - totalWords: tổng wordCount của TẤT CẢ entries.
 *  - Hàm phải tự sort đầu vào; không giả định entries đã sắp xếp.
 */
export function computeStats(entries: EntryLite[], today: string): Stats {
  const totalEntries = entries.length
  const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0)

  // Build lookup map for O(1) access
  const byDate = new Map<string, EntryLite>()
  for (const e of entries) {
    byDate.set(e.date, e)
  }

  // currentStreak: start from today if on-time, else from yesterday
  const todayEntry = byDate.get(today)
  const startDay =
    todayEntry && !todayEntry.isBackfill ? today : previousDay(today)

  let currentStreak = 0
  let cur = startDay
  while (true) {
    const e = byDate.get(cur)
    if (e && !e.isBackfill) {
      currentStreak++
      cur = previousDay(cur)
    } else {
      break
    }
  }

  // longestStreak: sort on-time dates ascending, find longest consecutive run
  const ontimeDates = entries
    .filter((e) => !e.isBackfill)
    .map((e) => e.date)
    .sort()

  let longestStreak = 0
  let runLen = 0
  let prevDate: string | null = null
  for (const date of ontimeDates) {
    if (prevDate !== null && date === nextDay(prevDate)) {
      runLen++
    } else {
      runLen = 1
    }
    if (runLen > longestStreak) longestStreak = runLen
    prevDate = date
  }

  return { currentStreak, longestStreak, totalEntries, totalWords }
}

/** Dựng lưới heatmap.
 *  - Trả về mảng các TUẦN, cũ → mới. Mỗi tuần là mảng 7 ô, thứ Hai → Chủ Nhật
 *    (quy ước Việt Nam, KHÔNG dùng Chủ Nhật đầu tuần kiểu GitHub).
 *  - Lưới kết thúc ở tuần chứa `today`. Với weeks = 53, ô đầu tiên là thứ Hai
 *    của tuần cách tuần hiện tại 52 tuần.
 *  - Ô có date > today → state 'future'.
 *  - Ô có entry: 'ontime' nếu isBackfill === false, ngược lại 'backfill'.
 *  - Ô không có entry và không phải tương lai → 'empty'.
 */
export function buildHeatmapWeeks(
  entries: EntryLite[],
  today: string,
  weeks: number
): HeatmapCell[][] {
  const byDate = new Map<string, EntryLite>()
  for (const e of entries) {
    byDate.set(e.date, e)
  }

  // Find Monday of today's week
  const todayMs = dateToUTCMs(today)
  const todayDow = new Date(todayMs).getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  // Days since Monday: Sun→6, Mon→0, Tue→1, ..., Sat→5
  const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1
  const currentWeekMonMs = todayMs - daysSinceMonday * 86400000

  // Grid starts at Monday (weeks-1) full weeks before currentWeekMon
  const startMs = currentWeekMonMs - (weeks - 1) * 7 * 86400000

  const result: HeatmapCell[][] = []

  for (let w = 0; w < weeks; w++) {
    const week: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellMs = startMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const entry = byDate.get(dateStr)

      let state: CellState
      if (dateStr > today) {
        state = 'future'
      } else if (entry) {
        state = entry.isBackfill ? 'backfill' : 'ontime'
      } else {
        state = 'empty'
      }

      week.push({ date: dateStr, state, wordCount: entry?.wordCount ?? 0 })
    }
    result.push(week)
  }

  return result
}
