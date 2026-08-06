/**
 * Tests for vocabulary library pure functions.
 * Run: node scripts/test_vocab_library.mjs
 */

import {
  filterByRange,
  filterByKind,
  searchItems,
  sortItems,
  groupItems,
  computeLibraryStats,
} from '../src/lib/vocabLibrary.ts'

const TZ = 'Asia/Ho_Chi_Minh'
const TODAY = '2026-08-06' // Thursday

// ── Fixtures ────────────────────────────────────────────────────────────────────

const ITEMS = [
  // Today (Aug 6)
  { id:'1', display_form:'a comforting movie', headword:'comforting', original_form:'a comfortable movie', change_type:'vocabulary', status:'learning', created_at:'2026-08-06T10:00:00+07:00', entry_date:'2026-08-06', entry_id:'e1', definition:{ id:'d1', ipa:'/ˈkʌm.fə.tɪŋ/', part_of_speech:'adjective', definition:'Making you feel calmer.', example:'A comforting movie.', source:'dictionary' } },
  { id:'2', display_form:'delicious', headword:'delicious', original_form:'delicous', change_type:'spelling', status:'known', created_at:'2026-08-06T11:00:00+07:00', entry_date:'2026-08-06', entry_id:'e1', definition:{ id:'d2', ipa:'/dɪˈlɪʃ.əs/', part_of_speech:'adjective', definition:'Having a very pleasant taste.', example:'The chicken was delicious.', source:'dictionary' } },

  // Yesterday (Aug 5) — note: 22:30+07 is still Aug 5 in VN
  { id:'3', display_form:'arrived at', headword:'arrived at', original_form:'arrived to', change_type:'grammar', status:'learning', created_at:'2026-08-05T22:30:00+07:00', entry_date:'2026-08-05', entry_id:'e2', definition:{ id:'d3', ipa:'/əˈraɪvd ət/', part_of_speech:'phrasal verb', definition:'To reach a specific place.', example:'We arrived at the office.', source:'llm' } },
  { id:'4', display_form:'in such a hurry', headword:'in such a hurry', original_form:'so hurry', change_type:'vocabulary', status:'learning', created_at:'2026-08-05T22:35:00+07:00', entry_date:'2026-08-05', entry_id:'e2', definition:null },

  // 3 days ago (Aug 3, Sunday)
  { id:'5', display_form:'overslept', headword:'overslept', original_form:'still woke up late', change_type:'style', status:'learning', created_at:'2026-08-03T15:00:00+07:00', entry_date:'2026-08-03', entry_id:'e3', definition:{ id:'d5', ipa:'/ˌəʊ.vəˈslept/', part_of_speech:'verb', definition:'To sleep longer than intended.', example:'I overslept and missed the meeting.', source:'dictionary' } },

  // 6 days ago (Jul 31, Friday) — still within 7-day window
  { id:'6', display_form:'due to', headword:'due to', original_form:'because of a', change_type:'style', status:'known', created_at:'2026-07-31T09:00:00+07:00', entry_date:'2026-07-31', entry_id:'e4', definition:{ id:'d6', ipa:'/djuː tə/', part_of_speech:'preposition', definition:'Because of.', example:'I skipped the gym due to injury.', source:'llm' } },

  // 8 days ago (Jul 29) — outside 7-day, inside 30-day
  { id:'7', display_form:'good advice', headword:'good advice', original_form:'a good advice', change_type:'grammar', status:'learning', created_at:'2026-07-29T14:00:00+07:00', entry_date:'2026-07-29', entry_id:'e5', definition:{ id:'d7', ipa:'/ədˈvaɪs/', part_of_speech:'noun', definition:'An opinion about what to do.', example:'That was good advice.', source:'dictionary' } },
  { id:'8', display_form:'ended successfully', headword:'ended successfully', original_form:'ended successful', change_type:'grammar', status:'known', created_at:'2026-07-29T14:05:00+07:00', entry_date:'2026-07-29', entry_id:'e5', definition:{ id:'d8', ipa:'/səkˈses.fəl.i/', part_of_speech:'adverb', definition:'Achieving the intended result.', example:'The meeting ended successfully.', source:'dictionary' } },

  // 34 days ago (Jul 3) — outside 30-day, inside 365-day
  { id:'9', display_form:'opted to', headword:'opted to', original_form:'went to', change_type:'vocabulary', status:'learning', created_at:'2026-07-03T10:00:00+07:00', entry_date:'2026-07-03', entry_id:'e6', definition:{ id:'d9', ipa:'/ˈɒp.tɪd/', part_of_speech:'verb', definition:'To choose one thing rather than another.', example:'I opted to stay home.', source:'llm' } },

  // 52 days ago (Jun 15)
  { id:'10', display_form:'a better day', headword:'a better day', original_form:'a more better day', change_type:'grammar', status:'known', created_at:'2026-06-15T10:00:00+07:00', entry_date:'2026-06-15', entry_id:'e7', definition:{ id:'d10', ipa:'/ˈbet.ər/', part_of_speech:'adjective', definition:'Already comparative.', example:'I hope tomorrow is a better day.', source:'dictionary' } },
]

// ── Test harness ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0
function assert(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ ${label}`); failed++ }
}

function ids(items) { return items.map(i => i.id) }

// ── Group 1: Time range filtering ───────────────────────────────────────────────
console.log('filterByRange')

assert('R1: all returns all 10', filterByRange(ITEMS, 'all', TODAY, TZ).length === 10)
assert('R2: 7 returns items within 7 days (6 items)', filterByRange(ITEMS, '7', TODAY, TZ).length === 6)
assert('R3: 30 returns items within 30 days (8 items)', filterByRange(ITEMS, '30', TODAY, TZ).length === 8)
assert('R4: 365 returns items within this year (all 10)', filterByRange(ITEMS, '365', TODAY, TZ).length === 10)

// Boundary: Jul 31 is exactly 6 days ago from Aug 6, included in 7-day
assert('R5: boundary — Jul 31 included in 7-day window',
  filterByRange(ITEMS, '7', TODAY, TZ).some(i => i.id === '6'))

// Jul 29 is 8 days ago, excluded from 7-day
assert('R6: boundary — Jul 29 excluded from 7-day window',
  !filterByRange(ITEMS, '7', TODAY, TZ).some(i => i.id === '7'))

// Cross-year: add a 2025 item, verify 365 excludes it
const CROSS_YEAR_ITEM = { ...ITEMS[9], id: '99', created_at: '2025-12-30T10:00:00+07:00' }
const itemsWithCrossYear = [...ITEMS, CROSS_YEAR_ITEM]
assert('R7: cross-year — 2025 item excluded from 365 (this year)',
  filterByRange(itemsWithCrossYear, '365', TODAY, TZ).length === 10)
assert('R8: cross-year — 2025 item included in all',
  filterByRange(itemsWithCrossYear, 'all', TODAY, TZ).length === 11)

// ── Group 2: Date grouping ──────────────────────────────────────────────────────
console.log('\ngroupItems')

// Sort by date first (newest first) for grouping
const sorted = sortItems(ITEMS, 'date')
const groups = groupItems(sorted, 'date', TODAY, TZ)

assert('G1: first group is "Today"', groups[0].label === 'Today')
assert('G2: second group is "Yesterday"', groups[1].label === 'Yesterday')
assert('G3: Today has 2 items', groups[0].items.length === 2)
assert('G4: Yesterday has 2 items', groups[1].items.length === 2)

// Aug 3 is a Monday
assert('G5: 3 days ago is "Monday, Aug 3"',
  groups.some(g => g.label === 'Monday, Aug 3'))

// Late-night save: item 3 created at 22:30+07 = still Aug 5 in VN timezone
assert('G6: late-night save stays in Yesterday',
  groups[1].items.some(i => i.id === '3'))

// A–Z produces single group
const azGroups = groupItems(sortItems(ITEMS, 'az'), 'az', TODAY, TZ)
assert('G7: A-Z sort → single group "All words, A – Z"',
  azGroups.length === 1 && azGroups[0].label === 'All words, A – Z')

// Cross-year heading
const crossYearItems = [{ ...ITEMS[0], id:'cy1', created_at:'2025-12-30T10:00:00+07:00' }]
const crossYearGroups = groupItems(crossYearItems, 'date', TODAY, TZ)
assert('G8: different year heading includes year — "Tuesday, Dec 30, 2025"',
  crossYearGroups[0].label === 'Tuesday, Dec 30, 2025')

// ── Group 3: Search matching ────────────────────────────────────────────────────
console.log('\nsearchItems')

assert('S1: case-insensitive — "DELICIOUS" matches', searchItems(ITEMS, 'DELICIOUS').length === 1)
assert('S2: substring in definition — "pleasant taste"', searchItems(ITEMS, 'pleasant taste').length === 1)
assert('S3: substring in display_form — "comforting"',
  searchItems(ITEMS, 'comforting').some(i => i.id === '1'))
assert('S4: no match returns empty', searchItems(ITEMS, 'xyznotfound').length === 0)
assert('S5: empty query returns all', searchItems(ITEMS, '').length === 10)
assert('S6: query with spaces — "good advice"', searchItems(ITEMS, 'good advice').length === 1)

// ── Group 4: Sorting ────────────────────────────────────────────────────────────
console.log('\nsortItems')

const byDate = sortItems(ITEMS, 'date')
assert('O1: date sort — newest first', byDate[0].id === '2' && byDate[1].id === '1')
assert('O2: date sort — oldest last', byDate[byDate.length - 1].id === '10')

const byAz = sortItems(ITEMS, 'az')
assert('O3: A-Z — "a better day" before "a comforting movie"',
  byAz[0].display_form === 'a better day' && byAz[1].display_form === 'a comforting movie')
assert('O4: A-Z — "a comforting movie" sorts under A (before "arrived at")',
  ids(byAz).indexOf('1') < ids(byAz).indexOf('3'))

// ── Group 5: Stats calculations ─────────────────────────────────────────────────
console.log('\ncomputeLibraryStats')

const stats = computeLibraryStats(ITEMS, TODAY, TZ)
assert('T1: total = 10', stats.total === 10)
assert('T2: last30 = 8', stats.last30 === 8)

// "This week" = Monday Aug 3 through Thursday Aug 6
// Items in that range: 1,2 (Aug 6), 3,4 (Aug 5), 5 (Aug 3) = 5 items
// Entries: e1 (Aug 6), e2 (Aug 5), e3 (Aug 3) = 3 entries
assert('T3: thisWeek = 5', stats.thisWeek === 5)
assert('T4: thisWeekEntries = 3', stats.thisWeekEntries === 3)
assert('T5: knownCount = 4', stats.knownCount === 4)

// grammar: items 3,7,8,10 = 4; vocabulary: items 1,4,9 = 3; style: 5,6 = 2; spelling: 2 = 1
assert('T6: mostCommonKind = grammar', stats.mostCommonKind === 'grammar')
assert('T7: mostCommonKindCount = 4', stats.mostCommonKindCount === 4)

// Empty array
const emptyStats = computeLibraryStats([], TODAY, TZ)
assert('T8: empty — total=0, mostCommonKind=null',
  emptyStats.total === 0 && emptyStats.mostCommonKind === null)

// Tie-breaking: create items where grammar and vocabulary both have 2
const tieItems = [
  { ...ITEMS[0], change_type: 'vocabulary' },
  { ...ITEMS[1], change_type: 'vocabulary' },
  { ...ITEMS[2], change_type: 'grammar' },
  { ...ITEMS[3], change_type: 'grammar' },
]
const tieStats = computeLibraryStats(tieItems, TODAY, TZ)
assert('T9: tie — picks alphabetically first (grammar)',
  tieStats.mostCommonKind === 'grammar')

// ── Group 6: Kind filtering ─────────────────────────────────────────────────────
console.log('\nfilterByKind')

assert('K1: all returns all', filterByKind(ITEMS, 'all').length === 10)
assert('K2: grammar returns 4', filterByKind(ITEMS, 'grammar').length === 4)
assert('K3: vocabulary returns 3', filterByKind(ITEMS, 'vocabulary').length === 3)
assert('K4: style returns 2', filterByKind(ITEMS, 'style').length === 2)
assert('K5: spelling returns 1', filterByKind(ITEMS, 'spelling').length === 1)

// ── Summary ─────────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
