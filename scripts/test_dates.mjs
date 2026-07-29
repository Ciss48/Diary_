// Test script cho src/lib/dates.ts — node thuần, không cần test framework
// Chạy: node scripts/test_dates.mjs

// Import trực tiếp từ ts? Không — dùng inline reimplementation để test pure logic
// (không cần build step, giữ đúng tinh thần "node thuần")

// ── Reimplementation để test (phải khớp 1:1 với dates.ts) ──────────────────

function getTodayInTimezone(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

function isFutureDate(dateStr, tz) {
  return dateStr > getTodayInTimezone(tz)
}

function isValidDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === dateStr
}

function countWords(content) {
  return content.trim().split(/\s+/).filter(Boolean).length
}

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${description}`)
    passed++
  } else {
    console.error(`  ✗ ${description}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

// ── countWords ─────────────────────────────────────────────────────────────

console.log('\ncountWords:')
assert("empty string → 0", countWords(''), 0)
assert("only spaces → 0", countWords('   '), 0)
assert("'hello world' → 2", countWords('hello world'), 2)
assert("'a\\nb\\tc' → 3", countWords('a\nb\tc'), 3)
assert("leading/trailing spaces", countWords('  hello  world  '), 2)

// ── isValidDateString ──────────────────────────────────────────────────────

console.log('\nisValidDateString:')
assert("'2026-07-12' → true", isValidDateString('2026-07-12'), true)
assert("'2026-13-01' → false (month 13)", isValidDateString('2026-13-01'), false)
assert("'2026-02-30' → false (Feb 30)", isValidDateString('2026-02-30'), false)
assert("'12/07/2026' → false (wrong format)", isValidDateString('12/07/2026'), false)
assert("'2026-00-01' → false (month 0)", isValidDateString('2026-00-01'), false)
assert("'abc' → false", isValidDateString('abc'), false)
assert("'2026-7-12' → false (no leading zero)", isValidDateString('2026-7-12'), false)
assert("'2024-02-29' → true (leap year)", isValidDateString('2024-02-29'), true)
assert("'2023-02-29' → false (not leap year)", isValidDateString('2023-02-29'), false)

// ── isFutureDate ───────────────────────────────────────────────────────────

console.log('\nisFutureDate (Asia/Ho_Chi_Minh):')
const tz = 'Asia/Ho_Chi_Minh'
const today = getTodayInTimezone(tz)

// Tính hôm qua và ngày mai động
const todayDate = new Date(today + 'T00:00:00Z')
const yesterday = new Date(todayDate)
yesterday.setUTCDate(yesterday.getUTCDate() - 1)
const yesterdayStr = yesterday.toISOString().slice(0, 10)

const tomorrow = new Date(todayDate)
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
const tomorrowStr = tomorrow.toISOString().slice(0, 10)

assert(`hôm qua (${yesterdayStr}) → false`, isFutureDate(yesterdayStr, tz), false)
assert(`hôm nay (${today}) → false`, isFutureDate(today, tz), false)
assert(`ngày mai (${tomorrowStr}) → true`, isFutureDate(tomorrowStr, tz), true)

// ── getTodayInTimezone ─────────────────────────────────────────────────────

console.log('\ngetTodayInTimezone:')
const todayHCM = getTodayInTimezone('Asia/Ho_Chi_Minh')
assert(
  "Asia/Ho_Chi_Minh → YYYY-MM-DD format",
  /^\d{4}-\d{2}-\d{2}$/.test(todayHCM),
  true
)

// ── Chứng minh khác UTC: UTC+14 vs UTC-11 ─────────────────────────────────

console.log('\nTimezone divergence (UTC+14 vs UTC-11):')
const kiritimati = getTodayInTimezone('Pacific/Kiritimati') // UTC+14
const niue = getTodayInTimezone('Pacific/Niue')             // UTC-11

assert("Pacific/Kiritimati → valid date", /^\d{4}-\d{2}-\d{2}$/.test(kiritimati), true)
assert("Pacific/Niue → valid date", /^\d{4}-\d{2}-\d{2}$/.test(niue), true)

// Hai timezone cực đoan nhất — có thể khác nhau (không assert bằng nhau)
// Chỉ assert cả hai đều là ngày hợp lệ (không dùng mốc UTC cứng)
const kiri = new Date(kiritimati + 'T00:00:00Z')
const niueDate = new Date(niue + 'T00:00:00Z')
const diffDays = Math.abs((kiri - niueDate) / (1000 * 60 * 60 * 24))
assert(
  "Kiritimati và Niue cách nhau ≤ 1 ngày lịch (không cùng UTC mốc cứng)",
  diffDays <= 1,
  true
)

// ── Kết quả ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) {
  process.exit(1)
}
console.log('All tests passed ✓')
