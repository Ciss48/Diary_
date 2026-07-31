/**
 * Tests for src/lib/diff.ts (tokenize, diffTexts, diffToSegments, buildDiffChanges).
 * Run: node scripts/test_diff.mjs
 */
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline the pure functions so this script has no build dependency.
// Keep in sync with src/lib/diff.ts.
// ---------------------------------------------------------------------------

function tokenize(text) {
  const tokens = [];
  const re = /(\w+)/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isWord: false });
  }
  return tokens;
}

function lcsWords(aTokens, bTokens) {
  const aWords = [];
  const bWords = [];
  for (let i = 0; i < aTokens.length; i++) {
    if (aTokens[i].isWord) aWords.push({ text: aTokens[i].text, idx: i });
  }
  for (let i = 0; i < bTokens.length; i++) {
    if (bTokens[i].isWord) bWords.push({ text: bTokens[i].text, idx: i });
  }
  const m = aWords.length;
  const n = bWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aWords[i - 1].text === bWords[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (aWords[i - 1].text === bWords[j - 1].text) {
      pairs.push([aWords[i - 1].idx, bWords[j - 1].idx]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

function joinTokens(tokens, from, to) {
  let s = '';
  for (let i = from; i < to; i++) s += tokens[i].text;
  return s;
}

function pushNonEqual(spans, orig, corr) {
  if (orig && corr) {
    spans.push({ kind: 'replaced', original: orig, corrected: corr });
  } else if (corr) {
    spans.push({ kind: 'inserted', original: '', corrected: corr });
  } else if (orig) {
    spans.push({ kind: 'deleted', original: orig, corrected: '' });
  }
}

function extractCommonWhitespace(a, b) {
  let leadLen = 0;
  const minLead = Math.min(a.length, b.length);
  while (leadLen < minLead && a[leadLen] === b[leadLen] && /\s/.test(a[leadLen])) {
    leadLen++;
  }
  const aAfterLead = a.slice(leadLen);
  const bAfterLead = b.slice(leadLen);
  let trailLen = 0;
  const minTrail = Math.min(aAfterLead.length, bAfterLead.length);
  while (
    trailLen < minTrail &&
    aAfterLead[aAfterLead.length - 1 - trailLen] === bAfterLead[bAfterLead.length - 1 - trailLen] &&
    /\s/.test(aAfterLead[aAfterLead.length - 1 - trailLen])
  ) {
    trailLen++;
  }
  return {
    leading: a.slice(0, leadLen),
    origMiddle: aAfterLead.slice(0, aAfterLead.length - trailLen),
    corrMiddle: bAfterLead.slice(0, bAfterLead.length - trailLen),
    trailing: trailLen > 0 ? aAfterLead.slice(aAfterLead.length - trailLen) : '',
  };
}

function mergeAdjacentSpans(spans) {
  if (spans.length === 0) return spans;
  const result = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const prev = result[result.length - 1];
    const curr = spans[i];
    if (prev.kind === 'equal' && curr.kind === 'equal') {
      result[result.length - 1] = {
        kind: 'equal',
        original: prev.original + curr.original,
        corrected: prev.corrected + curr.corrected,
      };
    } else if (prev.kind !== 'equal' && curr.kind !== 'equal') {
      result[result.length - 1] = {
        kind: 'replaced',
        original: prev.original + curr.original,
        corrected: prev.corrected + curr.corrected,
      };
    } else {
      result.push(curr);
    }
  }
  return result;
}

function refineSpans(rawSpans, original, corrected) {
  const anchors = [];
  let oCursor = 0;
  let cCursor = 0;
  for (const span of rawSpans) {
    oCursor += span.original.length;
    cCursor += span.corrected.length;
    if (span.kind === 'equal') {
      anchors.push({
        origStart: oCursor - span.original.length,
        origEnd: oCursor,
        corrStart: cCursor - span.corrected.length,
        corrEnd: cCursor,
      });
    }
  }
  const result = [];
  let oPos = 0;
  let cPos = 0;
  for (const anchor of anchors) {
    const origGap = original.slice(oPos, anchor.origStart);
    const corrGap = corrected.slice(cPos, anchor.corrStart);
    if (origGap === corrGap && origGap.length > 0) {
      result.push({ kind: 'equal', original: origGap, corrected: corrGap });
    } else if (origGap || corrGap) {
      const { leading, origMiddle, corrMiddle, trailing } = extractCommonWhitespace(origGap, corrGap);
      if (leading) result.push({ kind: 'equal', original: leading, corrected: leading });
      if (origMiddle || corrMiddle) pushNonEqual(result, origMiddle, corrMiddle);
      if (trailing) result.push({ kind: 'equal', original: trailing, corrected: trailing });
    }
    const wordText = original.slice(anchor.origStart, anchor.origEnd);
    result.push({ kind: 'equal', original: wordText, corrected: wordText });
    oPos = anchor.origEnd;
    cPos = anchor.corrEnd;
  }
  const origTail = original.slice(oPos);
  const corrTail = corrected.slice(cPos);
  if (origTail === corrTail && origTail.length > 0) {
    result.push({ kind: 'equal', original: origTail, corrected: origTail });
  } else if (origTail || corrTail) {
    const { leading, origMiddle, corrMiddle, trailing } = extractCommonWhitespace(origTail, corrTail);
    if (leading) result.push({ kind: 'equal', original: leading, corrected: leading });
    if (origMiddle || corrMiddle) pushNonEqual(result, origMiddle, corrMiddle);
    if (trailing) result.push({ kind: 'equal', original: trailing, corrected: trailing });
  }
  return mergeAdjacentSpans(result);
}

function diffTexts(original, corrected) {
  if (original === corrected) {
    return original.length > 0
      ? [{ kind: 'equal', original, corrected }]
      : [];
  }
  const aTokens = tokenize(original);
  const bTokens = tokenize(corrected);
  const matches = lcsWords(aTokens, bTokens);
  const rawSpans = [];
  let ai = 0;
  let bi = 0;
  for (const [ma, mb] of matches) {
    const origBefore = joinTokens(aTokens, ai, ma);
    const corrBefore = joinTokens(bTokens, bi, mb);
    if (origBefore || corrBefore) {
      pushNonEqual(rawSpans, origBefore, corrBefore);
    }
    const wordText = aTokens[ma].text;
    rawSpans.push({ kind: 'equal', original: wordText, corrected: wordText });
    ai = ma + 1;
    bi = mb + 1;
  }
  const origAfter = joinTokens(aTokens, ai, aTokens.length);
  const corrAfter = joinTokens(bTokens, bi, bTokens.length);
  if (origAfter || corrAfter) {
    pushNonEqual(rawSpans, origAfter, corrAfter);
  }
  return refineSpans(rawSpans, original, corrected);
}

function diffToSegments(spans) {
  const segments = [];
  let changeIdx = 0;
  for (const span of spans) {
    if (span.kind === 'equal') {
      if (span.corrected.length > 0) {
        segments.push({ text: span.corrected, changeIndex: null });
      }
    } else {
      if (span.corrected.length > 0) {
        segments.push({ text: span.corrected, changeIndex: changeIdx });
      }
      changeIdx++;
    }
  }
  return segments;
}

function buildDiffChanges(spans, modelChanges) {
  const changes = [];
  const used = new Set();
  for (const span of spans) {
    if (span.kind === 'equal') continue;
    let matchedType = null;
    let matchedExplanation = null;
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
        used.add(i);
        break;
      }
    }
    changes.push({
      original: span.original,
      corrected: span.corrected,
      type: matchedType,
      explanation: matchedExplanation,
    });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
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

// Helper: verify both join invariants
function assertInvariants(spans, original, corrected) {
  const joinedOrig = spans.map((s) => s.original).join('');
  const joinedCorr = spans.map((s) => s.corrected).join('');
  assert.equal(joinedOrig, original, `original join failed: got "${joinedOrig}"`);
  assert.equal(joinedCorr, corrected, `corrected join failed: got "${joinedCorr}"`);
}

// Helper: count non-equal spans
function nonEqualSpans(spans) {
  return spans.filter((s) => s.kind !== 'equal');
}

// ===========================================================================
// tokenize
// ===========================================================================
console.log('\ntokenize');

test('T1: simple sentence', () => {
  const tokens = tokenize('I go to school.');
  const words = tokens.filter((t) => t.isWord).map((t) => t.text);
  assert.deepEqual(words, ['I', 'go', 'to', 'school']);
  assert.equal(tokens.map((t) => t.text).join(''), 'I go to school.');
});

test('T2: leading punctuation', () => {
  const tokens = tokenize('...hello world');
  assert.equal(tokens[0].text, '...');
  assert.equal(tokens[0].isWord, false);
});

// ===========================================================================
// diffTexts
// ===========================================================================
console.log('\ndiffTexts');

// Fixture 1: No change at all
test('F1: no change at all', () => {
  const spans = diffTexts('I go to school.', 'I go to school.');
  assertInvariants(spans, 'I go to school.', 'I go to school.');
  assert.equal(nonEqualSpans(spans).length, 0);
});

// Fixture 2: Single word replaced
test('F2: single word replaced', () => {
  const spans = diffTexts('I go to school.', 'I went to school.');
  assertInvariants(spans, 'I go to school.', 'I went to school.');
  const ne = nonEqualSpans(spans);
  assert.equal(ne.length, 1);
  assert.equal(ne[0].original, 'go');
  assert.equal(ne[0].corrected, 'went');
});

// Fixture 3: Word inserted
test('F3: word inserted', () => {
  const spans = diffTexts('I go school.', 'I go to school.');
  assertInvariants(spans, 'I go school.', 'I go to school.');
  const ne = nonEqualSpans(spans);
  assert.ok(ne.length >= 1, `expected at least 1 non-equal span, got ${ne.length}`);
  // The inserted text should contain "to"
  const allCorrected = ne.map((s) => s.corrected).join('');
  assert.ok(allCorrected.includes('to'), `inserted text should contain "to", got "${allCorrected}"`);
});

// Fixture 4: Word deleted
test('F4: word deleted', () => {
  const spans = diffTexts('I go to to school.', 'I go to school.');
  assertInvariants(spans, 'I go to to school.', 'I go to school.');
  const ne = nonEqualSpans(spans);
  assert.ok(ne.length >= 1, `expected at least 1 non-equal span, got ${ne.length}`);
  // The deleted text should contain "to"
  const allOriginal = ne.map((s) => s.original).join('');
  assert.ok(allOriginal.includes('to'), `deleted text should contain "to", got "${allOriginal}"`);
});

// Fixture 5: Multi-word phrase replaced (preposition change)
test('F5: multi-word phrase replaced (preposition)', () => {
  const spans = diffTexts('arrived to the', 'arrived at the');
  assertInvariants(spans, 'arrived to the', 'arrived at the');
  const ne = nonEqualSpans(spans);
  assert.equal(ne.length, 1);
  assert.equal(ne[0].original, 'to');
  assert.equal(ne[0].corrected, 'at');
});

// Fixture 6: Two separate changes in one sentence
test('F6: two separate changes', () => {
  const spans = diffTexts(
    'I go to school and I eated lunch.',
    'I went to school and I ate lunch.'
  );
  assertInvariants(spans,
    'I go to school and I eated lunch.',
    'I went to school and I ate lunch.'
  );
  const ne = nonEqualSpans(spans);
  assert.equal(ne.length, 2, `expected 2 non-equal spans, got ${ne.length}`);
  // First change: go → went
  assert.equal(ne[0].original, 'go');
  assert.equal(ne[0].corrected, 'went');
  // Second change: eated → ate
  assert.equal(ne[1].original, 'eated');
  assert.equal(ne[1].corrected, 'ate');
});

// Fixture 7: Change at very start
test('F7: change at very start', () => {
  const spans = diffTexts('go to school.', 'went to school.');
  assertInvariants(spans, 'go to school.', 'went to school.');
  const ne = nonEqualSpans(spans);
  assert.equal(ne.length, 1);
  assert.equal(ne[0].original, 'go');
  assert.equal(ne[0].corrected, 'went');
  // Verify it's at the start
  assert.equal(spans[0].kind !== 'equal' || spans[0].corrected === '', true,
    'first span should be non-equal or the change should be first non-equal');
});

// Fixture 8: Change at very end (punctuation added)
test('F8: change at very end', () => {
  const spans = diffTexts('I go to school', 'I go to school.');
  assertInvariants(spans, 'I go to school', 'I go to school.');
  const ne = nonEqualSpans(spans);
  assert.ok(ne.length >= 1);
  // The last change should involve adding "."
  const lastNe = ne[ne.length - 1];
  assert.ok(lastNe.corrected.includes('.'), `expected "." in corrected, got "${lastNe.corrected}"`);
});

// Fixture 9: Punctuation-only change
test('F9: punctuation-only change (comma added)', () => {
  const spans = diffTexts('Hello world', 'Hello, world');
  assertInvariants(spans, 'Hello world', 'Hello, world');
  const ne = nonEqualSpans(spans);
  assert.ok(ne.length >= 1, `expected at least 1 non-equal span, got ${ne.length}`);
  const allCorr = ne.map((s) => s.corrected).join('');
  assert.ok(allCorr.includes(','), `expected comma in changes, got "${allCorr}"`);
});

// Fixture 10: Join invariant holds (comprehensive, using segments)
test('F10: join invariant on segments for all cases', () => {
  const cases = [
    ['I go to school.', 'I go to school.'],
    ['I go to school.', 'I went to school.'],
    ['I go school.', 'I go to school.'],
    ['I go to to school.', 'I go to school.'],
    ['arrived to the', 'arrived at the'],
    ['I go to school and I eated lunch.', 'I went to school and I ate lunch.'],
    ['go to school.', 'went to school.'],
    ['I go to school', 'I go to school.'],
    ['Hello world', 'Hello, world'],
  ];
  for (const [orig, corr] of cases) {
    const spans = diffTexts(orig, corr);
    assertInvariants(spans, orig, corr);
    const segments = diffToSegments(spans);
    const joined = segments.map((s) => s.text).join('');
    assert.equal(joined, corr, `segment join failed for "${orig}" → "${corr}": got "${joined}"`);
    // No empty segments
    for (const s of segments) {
      assert.ok(s.text.length > 0, `empty segment for "${orig}" → "${corr}"`);
    }
  }
});

// Fixture 11: Whitespace merging — "strictly" → "strict" should be one span
test('F11: whitespace merging (strictly → strict)', () => {
  const spans = diffTexts('she looked very strictly', 'she looked very strict');
  assertInvariants(spans, 'she looked very strictly', 'she looked very strict');
  const ne = nonEqualSpans(spans);
  assert.equal(ne.length, 1, `expected 1 non-equal span, got ${ne.length}`);
  assert.equal(ne[0].original, 'strictly');
  assert.equal(ne[0].corrected, 'strict');
});

// Fixture 12: buildDiffChanges with model match
test('F12: buildDiffChanges — model match found', () => {
  const spans = diffTexts('I go to school.', 'I went to school.');
  const modelChanges = [
    { original: 'go', corrected: 'went', type: 'grammar', explanation: 'Past tense needed.' },
  ];
  const changes = buildDiffChanges(spans, modelChanges);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].original, 'go');
  assert.equal(changes[0].corrected, 'went');
  assert.equal(changes[0].type, 'grammar');
  assert.equal(changes[0].explanation, 'Past tense needed.');
});

// Fixture 13: buildDiffChanges without model match
test('F13: buildDiffChanges — no model match', () => {
  const spans = diffTexts('arrived to the', 'arrived at the');
  const modelChanges = []; // model missed it
  const changes = buildDiffChanges(spans, modelChanges);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].original, 'to');
  assert.equal(changes[0].corrected, 'at');
  assert.equal(changes[0].type, null);
  assert.equal(changes[0].explanation, null);
});

// Fixture 14: Paragraph preservation
test('F14: paragraph preservation (newlines in equal spans)', () => {
  const text = 'Para one.\n\nPara two.';
  const spans = diffTexts(text, text);
  assertInvariants(spans, text, text);
  assert.equal(nonEqualSpans(spans).length, 0);
  // Verify the equal span contains newlines
  const joined = spans.map((s) => s.corrected).join('');
  assert.ok(joined.includes('\n\n'), 'newlines must be preserved in equal spans');
});

// ===========================================================================
// Extra: real-world test from the screenshot
// ===========================================================================
console.log('\nReal-world');

test('Screenshot scenario: multiple changes detected', () => {
  const original =
    'Today was a very busy day for me. In the morning, I woke up late because my alarm clock didn\'t rang. ' +
    'I was so hurry to go to work that I forgot my wallet at home. When I arrived to the office, my manager ' +
    'was already there and she looked very strictly.';
  const corrected =
    'Today was a very busy day for me. In the morning, I woke up late because my alarm clock didn\'t ring. ' +
    'I was in such a hurry to go to work that I forgot my wallet at home. When I arrived at the office, my manager ' +
    'was already there and she looked very strict.';

  const spans = diffTexts(original, corrected);
  assertInvariants(spans, original, corrected);

  const ne = nonEqualSpans(spans);
  // Should detect at least 4 changes: rang→ring, so hurry→in such a hurry, to→at, strictly→strict
  assert.ok(ne.length >= 4, `expected at least 4 changes, got ${ne.length}: ${JSON.stringify(ne.map(s => `${s.original}→${s.corrected}`))}`);

  const segments = diffToSegments(spans);
  const joined = segments.map((s) => s.text).join('');
  assert.equal(joined, corrected, 'segment join must equal corrected');
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
