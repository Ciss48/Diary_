// Test script cho src/lib/streaks.ts — node thuần, không cần test framework
// Chạy: node scripts/test_streaks.mjs

import assert from 'node:assert/strict'

// ── Reimplementation (phải khớp 1:1 với streaks.ts) ─────────────────────────

function formatUTCDate(ms) {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateToUTCMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function previousDay(dateStr) {
  return formatUTCDate(dateToUTCMs(dateStr) - 86400000)
}

function nextDay(dateStr) {
  return formatUTCDate(dateToUTCMs(dateStr) + 86400000)
}

function computeStats(entries, today) {
  const totalEntries = entries.length
  const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0)

  const byDate = new Map()
  for (const e of entries) byDate.set(e.date, e)

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

  const ontimeDates = entries
    .filter((e) => !e.isBackfill)
    .map((e) => e.date)
    .sort()

  let longestStreak = 0
  let runLen = 0
  let prevDate = null
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

function buildHeatmapWeeks(entries, today, weeks) {
  const byDate = new Map()
  for (const e of entries) byDate.set(e.date, e)

  const todayMs = dateToUTCMs(today)
  const todayDow = new Date(todayMs).getUTCDay()
  const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1
  const currentWeekMonMs = todayMs - daysSinceMonday * 86400000
  const startMs = currentWeekMonMs - (weeks - 1) * 7 * 86400000

  const result = []
  for (let w = 0; w < weeks; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cellMs = startMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const entry = byDate.get(dateStr)
      let state
      if (dateStr > today) state = 'future'
      else if (entry) state = entry.isBackfill ? 'backfill' : 'ontime'
      else state = 'empty'
      week.push({ date: dateStr, state, wordCount: entry?.wordCount ?? 0 })
    }
    result.push(week)
  }
  return result
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function check(label, actual, expected) {
  try {
    assert.deepEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

function o(date, wordCount = 10) { return { date, isBackfill: false, wordCount } }
function b(date, wordCount = 10) { return { date, isBackfill: true,  wordCount } }

// ── previousDay / nextDay ────────────────────────────────────────────────────

console.log('\npreviousDay:')
check('2026-07-01 → 2026-06-30', previousDay('2026-07-01'), '2026-06-30')
check('2026-01-01 → 2025-12-31', previousDay('2026-01-01'), '2025-12-31')
check('2024-03-01 → 2024-02-29 (leap year)', previousDay('2024-03-01'), '2024-02-29')
check('2023-03-01 → 2023-02-28 (non-leap)', previousDay('2023-03-01'), '2023-02-28')

console.log('\nnextDay:')
check('2026-07-01 → 2026-07-02', nextDay('2026-07-01'), '2026-07-02')
check('2026-01-01 → 2026-01-02', nextDay('2026-01-01'), '2026-01-02')
check('2024-02-29 → 2024-03-01 (leap year)', nextDay('2024-02-29'), '2024-03-01')
check('2023-02-28 → 2023-03-01 (non-leap)', nextDay('2023-02-28'), '2023-03-01')

// ── computeStats ─────────────────────────────────────────────────────────────

console.log('\ncomputeStats (today = 2026-07-28 trừ khi ghi khác):')
const T = '2026-07-28'

// Case 1: rỗng
check(
  '1: empty → 0 0 0 0',
  computeStats([], T),
  { currentStreak: 0, longestStreak: 0, totalEntries: 0, totalWords: 0 }
)

// Case 2: hôm nay on-time
check(
  '2: 07-28 O → current=1 longest=1',
  computeStats([o('2026-07-28')], T),
  { currentStreak: 1, longestStreak: 1, totalEntries: 1, totalWords: 10 }
)

// Case 3: hôm qua on-time, hôm nay chưa viết
check(
  '3: 07-27 O → current=1 (hôm nay chưa viết, chuỗi chưa đứt)',
  computeStats([o('2026-07-27')], T),
  { currentStreak: 1, longestStreak: 1, totalEntries: 1, totalWords: 10 }
)

// Case 4: 3 ngày liền hôm nay
check(
  '4: 07-26 07-27 07-28 O → current=3 longest=3',
  computeStats([o('2026-07-26'), o('2026-07-27'), o('2026-07-28')], T),
  { currentStreak: 3, longestStreak: 3, totalEntries: 3, totalWords: 30 }
)

// Case 5: hôm qua + hôm kia on-time, hôm nay chưa viết
check(
  '5: 07-26 07-27 O → current=2 (hôm nay chưa viết, vẫn đếm)',
  computeStats([o('2026-07-26'), o('2026-07-27')], T),
  { currentStreak: 2, longestStreak: 2, totalEntries: 2, totalWords: 20 }
)

// Case 6: longest ở quá khứ xa
check(
  '6: 07-20~22 O, 07-27~28 O → current=2 longest=3',
  computeStats(
    [o('2026-07-20'), o('2026-07-21'), o('2026-07-22'), o('2026-07-27'), o('2026-07-28')],
    T
  ),
  { currentStreak: 2, longestStreak: 3, totalEntries: 5, totalWords: 50 }
)

// Case 7: backfill làm đứt chuỗi
check(
  '7: 07-26 O, 07-27 B, 07-28 O → current=1 longest=1',
  computeStats([o('2026-07-26'), b('2026-07-27'), o('2026-07-28')], T),
  { currentStreak: 1, longestStreak: 1, totalEntries: 3, totalWords: 30 }
)

// Case 8: chỉ có backfill
check(
  '8: 07-28 B → current=0 longest=0',
  computeStats([b('2026-07-28')], T),
  { currentStreak: 0, longestStreak: 0, totalEntries: 1, totalWords: 10 }
)

// Case 9: bỏ lỡ 2 ngày
check(
  '9: 07-26 O (today 07-28) → current=0 longest=1 (bỏ lỡ 2 ngày → đứt)',
  computeStats([o('2026-07-26')], T),
  { currentStreak: 0, longestStreak: 1, totalEntries: 1, totalWords: 10 }
)

// Case 10: qua ranh giới tháng
check(
  '10: 06-30 O, 07-01 O; today 07-01 → current=2 longest=2',
  computeStats([o('2026-06-30'), o('2026-07-01')], '2026-07-01'),
  { currentStreak: 2, longestStreak: 2, totalEntries: 2, totalWords: 20 }
)

// Case 11: năm nhuận
check(
  '11: 2024-02-28, 02-29, 03-01 O; today 03-01 → current=3 longest=3',
  computeStats(
    [o('2024-02-28'), o('2024-02-29'), o('2024-03-01')],
    '2024-03-01'
  ),
  { currentStreak: 3, longestStreak: 3, totalEntries: 3, totalWords: 30 }
)

// Case 12: như case 6 nhưng thứ tự đảo lộn (hàm tự sort)
check(
  '12: case 6 thứ tự đảo lộn → current=2 longest=3',
  computeStats(
    [o('2026-07-28'), o('2026-07-22'), o('2026-07-27'), o('2026-07-20'), o('2026-07-21')],
    T
  ),
  { currentStreak: 2, longestStreak: 3, totalEntries: 5, totalWords: 50 }
)

// Case 13: totalEntries=2, totalWords=15 (backfill kèm wordCount)
check(
  '13: 07-27 O (wc=10), 07-28 B (wc=5) → current=1 longest=1 totalEntries=2 totalWords=15',
  computeStats([o('2026-07-27', 10), b('2026-07-28', 5)], T),
  { currentStreak: 1, longestStreak: 1, totalEntries: 2, totalWords: 15 }
)

// ── buildHeatmapWeeks ────────────────────────────────────────────────────────

console.log('\nbuildHeatmapWeeks (today = 2026-07-28, weeks = 53):')
const grid = buildHeatmapWeeks([], '2026-07-28', 53)

// 1. Đúng 53 tuần, mỗi tuần 7 ô
check('Có đúng 53 tuần', grid.length, 53)
check('Mỗi tuần có 7 ô (kiểm tra tuần 0)', grid[0].length, 7)
check('Mỗi tuần có 7 ô (kiểm tra tuần 52)', grid[52].length, 7)

// 2. Ô cuối cùng là Chủ Nhật 2026-08-02, state='future'
const lastCell = grid[52][6]
check('Ô cuối là 2026-08-02', lastCell.date, '2026-08-02')
check("Ô cuối state='future'", lastCell.state, 'future')

// 3. 2026-07-28 (thứ Ba) ở tuần 52, index 1
check("2026-07-28 ở tuần 52 index 1", grid[52][1].date, '2026-07-28')

// 4. 2026-07-29 là future; 2026-07-27 (không có entry) là empty
check("2026-07-29 state='future'", grid[52][2].state, 'future')
check("2026-07-27 (no entry) state='empty'", grid[52][0].state, 'empty')

// 5. Ô đầu tiên là thứ Hai (getUTCDay() === 1)
const firstCell = grid[0][0]
const firstDow = new Date(Date.UTC(
  ...firstCell.date.split('-').map(Number).reduce((acc, v, i) => {
    if (i === 0) acc.push(v)
    else if (i === 1) acc.push(v - 1)
    else acc.push(v)
    return acc
  }, [])
)).getUTCDay()
check('Ô đầu tiên là thứ Hai (getUTCDay()===1)', firstDow, 1)

// 6. Không trùng ngày, các ô liên tiếp
let allDates = grid.flat().map((c) => c.date)
let noDuplicates = new Set(allDates).size === allDates.length
check('Không có ô trùng ngày', noDuplicates, true)

let consecutive = true
for (let i = 1; i < allDates.length; i++) {
  if (nextDay(allDates[i - 1]) !== allDates[i]) {
    consecutive = false
    break
  }
}
check('Các ngày liên tiếp không đứt quãng', consecutive, true)

// ── Kết quả ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) {
  process.exit(1)
}
console.log('All tests passed ✓')
