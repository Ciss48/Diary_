import assert from 'node:assert/strict'

// ── inline implementations (mirror src/lib/calendar.ts) ──────────────────
// We duplicate the logic here so the test runs with plain `node` without
// TypeScript compilation.

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

function isValidMonthString(monthStr) {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return false
  const month = Number(monthStr.slice(5, 7))
  return month >= 1 && month <= 12
}

function previousMonth(monthStr) {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))
  if (month === 1) return `${year - 1}-12`
  return `${year}-${String(month - 1).padStart(2, '0')}`
}

function nextMonth(monthStr) {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))
  if (month === 12) return `${year + 1}-01`
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7)
}

function buildMonthGrid(entries, monthStr, today) {
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))

  const byDate = new Map()
  for (const e of entries) byDate.set(e.date, e)

  const firstOfMonthMs = Date.UTC(year, month - 1, 1)
  const firstDow = new Date(firstOfMonthMs).getUTCDay()
  const daysSinceMon = firstDow === 0 ? 6 : firstDow - 1
  const gridStartMs = firstOfMonthMs - daysSinceMon * 86400000

  const weeks = []
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cellMs = gridStartMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const cellYear = new Date(cellMs).getUTCFullYear()
      const cellMonth = new Date(cellMs).getUTCMonth() + 1
      const dayOfMonth = new Date(cellMs).getUTCDate()
      const inMonth = cellYear === year && cellMonth === month

      const entry = byDate.get(dateStr)
      let state
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

// ── test helpers ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
    failed++
  }
}

// ── isValidMonthString ────────────────────────────────────────────────────

console.log('\nisValidMonthString')
test("'2026-07' → true",  () => assert.equal(isValidMonthString('2026-07'), true))
test("'2026-13' → false", () => assert.equal(isValidMonthString('2026-13'), false))
test("'2026-7' → false",  () => assert.equal(isValidMonthString('2026-7'),  false))
test("'2026-07-01' → false", () => assert.equal(isValidMonthString('2026-07-01'), false))
test("'abc' → false",    () => assert.equal(isValidMonthString('abc'),     false))
test("'2026-00' → false", () => assert.equal(isValidMonthString('2026-00'), false))
test("'2026-12' → true",  () => assert.equal(isValidMonthString('2026-12'), true))
test("'2026-01' → true",  () => assert.equal(isValidMonthString('2026-01'), true))

// ── previousMonth / nextMonth ─────────────────────────────────────────────

console.log('\npreviousMonth / nextMonth')
test('2026-07 prev → 2026-06', () => assert.equal(previousMonth('2026-07'), '2026-06'))
test('2026-07 next → 2026-08', () => assert.equal(nextMonth('2026-07'),     '2026-08'))
test('2026-01 prev → 2025-12', () => assert.equal(previousMonth('2026-01'), '2025-12'))
test('2026-01 next → 2026-02', () => assert.equal(nextMonth('2026-01'),     '2026-02'))
test('2026-12 prev → 2026-11', () => assert.equal(previousMonth('2026-12'), '2026-11'))
test('2026-12 next → 2027-01', () => assert.equal(nextMonth('2026-12'),     '2027-01'))

// ── monthOf ───────────────────────────────────────────────────────────────

console.log('\nmonthOf')
test("'2026-07-28' → '2026-07'", () => assert.equal(monthOf('2026-07-28'), '2026-07'))
test("'2024-02-29' → '2024-02'", () => assert.equal(monthOf('2024-02-29'), '2024-02'))

// ── buildMonthGrid — 2026-07, today=2026-07-28 ───────────────────────────

console.log('\nbuildMonthGrid(2026-07, today=2026-07-28) — basic structure')
{
  const grid = buildMonthGrid([], '2026-07', '2026-07-28')

  test('returns 6 weeks', () => assert.equal(grid.length, 6))
  test('each week has 7 cells', () => {
    for (const w of grid) assert.equal(w.length, 7)
  })

  const all = grid.flat()
  test('total 42 cells', () => assert.equal(all.length, 42))

  test('first cell date is 2026-06-29', () => assert.equal(all[0].date, '2026-06-29'))
  test('first cell dayOfMonth is 29',   () => assert.equal(all[0].dayOfMonth, 29))
  test('first cell inMonth is false',   () => assert.equal(all[0].inMonth, false))

  test('last cell date is 2026-08-09',  () => assert.equal(all[41].date, '2026-08-09'))
  test('last cell inMonth is false',    () => assert.equal(all[41].inMonth, false))

  // 2026-07-01 cell
  const jul1 = all.find(c => c.date === '2026-07-01')
  test('2026-07-01 exists',           () => assert.ok(jul1))
  test('2026-07-01 dayOfMonth = 1',   () => assert.equal(jul1.dayOfMonth, 1))
  test('2026-07-01 inMonth = true',   () => assert.equal(jul1.inMonth, true))

  // future / not-future boundary
  const jul29 = all.find(c => c.date === '2026-07-29')
  test('2026-07-29 state is future',  () => assert.equal(jul29.state, 'future'))
  const jul28 = all.find(c => c.date === '2026-07-28')
  test('2026-07-28 state is not future', () => assert.notEqual(jul28.state, 'future'))

  // consecutive dates
  test('all 42 dates are consecutive', () => {
    for (let i = 1; i < all.length; i++) {
      const prev = new Date(dateToUTCMs(all[i - 1].date) + 86400000)
      const prevStr = formatUTCDate(prev.getTime())
      assert.equal(all[i].date, prevStr,
        `gap between ${all[i-1].date} and ${all[i].date}`)
    }
  })
}

// ── buildMonthGrid — 2026-07 with entries ────────────────────────────────

console.log('\nbuildMonthGrid(2026-07) with entries')
{
  const entries = [
    { date: '2026-07-20', isBackfill: false, wordCount: 5, mood: 'happy' }
  ]
  const grid = buildMonthGrid(entries, '2026-07', '2026-07-28')
  const all = grid.flat()

  const jul20 = all.find(c => c.date === '2026-07-20')
  test('2026-07-20 state = ontime', () => assert.equal(jul20.state, 'ontime'))
  test('2026-07-20 mood = happy',   () => assert.equal(jul20.mood, 'happy'))
  test('2026-07-20 wordCount = 5',  () => assert.equal(jul20.wordCount, 5))

  const jul21 = all.find(c => c.date === '2026-07-21')
  test('2026-07-21 state = empty', () => assert.equal(jul21.state, 'empty'))
  test('2026-07-21 mood = null',   () => assert.equal(jul21.mood, null))
  test('2026-07-21 wordCount = 0', () => assert.equal(jul21.wordCount, 0))
}

// ── buildMonthGrid — 2024-02 (leap year), today=2026-07-28 ───────────────

console.log('\nbuildMonthGrid(2024-02, leap year)')
{
  const grid = buildMonthGrid([], '2024-02', '2026-07-28')
  const all = grid.flat()

  test('first cell date is 2024-01-29', () => assert.equal(all[0].date, '2024-01-29'))
  test('first cell is Monday (DOW=1)', () => {
    const ms = Date.UTC(2024, 0, 29)
    const dow = new Date(ms).getUTCDay()
    assert.equal(dow, 1) // 1 = Monday
  })

  const feb29 = all.find(c => c.date === '2024-02-29')
  test('2024-02-29 exists (leap day)', () => assert.ok(feb29))
  test('2024-02-29 inMonth = true',    () => assert.equal(feb29.inMonth, true))

  test('no future cells (month is past)', () => {
    const futureInMonth = all.filter(c => c.inMonth && c.state === 'future')
    assert.equal(futureInMonth.length, 0)
  })
}

// ── buildMonthGrid — 2026-11 (future month), today=2026-07-28 ────────────

console.log('\nbuildMonthGrid(2026-11, future month)')
{
  const grid = buildMonthGrid([], '2026-11', '2026-07-28')
  const all = grid.flat()

  test('all inMonth cells are future', () => {
    for (const c of all) {
      if (c.inMonth) {
        assert.equal(c.state, 'future', `${c.date} expected future`)
      }
    }
  })
}

// ── summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
