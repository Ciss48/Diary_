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

// ── inline: buildYearGrid, monthLabelOffsets, yearStats, monthStats, isValidYear ──

function buildYearGrid(entries, year, today) {
  const byDate = new Map()
  for (const e of entries) byDate.set(e.date, e)

  const jan1Ms = Date.UTC(year, 0, 1)
  const jan1Dow = new Date(jan1Ms).getUTCDay()
  const daysSinceMon = jan1Dow === 0 ? 6 : jan1Dow - 1
  const gridStartMs = jan1Ms - daysSinceMon * 86400000

  const dec31Ms = Date.UTC(year, 11, 31)
  const dec31Dow = new Date(dec31Ms).getUTCDay()
  const daysUntilSun = dec31Dow === 0 ? 0 : 7 - dec31Dow
  const gridEndMs = dec31Ms + daysUntilSun * 86400000

  const totalDays = Math.round((gridEndMs - gridStartMs) / 86400000) + 1
  const totalWeeks = totalDays / 7

  const weeks = []
  for (let w = 0; w < totalWeeks; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cellMs = gridStartMs + (w * 7 + d) * 86400000
      const dateStr = formatUTCDate(cellMs)
      const cellYear = new Date(cellMs).getUTCFullYear()
      const inYear = cellYear === year

      const entry = byDate.get(dateStr)
      let state
      if (dateStr > today) state = 'future'
      else if (entry) state = entry.isBackfill ? 'backfill' : 'ontime'
      else state = 'empty'

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

function monthLabelOffsets(weeks) {
  const result = []
  const seen = new Set()
  for (let w = 0; w < weeks.length; w++) {
    for (const cell of weeks[w]) {
      if (!cell.inYear) continue
      const month = Number(cell.date.slice(5, 7)) - 1
      if (!seen.has(month)) {
        seen.add(month)
        result.push({ month, weekIndex: w })
      }
    }
  }
  return result.sort((a, b) => a.month - b.month)
}

function yearStats(entries, year) {
  const prefix = String(year)
  let count = 0, words = 0
  for (const e of entries) {
    if (e.date.slice(0, 4) === prefix) { count++; words += e.wordCount }
  }
  return { entries: count, words }
}

function monthStatsCalc(entries, monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  let count = 0
  for (const e of entries) {
    if (e.date.startsWith(monthStr)) count++
  }
  return { daysInMonth, entries: count }
}

function isValidYear(raw, currentYear) {
  if (raw === undefined) return null
  if (!/^\d{4}$/.test(raw)) return null
  const year = Number(raw)
  if (year < 2020 || year > currentYear) return null
  return year
}

// ── buildYearGrid — 2026 (Jan 1 = Thursday), today=2026-07-31 ────────────

console.log('\nbuildYearGrid(2026, today=2026-07-31) — normal year')
{
  const grid = buildYearGrid([], 2026, '2026-07-31')
  const all = grid.flat()

  test('2026: returns 53 weeks', () => assert.equal(grid.length, 53))
  test('2026: each week has 7 cells', () => {
    for (const w of grid) assert.equal(w.length, 7)
  })
  test('2026: total 371 cells', () => assert.equal(all.length, 371))

  // Padding before: Dec 29-31 2025 (3 cells)
  test('2026: first cell is 2025-12-29 (Monday)', () => assert.equal(all[0].date, '2025-12-29'))
  test('2026: first cell inYear=false', () => assert.equal(all[0].inYear, false))
  test('2026: first cell is Monday', () => {
    assert.equal(new Date(dateToUTCMs('2025-12-29')).getUTCDay(), 1)
  })
  test('2026: cells 0-2 are padding (inYear=false)', () => {
    assert.equal(all[0].inYear, false)
    assert.equal(all[1].inYear, false)
    assert.equal(all[2].inYear, false)
  })

  // First in-year cell
  test('2026: cell 3 is 2026-01-01 (inYear=true)', () => {
    assert.equal(all[3].date, '2026-01-01')
    assert.equal(all[3].inYear, true)
  })

  // Last in-year cell (Dec 31)
  const dec31 = all.find(c => c.date === '2026-12-31')
  test('2026: Dec 31 exists and inYear=true', () => {
    assert.ok(dec31)
    assert.equal(dec31.inYear, true)
  })

  // Padding after: Jan 1-3 2027 (3 cells)
  // Dec 31 Thu → Sun of that week = Jan 3, 2027
  test('2026: last cell is 2027-01-03 (Sunday)', () => assert.equal(all[370].date, '2027-01-03'))
  test('2026: last 3 cells are padding', () => {
    // Jan 1-3, 2027
    assert.equal(all[368].inYear, false)
    assert.equal(all[369].inYear, false)
    assert.equal(all[370].inYear, false)
  })

  // inYear count = 365
  const inYearCount = all.filter(c => c.inYear).length
  test('2026: inYear cells = 365', () => assert.equal(inYearCount, 365))

  // padding count
  test('2026: padding cells = 6', () => assert.equal(all.length - inYearCount, 6))
}

// ── buildYearGrid — 2024 (Jan 1 = Monday, leap year) ────────────────────

console.log('\nbuildYearGrid(2024, leap year, Jan 1 = Monday)')
{
  const grid = buildYearGrid([], 2024, '2026-07-31')
  const all = grid.flat()

  test('2024: Jan 1 is Monday', () => {
    assert.equal(new Date(Date.UTC(2024, 0, 1)).getUTCDay(), 1)
  })
  test('2024: returns 53 weeks', () => assert.equal(grid.length, 53))
  test('2024: first cell is 2024-01-01 (no padding before)', () => {
    assert.equal(all[0].date, '2024-01-01')
    assert.equal(all[0].inYear, true)
  })

  const feb29 = all.find(c => c.date === '2024-02-29')
  test('2024: Feb 29 exists and inYear=true', () => {
    assert.ok(feb29)
    assert.equal(feb29.inYear, true)
  })

  const inYearCount = all.filter(c => c.inYear).length
  test('2024: inYear cells = 366', () => assert.equal(inYearCount, 366))
  test('2024: padding cells = 5', () => assert.equal(all.length - inYearCount, 5))

  // Dec 31 present
  const dec31 = all.find(c => c.date === '2024-12-31')
  test('2024: Dec 31 exists and inYear=true', () => {
    assert.ok(dec31)
    assert.equal(dec31.inYear, true)
  })
}

// ── buildYearGrid — 2023 (Jan 1 = Sunday) ────────────────────────────────

console.log('\nbuildYearGrid(2023, Jan 1 = Sunday)')
{
  test('2023: Jan 1 is Sunday', () => {
    assert.equal(new Date(Date.UTC(2023, 0, 1)).getUTCDay(), 0)
  })

  const grid = buildYearGrid([], 2023, '2026-07-31')
  const all = grid.flat()

  test('2023: returns 53 weeks', () => assert.equal(grid.length, 53))

  // 6 padding before (Dec 26-31, 2022)
  test('2023: first cell is 2022-12-26 (Monday)', () => {
    assert.equal(all[0].date, '2022-12-26')
    assert.equal(all[0].inYear, false)
  })
  test('2023: 6 padding cells before', () => {
    for (let i = 0; i < 6; i++) assert.equal(all[i].inYear, false)
    assert.equal(all[6].date, '2023-01-01')
    assert.equal(all[6].inYear, true)
  })

  // Dec 31 is Sunday = last column, 0 padding after
  test('2023: Dec 31 is Sunday', () => {
    assert.equal(new Date(Date.UTC(2023, 11, 31)).getUTCDay(), 0)
  })
  test('2023: last cell is 2023-12-31', () => {
    assert.equal(all[all.length - 1].date, '2023-12-31')
    assert.equal(all[all.length - 1].inYear, true)
  })

  const inYearCount = all.filter(c => c.inYear).length
  test('2023: inYear cells = 365', () => assert.equal(inYearCount, 365))
}

// ── buildYearGrid — 2012 (leap year starting on Sunday = 54 weeks) ───────

console.log('\nbuildYearGrid(2012, leap year starting Sunday = 54 weeks)')
{
  test('2012: Jan 1 is Sunday', () => {
    assert.equal(new Date(Date.UTC(2012, 0, 1)).getUTCDay(), 0)
  })
  test('2012: is leap year', () => {
    assert.equal(new Date(Date.UTC(2012, 1, 29)).getUTCDate(), 29)
  })

  const grid = buildYearGrid([], 2012, '2026-07-31')
  const all = grid.flat()

  test('2012: returns 54 weeks', () => assert.equal(grid.length, 54))
  test('2012: total 378 cells', () => assert.equal(all.length, 378))

  const inYearCount = all.filter(c => c.inYear).length
  test('2012: inYear cells = 366', () => assert.equal(inYearCount, 366))
  test('2012: padding cells = 12', () => assert.equal(all.length - inYearCount, 12))

  // 6 padding before (Dec 26-31, 2011)
  test('2012: first cell is 2011-12-26', () => assert.equal(all[0].date, '2011-12-26'))
  // Dec 31, 2012 is Monday, padding after = 6 (Tue-Sun Jan 1-6 2013)
  test('2012: Dec 31 is Monday', () => {
    assert.equal(new Date(Date.UTC(2012, 11, 31)).getUTCDay(), 1)
  })
  const dec31 = all.find(c => c.date === '2012-12-31')
  test('2012: Dec 31 exists and inYear=true', () => {
    assert.ok(dec31)
    assert.equal(dec31.inYear, true)
  })
}

// ── buildYearGrid — state assignment with entries ────────────────────────

console.log('\nbuildYearGrid state assignment with entries')
{
  const entries = [
    { date: '2026-01-01', isBackfill: false, wordCount: 100, mood: 'happy' },
    { date: '2026-01-02', isBackfill: true, wordCount: 50, mood: 'sad' },
    { date: '2026-07-31', isBackfill: false, wordCount: 200, mood: null },
  ]
  const grid = buildYearGrid(entries, 2026, '2026-07-31')
  const all = grid.flat()

  const jan1 = all.find(c => c.date === '2026-01-01')
  test('Jan 1 state=ontime', () => assert.equal(jan1.state, 'ontime'))
  test('Jan 1 mood=happy', () => assert.equal(jan1.mood, 'happy'))
  test('Jan 1 wordCount=100', () => assert.equal(jan1.wordCount, 100))

  const jan2 = all.find(c => c.date === '2026-01-02')
  test('Jan 2 state=backfill', () => assert.equal(jan2.state, 'backfill'))
  test('Jan 2 mood=sad', () => assert.equal(jan2.mood, 'sad'))

  const jan3 = all.find(c => c.date === '2026-01-03')
  test('Jan 3 state=empty', () => assert.equal(jan3.state, 'empty'))

  const aug1 = all.find(c => c.date === '2026-08-01')
  test('Aug 1 state=future', () => assert.equal(aug1.state, 'future'))

  const jul31 = all.find(c => c.date === '2026-07-31')
  test('Jul 31 state=ontime (today)', () => assert.equal(jul31.state, 'ontime'))
  test('Jul 31 wordCount=200', () => assert.equal(jul31.wordCount, 200))
}

// ── buildYearGrid — year with no entries ─────────────────────────────────

console.log('\nbuildYearGrid with no entries')
{
  const grid = buildYearGrid([], 2026, '2026-07-31')
  const all = grid.flat()
  const inYear = all.filter(c => c.inYear)

  test('all in-year past/today cells are empty', () => {
    const pastOrToday = inYear.filter(c => c.date <= '2026-07-31')
    for (const c of pastOrToday) {
      assert.equal(c.state, 'empty', `${c.date} should be empty`)
    }
  })
  test('all in-year future cells are future', () => {
    const future = inYear.filter(c => c.date > '2026-07-31')
    for (const c of future) {
      assert.equal(c.state, 'future', `${c.date} should be future`)
    }
  })
}

// ── isValidYear ──────────────────────────────────────────────────────────

console.log('\nisValidYear')
{
  test("'2099' → null (future)", () => assert.equal(isValidYear('2099', 2026), null))
  test("'abcd' → null", () => assert.equal(isValidYear('abcd', 2026), null))
  test("'2026' → 2026", () => assert.equal(isValidYear('2026', 2026), 2026))
  test("'2019' → null (below 2020)", () => assert.equal(isValidYear('2019', 2026), null))
  test("undefined → null", () => assert.equal(isValidYear(undefined, 2026), null))
  test("'2020' → 2020 (lower bound)", () => assert.equal(isValidYear('2020', 2026), 2020))
  test("'2025' → 2025", () => assert.equal(isValidYear('2025', 2026), 2025))
  test("'20' → null (not 4 digits)", () => assert.equal(isValidYear('20', 2026), null))
}

// ── monthLabelOffsets — 2026 ─────────────────────────────────────────────

console.log('\nmonthLabelOffsets(2026)')
{
  const grid = buildYearGrid([], 2026, '2026-07-31')
  const offsets = monthLabelOffsets(grid)

  test('returns 12 items', () => assert.equal(offsets.length, 12))
  test('months are 0-11', () => {
    for (let i = 0; i < 12; i++) assert.equal(offsets[i].month, i)
  })
  test('Jan weekIndex = 0', () => assert.equal(offsets[0].weekIndex, 0))
  test('ascending weekIndex order', () => {
    for (let i = 1; i < 12; i++) {
      assert.ok(offsets[i].weekIndex > offsets[i - 1].weekIndex,
        `month ${i} weekIndex ${offsets[i].weekIndex} should be > month ${i-1} weekIndex ${offsets[i-1].weekIndex}`)
    }
  })
}

// ── monthLabelOffsets — 2024 (Jan 1 = Monday) ────────────────────────────

console.log('\nmonthLabelOffsets(2024)')
{
  const grid = buildYearGrid([], 2024, '2026-07-31')
  const offsets = monthLabelOffsets(grid)

  test('returns 12 items', () => assert.equal(offsets.length, 12))
  test('Jan weekIndex = 0', () => assert.equal(offsets[0].weekIndex, 0))

  // Feb 1 2024 = Thursday → in week 4 (0-indexed), since Jan has 31 days
  // Jan 1 (Mon) .. Jan 7 (Sun) = week 0, Jan 8..14 = week 1, ... Jan 29..Feb 2 = week 4
  test('Feb weekIndex = 4', () => assert.equal(offsets[1].weekIndex, 4))

  // Dec 1 2024 = Sunday → in week starting Nov 25 (Mon)
  // Approx week 48 (since 335 days / 7 ≈ 47.8)
  test('Dec weekIndex is reasonable (47-49)', () => {
    assert.ok(offsets[11].weekIndex >= 47 && offsets[11].weekIndex <= 49,
      `Dec weekIndex=${offsets[11].weekIndex}`)
  })
}

// ── yearStats ────────────────────────────────────────────────────────────

console.log('\nyearStats')
{
  const entries = [
    { date: '2026-01-01', isBackfill: false, wordCount: 100 },
    { date: '2026-06-15', isBackfill: true, wordCount: 200 },
    { date: '2025-12-31', isBackfill: false, wordCount: 50 },
  ]

  const s2026 = yearStats(entries, 2026)
  test('2026: entries=2', () => assert.equal(s2026.entries, 2))
  test('2026: words=300', () => assert.equal(s2026.words, 300))

  const s2025 = yearStats(entries, 2025)
  test('2025: entries=1', () => assert.equal(s2025.entries, 1))
  test('2025: words=50', () => assert.equal(s2025.words, 50))

  const s2023 = yearStats(entries, 2023)
  test('2023: entries=0', () => assert.equal(s2023.entries, 0))
  test('2023: words=0', () => assert.equal(s2023.words, 0))
}

// ── monthStats ───────────────────────────────────────────────────────────

console.log('\nmonthStats')
{
  const entries = [
    { date: '2026-01-15', isBackfill: false, wordCount: 100 },
  ]

  const jan = monthStatsCalc(entries, '2026-01')
  test('2026-01: daysInMonth=31', () => assert.equal(jan.daysInMonth, 31))
  test('2026-01: entries=1', () => assert.equal(jan.entries, 1))

  const feb24 = monthStatsCalc([], '2024-02')
  test('2024-02: daysInMonth=29 (leap)', () => assert.equal(feb24.daysInMonth, 29))
  test('2024-02: entries=0', () => assert.equal(feb24.entries, 0))

  const feb26 = monthStatsCalc([], '2026-02')
  test('2026-02: daysInMonth=28 (non-leap)', () => assert.equal(feb26.daysInMonth, 28))
  test('2026-02: entries=0', () => assert.equal(feb26.entries, 0))
}

// ── summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
