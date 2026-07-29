/**
 * Tests for src/lib/suggestions.ts (parseSuggestion + segmentCorrected).
 * Run: node scripts/test_suggestions.mjs
 */
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline the pure functions so this script has no build dependency.
// Keep in sync with src/lib/suggestions.ts.
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['grammar', 'vocabulary', 'style', 'spelling']);

function filterChanges(items) {
  return items
    .filter((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
      return (
        typeof item.original === 'string' &&
        typeof item.corrected === 'string' &&
        typeof item.type === 'string' &&
        VALID_TYPES.has(item.type) &&
        typeof item.explanation === 'string'
      );
    })
    .map((item) => ({
      original: item.original,
      corrected: item.corrected,
      type: item.type,
      explanation: item.explanation,
    }));
}

function parseSuggestion(raw) {
  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;

  const cv = obj.corrected_version;
  if (typeof cv !== 'string' || cv.trim() === '') return null;

  const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];
  const changes = filterChanges(rawChanges);

  const overall_feedback = typeof obj.overall_feedback === 'string' ? obj.overall_feedback : '';

  return { corrected_version: cv, changes, overall_feedback };
}

function segmentCorrected(corrected, changes) {
  const segments = [];
  let cursor = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (change.corrected === '') continue;

    const idx = corrected.indexOf(change.corrected, cursor);
    if (idx === -1) continue;

    if (idx > cursor) {
      segments.push({ text: corrected.slice(cursor, idx), changeIndex: null });
    }
    segments.push({ text: change.corrected, changeIndex: i });
    cursor = idx + change.corrected.length;
  }

  if (cursor < corrected.length) {
    segments.push({ text: corrected.slice(cursor), changeIndex: null });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Helper for a minimal Change object
// ---------------------------------------------------------------------------
function ch(corrected) {
  return { original: 'x', corrected, type: 'grammar', explanation: 'e' };
}

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

// ===========================================================================
// segmentCorrected
// ===========================================================================
console.log('\nsegmentCorrected');

// Fixture 1: no changes → 1 segment, changeIndex null
test('F1: no changes → 1 segment null', () => {
  const segs = segmentCorrected('I go to school.', []);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, 'I go to school.');
  assert.equal(segs[0].changeIndex, null);
});

// Fixture 2: one word replacement → 3 segments, middle has changeIndex 0
test('F2: single change → 3 segments, middle changeIndex 0', () => {
  const segs = segmentCorrected('I went to school.', [ch('went')]);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].text, 'I ');
  assert.equal(segs[0].changeIndex, null);
  assert.equal(segs[1].text, 'went');
  assert.equal(segs[1].changeIndex, 0);
  assert.equal(segs[2].text, ' to school.');
  assert.equal(segs[2].changeIndex, null);
});

// Fixture 3: two identical fragments → highlighted at two DIFFERENT positions
test('F3: duplicate fragments highlighted at distinct positions', () => {
  const segs = segmentCorrected('I like it. I like it.', [ch('like'), ch('like')]);
  // Both highlight segments must have different text-positions (covered by changeIndex)
  const highlights = segs.filter((s) => s.changeIndex !== null);
  assert.equal(highlights.length, 2);
  assert.equal(highlights[0].changeIndex, 0);
  assert.equal(highlights[1].changeIndex, 1);
  // Their positions in the joined string differ
  let pos0 = -1, pos1 = -1, cur = 0;
  for (const s of segs) {
    if (s.changeIndex === 0) pos0 = cur;
    if (s.changeIndex === 1) pos1 = cur;
    cur += s.text.length;
  }
  assert.ok(pos0 !== pos1, 'the two highlights must be at different character offsets');
});

// Fixture 4: corrected fragment not present → no highlight, no throw
test('F4: fragment not in corrected → 1 segment null, no throw', () => {
  const segs = segmentCorrected('Hello world', [ch('zzz')]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].changeIndex, null);
  assert.equal(segs[0].text, 'Hello world');
});

// Fixture 5: two adjacent fragments → exactly 2 segments, no empty in between
test('F5: adjacent fragments → 2 segments, no empty segment', () => {
  const segs = segmentCorrected('abcdef', [ch('abc'), ch('def')]);
  assert.equal(segs.length, 2);
  assert.ok(segs.every((s) => s.text.length > 0), 'no empty segments');
  assert.equal(segs[0].text, 'abc');
  assert.equal(segs[0].changeIndex, 0);
  assert.equal(segs[1].text, 'def');
  assert.equal(segs[1].changeIndex, 1);
});

// Fixture 6: single fragment = whole string → 1 segment, changeIndex 0
test('F6: whole string as single fragment → 1 segment changeIndex 0', () => {
  const segs = segmentCorrected('abc', [ch('abc')]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, 'abc');
  assert.equal(segs[0].changeIndex, 0);
});

// Fixture 7: empty corrected field → change skipped, 1 segment null
test('F7: empty corrected field skipped → 1 segment null', () => {
  const segs = segmentCorrected('Hello world', [ch('')]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].changeIndex, null);
});

// Fixture 8: second change is before cursor → it is skipped
test('F8: change before cursor (already past) → skipped', () => {
  // changes: ["three", "one"] — "three" matches at 8, cursor=13; "one" at 0 < 13 → skip
  const segs = segmentCorrected('one two three', [ch('three'), ch('one')]);
  const highlights = segs.filter((s) => s.changeIndex !== null);
  assert.equal(highlights.length, 1);
  assert.equal(highlights[0].text, 'three');
  assert.equal(highlights[0].changeIndex, 0);
});

// Join invariant: for all 8 fixtures the joined text === corrected
test('JOIN INVARIANT: all 8 fixtures satisfy join === corrected', () => {
  const cases = [
    ['I go to school.', []],
    ['I went to school.', [ch('went')]],
    ['I like it. I like it.', [ch('like'), ch('like')]],
    ['Hello world', [ch('zzz')]],
    ['abcdef', [ch('abc'), ch('def')]],
    ['abc', [ch('abc')]],
    ['Hello world', [ch('')]],
    ['one two three', [ch('three'), ch('one')]],
  ];
  for (const [corrected, changes] of cases) {
    const segs = segmentCorrected(corrected, changes);
    const joined = segs.map((s) => s.text).join('');
    assert.equal(joined, corrected, `join failed for corrected="${corrected}"`);
    // Also assert no empty segments
    for (const s of segs) {
      assert.ok(s.text.length > 0, `empty segment in corrected="${corrected}"`);
    }
  }
});

// ===========================================================================
// parseSuggestion
// ===========================================================================
console.log('\nparseSuggestion');

const VALID_CHANGE = {
  original: 'go',
  corrected: 'went',
  type: 'grammar',
  explanation: 'Past tense required.',
};

const VALID_PAYLOAD = JSON.stringify({
  corrected_version: 'I went to school.',
  changes: [VALID_CHANGE],
  overall_feedback: 'Good effort!',
});

// 1. Plain valid JSON
test('P1: plain valid JSON → full payload', () => {
  const result = parseSuggestion(VALID_PAYLOAD);
  assert.ok(result !== null);
  assert.equal(result.corrected_version, 'I went to school.');
  assert.equal(result.changes.length, 1);
  assert.equal(result.overall_feedback, 'Good effort!');
});

// 2. JSON wrapped in ```json ... ```
test('P2: markdown-fenced JSON → parsed correctly', () => {
  const fenced = '```json\n' + VALID_PAYLOAD + '\n```';
  const result = parseSuggestion(fenced);
  assert.ok(result !== null);
  assert.equal(result.corrected_version, 'I went to school.');
});

// 3. Prose preamble before {
test('P3: prose preamble before { → still parsed', () => {
  const withPreamble = 'Here is the result:\n' + VALID_PAYLOAD;
  const result = parseSuggestion(withPreamble);
  assert.ok(result !== null);
  assert.equal(result.corrected_version, 'I went to school.');
});

// 4. Not JSON at all → null
test('P4: not JSON → null', () => {
  assert.equal(parseSuggestion('Sorry, I cannot help with that.'), null);
});

// 5. Missing corrected_version → null
test('P5: missing corrected_version → null', () => {
  const bad = JSON.stringify({ changes: [], overall_feedback: 'ok' });
  assert.equal(parseSuggestion(bad), null);
});

// 6. corrected_version empty string → null
test('P6a: corrected_version empty string → null', () => {
  const bad = JSON.stringify({ corrected_version: '', changes: [], overall_feedback: '' });
  assert.equal(parseSuggestion(bad), null);
});

test('P6b: corrected_version whitespace only → null', () => {
  const bad = JSON.stringify({ corrected_version: '   ', changes: [], overall_feedback: '' });
  assert.equal(parseSuggestion(bad), null);
});

// 7. changes is an object (not array) → changes becomes [], not null
test('P7: changes is object → changes=[], not null', () => {
  const payload = JSON.stringify({
    corrected_version: 'Hello.',
    changes: { 0: VALID_CHANGE },
    overall_feedback: '',
  });
  const result = parseSuggestion(payload);
  assert.ok(result !== null);
  assert.deepEqual(result.changes, []);
});

// 8. Mixed changes array: 1 valid + 1 missing explanation + 1 type "vibes" → keep 1
test('P8: mixed changes array → only 1 valid item kept', () => {
  const payload = JSON.stringify({
    corrected_version: 'Test.',
    changes: [
      VALID_CHANGE,
      { original: 'x', corrected: 'y', type: 'grammar' /* missing explanation */ },
      { original: 'a', corrected: 'b', type: 'vibes', explanation: 'bad type' },
    ],
    overall_feedback: '',
  });
  const result = parseSuggestion(payload);
  assert.ok(result !== null);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].corrected, 'went');
});

// 9. Missing overall_feedback → ''
test('P9: missing overall_feedback → empty string', () => {
  const payload = JSON.stringify({
    corrected_version: 'Hello.',
    changes: [],
  });
  const result = parseSuggestion(payload);
  assert.ok(result !== null);
  assert.equal(result.overall_feedback, '');
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
