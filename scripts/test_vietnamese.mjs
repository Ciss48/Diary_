/**
 * Phase 16 — Vietnamese feature pure-function tests
 * Run: node scripts/test_vietnamese.mjs
 */

// ── Inline implementations (mirror src/lib/vocab.ts, no TS build needed) ────

function normalisePairKey(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normaliseHeadword(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '')
}

function parseVietnameseResponse(raw) {
  let text = raw.trim()

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return { meaning: '', explanation: '' }
  text = text.slice(start, end + 1)

  let obj
  try { obj = JSON.parse(text) } catch { return { meaning: '', explanation: '' } }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
    return { meaning: '', explanation: '' }

  return {
    meaning: typeof obj.meaning === 'string' ? obj.meaning : '',
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
  }
}

function canHaveExplanation(original) {
  return original.trim().length > 0
}

function computePopoverPosition(anchorRect, popoverWidth, popoverHeight, viewportWidth, viewportHeight) {
  const GAP = 8
  const MARGIN = 8

  let top = anchorRect.bottom + GAP
  let above = false

  if (top + popoverHeight > viewportHeight - MARGIN) {
    top = anchorRect.top - GAP - popoverHeight
    above = true
  }

  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
  left = Math.max(MARGIN, Math.min(left, viewportWidth - popoverWidth - MARGIN))

  return { top, left, above }
}

// ── Test harness ────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(label, actual, expected) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    passed++
  } else {
    failed++
    console.error(`  FAIL: ${label}`)
    console.error(`    expected: ${expectedStr}`)
    console.error(`    actual:   ${actualStr}`)
  }
}

// ── A. normalisePairKey ─────────────────────────────────────────────────────

console.log('A. normalisePairKey')
assert('trims + lowercases', normalisePairKey('  In Such a Hurry  '), 'in such a hurry')
assert('collapses whitespace', normalisePairKey('arrived   at'), 'arrived at')
assert('empty string', normalisePairKey(''), '')
assert('keeps punctuation', normalisePairKey('Hello, world!'), 'hello, world!')
assert('whitespace only', normalisePairKey('  '), '')

// ── B. normaliseHeadword (for meaning key) ──────────────────────────────────

console.log('B. normaliseHeadword (meaning key)')
assert('simple word', normaliseHeadword('comforting'), 'comforting')
assert('trims + lowercases multi-word', normaliseHeadword('  In Such a Hurry '), 'in such a hurry')
assert('strips non-alnum edges', normaliseHeadword('...arrived at...'), 'arrived at')

// ── C. parseVietnameseResponse ──────────────────────────────────────────────

console.log('C. parseVietnameseResponse')
assert('valid JSON',
  parseVietnameseResponse('{"meaning":"rất vội","explanation":"vì đây là cụm cố định"}'),
  { meaning: 'rất vội', explanation: 'vì đây là cụm cố định' })

assert('fenced JSON',
  parseVietnameseResponse('```json\n{"meaning":"test","explanation":""}\n```'),
  { meaning: 'test', explanation: '' })

assert('preamble + trailing',
  parseVietnameseResponse('Some preamble {"meaning":"ok","explanation":"fine"} trailing'),
  { meaning: 'ok', explanation: 'fine' })

assert('wrong types',
  parseVietnameseResponse('{"meaning":123,"explanation":null}'),
  { meaning: '', explanation: '' })

assert('not json',
  parseVietnameseResponse('not json at all'),
  { meaning: '', explanation: '' })

assert('empty string',
  parseVietnameseResponse(''),
  { meaning: '', explanation: '' })

assert('missing explanation',
  parseVietnameseResponse('{"meaning":"ok"}'),
  { meaning: 'ok', explanation: '' })

assert('missing meaning',
  parseVietnameseResponse('{"explanation":"only this"}'),
  { meaning: '', explanation: 'only this' })

assert('broken json',
  parseVietnameseResponse('{broken json'),
  { meaning: '', explanation: '' })

assert('array',
  parseVietnameseResponse('[1,2,3]'),
  { meaning: '', explanation: '' })

assert('null json',
  parseVietnameseResponse('null'),
  { meaning: '', explanation: '' })

// ── D. canHaveExplanation ───────────────────────────────────────────────────

console.log('D. canHaveExplanation')
assert('non-empty original', canHaveExplanation('rất vội vàng'), true)
assert('empty string', canHaveExplanation(''), false)
assert('whitespace only', canHaveExplanation('  '), false)
assert('has content', canHaveExplanation('I wrote something'), true)

// ── E. computePopoverPosition with grown popover ────────────────────────────

console.log('E. computePopoverPosition (reposition after grow)')

{
  const pos = computePopoverPosition(
    { top: 100, bottom: 120, left: 200, width: 80 },
    280, 120, 1024, 768
  )
  assert('grows below, still fits — below', pos.above, false)
  assert('grows below, still fits — top', pos.top, 128)
}

{
  const pos = computePopoverPosition(
    { top: 600, bottom: 620, left: 200, width: 80 },
    280, 200, 1024, 768
  )
  assert('grows below, flips above', pos.above, true)
  assert('grows below, flips above — top', pos.top, 392)
}

{
  const pos = computePopoverPosition(
    { top: 100, bottom: 120, left: 10, width: 40 },
    280, 120, 390, 844
  )
  assert('clamps left edge', pos.left, 8)
  assert('clamps left edge — below', pos.above, false)
}

{
  const pos = computePopoverPosition(
    { top: 100, bottom: 120, left: 350, width: 30 },
    280, 120, 390, 844
  )
  assert('clamps right edge', pos.left, 102)
}

{
  const pos = computePopoverPosition(
    { top: 780, bottom: 800, left: 350, width: 30 },
    280, 150, 390, 844
  )
  assert('flips + clamps right — above', pos.above, true)
  assert('flips + clamps right — left', pos.left, 102)
}

{
  // Tiny viewport, large content — anchor near middle
  const pos = computePopoverPosition(
    { top: 300, bottom: 320, left: 50, width: 60 },
    280, 250, 390, 667
  )
  // below: 320+8+250=578 < 667-8=659 → fits below
  assert('tiny viewport large content — below', pos.above, false)
  assert('tiny viewport large content — top', pos.top, 328)
  assert('tiny viewport large content — left clamped', pos.left, 8)
}

{
  // Tiny viewport, anchor near bottom → flips above
  const pos = computePopoverPosition(
    { top: 500, bottom: 520, left: 50, width: 60 },
    280, 250, 390, 667
  )
  assert('tiny viewport bottom — flips above', pos.above, true)
  assert('tiny viewport bottom — top', pos.top, 242)
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
