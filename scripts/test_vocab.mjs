/**
 * Tests for src/lib/vocab.ts pure functions.
 * Run: node scripts/test_vocab.mjs
 */
import assert from 'node:assert/strict';

// ── Inline pure functions (no build dependency) ──────────────────────────────

function normaliseHeadword(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '');
}

const LLM_POS = new Set(['phrasal verb', 'idiom', 'phrase']);

function routeLookup(headword, pos) {
  if (LLM_POS.has(pos.toLowerCase())) return 'llm';
  const tokens = headword.trim().split(/\s+/);
  if (tokens.length === 1) return 'dictionary';
  return 'llm';
}

function selectSense(entries, pos) {
  if (!entries || entries.length === 0) {
    return { ipa: '', part_of_speech: pos || '', definition: '', example: '' };
  }
  const allMeanings = entries.flatMap(e => e.meanings ?? []);
  const ipa = entries
    .flatMap(e => e.phonetics ?? [])
    .find(p => p.text)?.text
    ?? entries.find(e => e.phonetic)?.phonetic
    ?? '';
  if (allMeanings.length === 0) {
    return { ipa, part_of_speech: pos || '', definition: '', example: '' };
  }
  const posLower = pos.toLowerCase();
  const matched = allMeanings.find(m => m.partOfSpeech?.toLowerCase() === posLower);
  const meaning = matched ?? allMeanings[0];
  if (!meaning.definitions || meaning.definitions.length === 0) {
    return { ipa, part_of_speech: meaning.partOfSpeech ?? pos, definition: '', example: '' };
  }
  const def = meaning.definitions[0];
  return {
    ipa,
    part_of_speech: meaning.partOfSpeech ?? pos,
    definition: def.definition ?? '',
    example: def.example ?? '',
  };
}

function parseLookupResponse(raw) {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  return {
    ipa: typeof obj.ipa === 'string' ? obj.ipa : '',
    part_of_speech: typeof obj.part_of_speech === 'string' ? obj.part_of_speech : '',
    definition: typeof obj.definition === 'string' ? obj.definition : '',
    example: typeof obj.example === 'string' ? obj.example : '',
  };
}

function computePopoverPosition(anchorRect, popoverWidth, popoverHeight, viewportWidth, viewportHeight) {
  const GAP = 8;
  const MARGIN = 8;
  let top = anchorRect.bottom + GAP;
  let above = false;
  if (top + popoverHeight > viewportHeight - MARGIN) {
    top = anchorRect.top - GAP - popoverHeight;
    above = true;
  }
  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  left = Math.max(MARGIN, Math.min(left, viewportWidth - popoverWidth - MARGIN));
  return { top, left, above };
}

// ── Inline buildDiffChanges with new fields ──────────────────────────────────

function buildDiffChanges(spans, modelChanges) {
  const changes = [];
  const used = new Set();
  for (const span of spans) {
    if (span.kind === 'equal') continue;
    let matchedType = null;
    let matchedExplanation = null;
    let matchedHeadword = null;
    let matchedPos = null;
    let matchedWorthSaving = false;
    for (let i = 0; i < modelChanges.length; i++) {
      if (used.has(i)) continue;
      const mc = modelChanges[i];
      const corrOverlap = mc.corrected && span.corrected &&
        (span.corrected.includes(mc.corrected) || mc.corrected.includes(span.corrected));
      const origOverlap = mc.original && span.original &&
        (span.original.includes(mc.original) || mc.original.includes(span.original));
      if (corrOverlap || origOverlap) {
        matchedType = mc.type;
        matchedExplanation = mc.explanation;
        matchedHeadword = mc.headword ?? null;
        matchedPos = mc.pos ?? null;
        matchedWorthSaving = mc.worth_saving ?? false;
        used.add(i);
        break;
      }
    }
    changes.push({
      original: span.original,
      corrected: span.corrected,
      type: matchedType,
      explanation: matchedExplanation,
      headword: matchedHeadword,
      pos: matchedPos,
      worthSaving: matchedWorthSaving,
    });
  }
  return changes;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1: Headword normalisation
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nnormaliseHeadword');

test('H1: trims and lowercases', () => {
  assert.equal(normaliseHeadword('  Comforting  '), 'comforting');
});

test('H2: multi-word lowercase', () => {
  assert.equal(normaliseHeadword('ARRIVED AT'), 'arrived at');
});

test('H3: preserves internal apostrophe', () => {
  assert.equal(normaliseHeadword("  don't  "), "don't");
});

test('H4: strips edge punctuation', () => {
  assert.equal(normaliseHeadword("'hello'"), 'hello');
});

test('H5: preserves hyphen', () => {
  assert.equal(normaliseHeadword('well-known'), 'well-known');
});

test('H6: collapses internal whitespace', () => {
  assert.equal(normaliseHeadword('  in   such  a   hurry '), 'in such a hurry');
});

test('H7: strips ellipsis edges', () => {
  assert.equal(normaliseHeadword('...word...'), 'word');
});

test('H8: single word uppercase', () => {
  assert.equal(normaliseHeadword('THE'), 'the');
});

test('H9: empty string', () => {
  assert.equal(normaliseHeadword(''), '');
});

test('H10: whitespace only', () => {
  assert.equal(normaliseHeadword('   '), '');
});

test('H11: apostrophe with hyphen', () => {
  assert.equal(normaliseHeadword("can't-stop"), "can't-stop");
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2: Routing decision
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nrouteLookup');

test('R1: single-word adjective → dictionary', () => {
  assert.equal(routeLookup('comforting', 'adjective'), 'dictionary');
});

test('R2: phrasal verb → llm regardless of token count', () => {
  assert.equal(routeLookup('arrived at', 'phrasal verb'), 'llm');
});

test('R3: phrase → llm', () => {
  assert.equal(routeLookup('in such a hurry', 'phrase'), 'llm');
});

test('R4: single-word noun → dictionary', () => {
  assert.equal(routeLookup('ring', 'noun'), 'dictionary');
});

test('R5: phrasal verb (pull away) → llm', () => {
  assert.equal(routeLookup('pull away', 'phrasal verb'), 'llm');
});

test('R6: single-word noun (hurry) → dictionary', () => {
  assert.equal(routeLookup('hurry', 'noun'), 'dictionary');
});

test('R7: multi-token verb → llm', () => {
  assert.equal(routeLookup('look up', 'verb'), 'llm');
});

test('R8: single-word verb → dictionary', () => {
  assert.equal(routeLookup('break', 'verb'), 'dictionary');
});

test('R9: idiom → llm', () => {
  assert.equal(routeLookup('kind of', 'idiom'), 'llm');
});

test('R10: single-word adverb → dictionary', () => {
  assert.equal(routeLookup('well', 'adverb'), 'dictionary');
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3: Sense selection
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nselectSense');

const RING_RESPONSE = [{
  word: 'ring',
  phonetic: '/rɪŋ/',
  phonetics: [{ text: '/rɪŋ/' }],
  meanings: [
    {
      partOfSpeech: 'noun',
      definitions: [
        { definition: 'A circular band worn as an ornament.', example: 'She wore a gold ring.' },
        { definition: 'An enclosed area for boxing or wrestling.' },
      ],
    },
    {
      partOfSpeech: 'verb',
      definitions: [
        { definition: 'To make a clear resonant sound.', example: 'The phone rang.' },
        { definition: 'To surround or encircle.' },
      ],
    },
  ],
}];

test('S1: verb pos → selects verb meaning', () => {
  const r = selectSense(RING_RESPONSE, 'verb');
  assert.equal(r.part_of_speech, 'verb');
  assert.ok(r.definition.startsWith('To make a clear'));
  assert.equal(r.example, 'The phone rang.');
  assert.equal(r.ipa, '/rɪŋ/');
});

test('S2: noun pos → selects noun meaning', () => {
  const r = selectSense(RING_RESPONSE, 'noun');
  assert.equal(r.part_of_speech, 'noun');
  assert.ok(r.definition.startsWith('A circular band'));
});

test('S3: adjective pos (no match) → falls back to first meaning', () => {
  const r = selectSense(RING_RESPONSE, 'adjective');
  assert.equal(r.part_of_speech, 'noun'); // first meaning
  assert.ok(r.definition.startsWith('A circular band'));
});

test('S4: empty array → empty result', () => {
  const r = selectSense([], 'noun');
  assert.equal(r.ipa, '');
  assert.equal(r.definition, '');
});

test('S5: phonetic field only (no phonetics array)', () => {
  const r = selectSense([{
    word: 'test',
    phonetic: '/tɛst/',
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A trial.' }] }],
  }], 'noun');
  assert.equal(r.ipa, '/tɛst/');
  assert.equal(r.definition, 'A trial.');
});

test('S6: meaning with empty definitions array', () => {
  const r = selectSense([{
    word: 'x',
    meanings: [{ partOfSpeech: 'noun', definitions: [] }],
  }], 'noun');
  assert.equal(r.definition, '');
});

test('S7: multiple entries, IPA from second entry phonetics', () => {
  const r = selectSense([
    { word: 'a', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'First.' }] }] },
    { word: 'a', phonetics: [{ text: '/eɪ/' }], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Second.' }] }] },
  ], 'noun');
  assert.equal(r.ipa, '/eɪ/');
  assert.equal(r.definition, 'First.'); // first meaning overall
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4: Matching model edits onto diff spans (with vocab metadata)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nbuildDiffChanges with vocab metadata');

test('M1: matched span propagates headword/pos/worthSaving', () => {
  const spans = [
    { kind: 'equal', original: 'I ', corrected: 'I ' },
    { kind: 'replaced', original: 'waked up', corrected: 'woke up' },
    { kind: 'equal', original: ' early', corrected: ' early' },
  ];
  const modelChanges = [
    { original: 'waked up', corrected: 'woke up', type: 'grammar',
      explanation: 'Past tense of wake is woke',
      headword: 'wake', pos: 'verb', worth_saving: true },
  ];
  const result = buildDiffChanges(spans, modelChanges);
  assert.equal(result.length, 1);
  assert.equal(result[0].headword, 'wake');
  assert.equal(result[0].pos, 'verb');
  assert.equal(result[0].worthSaving, true);
});

test('M2: unmatched span defaults to null/false', () => {
  const spans = [
    { kind: 'replaced', original: 'foo', corrected: 'bar' },
  ];
  const result = buildDiffChanges(spans, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].headword, null);
  assert.equal(result[0].pos, null);
  assert.equal(result[0].worthSaving, false);
});

test('M3: model change without vocab fields → null/false', () => {
  const spans = [
    { kind: 'replaced', original: 'abc', corrected: 'def' },
  ];
  const modelChanges = [
    { original: 'abc', corrected: 'def', type: 'grammar', explanation: 'Fix' },
  ];
  const result = buildDiffChanges(spans, modelChanges);
  assert.equal(result[0].headword, null);
  assert.equal(result[0].pos, null);
  assert.equal(result[0].worthSaving, false);
});

test('M4: worth_saving false propagated correctly', () => {
  const spans = [
    { kind: 'replaced', original: 'a important', corrected: 'an important' },
  ];
  const modelChanges = [
    { original: 'a important', corrected: 'an important', type: 'grammar',
      explanation: 'Use an before vowels',
      headword: 'an', pos: 'determiner', worth_saving: false },
  ];
  const result = buildDiffChanges(spans, modelChanges);
  assert.equal(result[0].worthSaving, false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5: LLM definition parser
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nparseLookupResponse');

test('L1: valid JSON → all fields', () => {
  const r = parseLookupResponse('{"ipa":"/kəmˈfɔːrtɪŋ/","part_of_speech":"adjective","definition":"Making you feel calm.","example":"A comforting cup of tea."}');
  assert.equal(r.ipa, '/kəmˈfɔːrtɪŋ/');
  assert.equal(r.part_of_speech, 'adjective');
  assert.equal(r.definition, 'Making you feel calm.');
  assert.equal(r.example, 'A comforting cup of tea.');
});

test('L2: fenced JSON → parsed', () => {
  const r = parseLookupResponse('```json\n{"ipa":"/x/","part_of_speech":"n","definition":"d","example":"e"}\n```');
  assert.equal(r.ipa, '/x/');
});

test('L3: prose preamble → extracts JSON', () => {
  const r = parseLookupResponse('Sure! Here is the definition: {"ipa":"","part_of_speech":"","definition":"","example":""} Hope that helps!');
  assert.notEqual(r, null);
  assert.equal(r.ipa, '');
});

test('L4: not JSON → null', () => {
  assert.equal(parseLookupResponse('not json at all'), null);
});

test('L5: empty object → all fields empty string', () => {
  const r = parseLookupResponse('{}');
  assert.notEqual(r, null);
  assert.equal(r.ipa, '');
  assert.equal(r.part_of_speech, '');
  assert.equal(r.definition, '');
  assert.equal(r.example, '');
});

test('L6: non-string ipa → empty string', () => {
  const r = parseLookupResponse('{"ipa": 123}');
  assert.equal(r.ipa, '');
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6: Popover coordinate maths
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\ncomputePopoverPosition');

test('P1: below + centered', () => {
  const r = computePopoverPosition(
    { top: 100, bottom: 120, left: 200, width: 80 },
    236, 40, 1024, 768,
  );
  assert.equal(r.above, false);
  assert.equal(r.top, 128); // 120 + 8
  // centered: 200 + 80/2 - 236/2 = 200 + 40 - 118 = 122
  assert.equal(r.left, 122);
});

test('P2: flip above when not enough room below', () => {
  const r = computePopoverPosition(
    { top: 740, bottom: 760, left: 200, width: 80 },
    236, 40, 1024, 768,
  );
  assert.equal(r.above, true);
  assert.equal(r.top, 692); // 740 - 8 - 40
});

test('P3: right edge clamp at 390px viewport', () => {
  const r = computePopoverPosition(
    { top: 100, bottom: 120, left: 370, width: 20 },
    236, 40, 390, 844,
  );
  assert.ok(r.left <= 390 - 236 - 8, `left ${r.left} should be ≤ ${390 - 236 - 8}`);
  assert.ok(r.left >= 8, `left ${r.left} should be ≥ 8`);
});

test('P4: left edge clamp', () => {
  const r = computePopoverPosition(
    { top: 100, bottom: 120, left: 0, width: 20 },
    236, 40, 390, 844,
  );
  assert.ok(r.left >= 8, `left ${r.left} should be ≥ 8`);
});

test('P5: narrow viewport, popover fills width with margins', () => {
  const r = computePopoverPosition(
    { top: 100, bottom: 120, left: 10, width: 50 },
    236, 40, 260, 844,
  );
  // viewport 260, popover 236 → max left = 260 - 236 - 8 = 16
  assert.ok(r.left >= 8);
  assert.ok(r.left <= 16);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
