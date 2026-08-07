/**
 * Tests for Phase 17: Vietnamese on vocabulary cards.
 * Run: node scripts/test_vietnamese_cards.mjs
 */

import { getViCardState } from '../src/lib/vocab.ts'
import { searchItems } from '../src/lib/vocabLibrary.ts'

let pass = 0
let fail = 0

function assert(label, actual, expected) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    pass++
  } else {
    fail++
    console.error(`FAIL: ${label}\n  expected: ${expectedStr}\n  actual:   ${actualStr}`)
  }
}

// ── A. getViCardState ──────────────────────────────────────────────────────────

assert(
  'has meaning + explanation → has-both',
  getViCardState({ vi_meaning: 'làm yên lòng', vi_explanation: 'vì diễn tả cảm giác...' }),
  'has-both'
)

assert(
  'has meaning, empty explanation → has-meaning-only',
  getViCardState({ vi_meaning: 'làm yên lòng', vi_explanation: '' }),
  'has-meaning-only'
)

assert(
  'has meaning, undefined explanation → has-meaning-only',
  getViCardState({ vi_meaning: 'làm yên lòng', vi_explanation: undefined }),
  'has-meaning-only'
)

assert(
  'empty meaning, empty explanation → not-cached',
  getViCardState({ vi_meaning: '', vi_explanation: '' }),
  'not-cached'
)

assert(
  'undefined meaning, undefined explanation → not-cached',
  getViCardState({ vi_meaning: undefined, vi_explanation: undefined }),
  'not-cached'
)

assert(
  'empty meaning with explanation → not-cached (meaning is primary)',
  getViCardState({ vi_meaning: '', vi_explanation: 'something' }),
  'not-cached'
)

assert(
  'no vi fields at all → not-cached',
  getViCardState({}),
  'not-cached'
)

// ── B. searchItems with vi_meaning ─────────────────────────────────────────────

const ITEMS = [
  {
    id: '1', display_form: 'in such a hurry', headword: 'in such a hurry',
    original_form: 'rất vội vàng', change_type: 'vocabulary', status: 'learning',
    created_at: '2026-08-06T10:00:00+07:00', entry_date: '2026-08-06', entry_id: 'e1',
    definition: { id: 'd1', ipa: '', part_of_speech: 'phrase', definition: 'Moving very fast.', example: 'She was in such a hurry.', source: 'llm' },
    vi_meaning: 'rất vội vàng, gấp gáp',
    vi_explanation: 'Cách nói "in such a hurry" tự nhiên hơn vì diễn tả sự gấp gáp.'
  },
  {
    id: '2', display_form: 'comforting', headword: 'comforting',
    original_form: 'comfortable', change_type: 'vocabulary', status: 'learning',
    created_at: '2026-08-06T11:00:00+07:00', entry_date: '2026-08-06', entry_id: 'e1',
    definition: { id: 'd2', ipa: '/ˈkʌm.fə.tɪŋ/', part_of_speech: 'adjective', definition: 'Making you feel calmer.', example: 'A comforting movie.', source: 'dictionary' },
    vi_meaning: 'làm yên lòng, an ủi',
    vi_explanation: '"Comforting" diễn tả cảm giác an ủi.'
  },
  {
    id: '3', display_form: 'arrived at', headword: 'arrived at',
    original_form: 'arrived to', change_type: 'grammar', status: 'learning',
    created_at: '2026-08-05T22:30:00+07:00', entry_date: '2026-08-05', entry_id: 'e2',
    definition: { id: 'd3', ipa: '', part_of_speech: 'phrasal verb', definition: 'To reach a place.', example: 'We arrived at the office.', source: 'llm' },
    vi_meaning: 'đến nơi',
    vi_explanation: ''
  },
  {
    id: '4', display_form: 'overslept', headword: 'overslept',
    original_form: 'still woke up late', change_type: 'style', status: 'learning',
    created_at: '2026-08-03T15:00:00+07:00', entry_date: '2026-08-03', entry_id: 'e3',
    definition: { id: 'd4', ipa: '', part_of_speech: 'verb', definition: 'To sleep longer than intended.', example: 'I overslept.', source: 'dictionary' },
    // No Vietnamese
  },
]

// Search Vietnamese with diacritics
assert(
  'search "vội" matches vi_meaning',
  searchItems(ITEMS, 'vội').map(i => i.id),
  ['1']
)

// Search Vietnamese without diacritics (accent-tolerant)
assert(
  'search "voi" (no diacritics) matches "vội"',
  searchItems(ITEMS, 'voi').map(i => i.id),
  ['1']
)

// Search Vietnamese substring
assert(
  'search "gấp gáp" matches vi_meaning substring',
  searchItems(ITEMS, 'gấp gáp').map(i => i.id),
  ['1']
)

// Search Vietnamese accent-stripped
assert(
  'search "gap gap" matches "gấp gáp"',
  searchItems(ITEMS, 'gap gap').map(i => i.id),
  ['1']
)

// Search Vietnamese meaning on another item
assert(
  'search "yên lòng" matches comforting vi_meaning',
  searchItems(ITEMS, 'yên lòng').map(i => i.id),
  ['2']
)

// English still works
assert(
  'search "hurry" matches English display_form',
  searchItems(ITEMS, 'hurry').map(i => i.id),
  ['1']
)

// No false positive
assert(
  'search "xin chào" matches nothing',
  searchItems(ITEMS, 'xin chào').map(i => i.id),
  []
)

// Query that matches ONLY Vietnamese, not English
assert(
  'search "gấp gáp" matches only Vietnamese (no English field has this)',
  searchItems(ITEMS, 'gấp gáp').length,
  1
)

// ── C. Diacritics edge cases ───────────────────────────────────────────────────

// Item with đ in vi_meaning
const ITEMS_DIACRITICS = [
  {
    id: '10', display_form: 'arrived at', headword: 'arrived at',
    original_form: '', change_type: 'grammar', status: 'learning',
    created_at: '2026-08-06T10:00:00+07:00', entry_date: '2026-08-06', entry_id: 'e1',
    definition: null,
    vi_meaning: 'đến nơi',
  },
]

assert(
  'search "đen" matches "đến" (đ preserved, tonal stripped)',
  searchItems(ITEMS_DIACRITICS, 'đen').map(i => i.id),
  ['10']
)

assert(
  'search "den" does NOT match "đến" (đ ≠ d)',
  searchItems(ITEMS_DIACRITICS, 'den').map(i => i.id),
  []
)

// Vietnamese with multiple diacritics
const ITEMS_MULTI = [
  {
    id: '11', display_form: 'wished', headword: 'wished',
    original_form: '', change_type: 'vocabulary', status: 'learning',
    created_at: '2026-08-06T10:00:00+07:00', entry_date: '2026-08-06', entry_id: 'e1',
    definition: null,
    vi_meaning: 'ước muốn, mong ước',
  },
]

assert(
  'search "uoc" matches "ước"',
  searchItems(ITEMS_MULTI, 'uoc').map(i => i.id),
  ['11']
)

assert(
  'search "nghia" does not false-positive on unrelated items',
  searchItems(ITEMS_MULTI, 'nghia').map(i => i.id),
  []
)

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
