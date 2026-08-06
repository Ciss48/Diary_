import type { ChangeType, Change, Segment } from './suggestions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Token = { text: string; isWord: boolean }

export type DiffSpanKind = 'equal' | 'replaced' | 'inserted' | 'deleted'

export type DiffSpan = {
  kind: DiffSpanKind
  original: string   // empty for 'inserted'
  corrected: string  // empty for 'deleted'
}

export type DiffChange = {
  original: string
  corrected: string
  type: ChangeType | null
  explanation: string | null
  headword: string | null
  pos: string | null
  worthSaving: boolean
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

/**
 * Split text into alternating word / non-word tokens.
 * A "word" is a maximal run of \w characters (letters, digits, underscore).
 * Non-word tokens are everything between words (spaces, punctuation).
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const re = /(\w+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    // Non-word gap before this word
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), isWord: false })
    }
    tokens.push({ text: match[0], isWord: true })
    lastIndex = re.lastIndex
  }

  // Trailing non-word text
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isWord: false })
  }

  return tokens
}

// ── LCS on word tokens ────────────────────────────────────────────────────────

/**
 * Compute the longest common subsequence of two word-token arrays.
 * Returns an array of [indexInA, indexInB] pairs for matching words.
 * Only compares word tokens; non-word tokens are handled during reconstruction.
 */
function lcsWords(aTokens: Token[], bTokens: Token[]): [number, number][] {
  // Extract word tokens with their indices
  const aWords: { text: string; idx: number }[] = []
  const bWords: { text: string; idx: number }[] = []

  for (let i = 0; i < aTokens.length; i++) {
    if (aTokens[i].isWord) aWords.push({ text: aTokens[i].text, idx: i })
  }
  for (let i = 0; i < bTokens.length; i++) {
    if (bTokens[i].isWord) bWords.push({ text: bTokens[i].text, idx: i })
  }

  const m = aWords.length
  const n = bWords.length

  // DP table (m+1) x (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aWords[i - 1].text === bWords[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find the actual LCS pairs
  const pairs: [number, number][] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (aWords[i - 1].text === bWords[j - 1].text) {
      pairs.push([aWords[i - 1].idx, bWords[j - 1].idx])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  pairs.reverse()
  return pairs
}

// ── Diff engine ───────────────────────────────────────────────────────────────

/**
 * Word-level diff between original and corrected.
 *
 * Algorithm:
 * 1. Tokenize both texts into word / non-word tokens.
 * 2. Run LCS on word tokens to find the common backbone.
 * 3. Walk both token arrays, emitting equal spans for matched words
 *    (including surrounding whitespace that matches) and replaced/inserted/deleted
 *    spans for everything else.
 * 4. Merge adjacent non-equal spans separated only by whitespace to avoid
 *    noisy fragmentation.
 *
 * INVARIANT: spans.map(s => s.original).join('') === original
 * INVARIANT: spans.map(s => s.corrected).join('') === corrected
 */
export function diffTexts(original: string, corrected: string): DiffSpan[] {
  if (original === corrected) {
    return original.length > 0
      ? [{ kind: 'equal', original, corrected }]
      : []
  }

  const aTokens = tokenize(original)
  const bTokens = tokenize(corrected)
  const matches = lcsWords(aTokens, bTokens)

  const rawSpans: DiffSpan[] = []
  let ai = 0 // cursor in aTokens
  let bi = 0 // cursor in bTokens

  for (const [ma, mb] of matches) {
    // Collect unmatched tokens before this match
    const origBefore = joinTokens(aTokens, ai, ma)
    const corrBefore = joinTokens(bTokens, bi, mb)

    if (origBefore || corrBefore) {
      pushNonEqual(rawSpans, origBefore, corrBefore)
    }

    // The matched word itself — include surrounding non-word tokens
    // We match just the word token. Non-word tokens adjacent to matched words
    // on both sides need careful handling.
    const wordText = aTokens[ma].text
    rawSpans.push({ kind: 'equal', original: wordText, corrected: wordText })

    ai = ma + 1
    bi = mb + 1
  }

  // Remaining tokens after last match
  const origAfter = joinTokens(aTokens, ai, aTokens.length)
  const corrAfter = joinTokens(bTokens, bi, bTokens.length)

  if (origAfter || corrAfter) {
    pushNonEqual(rawSpans, origAfter, corrAfter)
  }

  // Now we have raw spans, but whitespace/punctuation between words
  // may be split awkwardly. Let's do a second pass to attach
  // whitespace/punctuation to adjacent equal spans and merge.
  const refined = refineSpans(rawSpans, original, corrected)

  return refined
}

function joinTokens(tokens: Token[], from: number, to: number): string {
  let s = ''
  for (let i = from; i < to; i++) s += tokens[i].text
  return s
}

function pushNonEqual(spans: DiffSpan[], orig: string, corr: string): void {
  if (orig && corr) {
    spans.push({ kind: 'replaced', original: orig, corrected: corr })
  } else if (corr) {
    spans.push({ kind: 'inserted', original: '', corrected: corr })
  } else if (orig) {
    spans.push({ kind: 'deleted', original: orig, corrected: '' })
  }
}

/**
 * Refine raw spans so that:
 * 1. Whitespace between matched words is properly attributed to equal spans.
 * 2. Adjacent non-equal spans separated only by whitespace are merged.
 *
 * Strategy: rebuild from the original and corrected strings using the matched
 * words as anchors, and compute the actual substrings between anchors.
 */
function refineSpans(rawSpans: DiffSpan[], original: string, corrected: string): DiffSpan[] {
  // Collect the equal (matched word) positions in both strings
  type Anchor = { origStart: number; origEnd: number; corrStart: number; corrEnd: number }
  const anchors: Anchor[] = []

  let oCursor = 0
  let cCursor = 0

  for (const span of rawSpans) {
    oCursor += span.original.length
    cCursor += span.corrected.length

    if (span.kind === 'equal') {
      anchors.push({
        origStart: oCursor - span.original.length,
        origEnd: oCursor,
        corrStart: cCursor - span.corrected.length,
        corrEnd: cCursor,
      })
    }
  }

  // Rebuild spans from anchors
  const result: DiffSpan[] = []
  let oPos = 0
  let cPos = 0

  for (const anchor of anchors) {
    const origGap = original.slice(oPos, anchor.origStart)
    const corrGap = corrected.slice(cPos, anchor.corrStart)

    // Check if the gap between two anchors is just identical whitespace
    if (origGap === corrGap && origGap.length > 0) {
      result.push({ kind: 'equal', original: origGap, corrected: corrGap })
    } else if (origGap || corrGap) {
      // Split: try to find common leading/trailing whitespace
      const { leading, origMiddle, corrMiddle, trailing } = extractCommonWhitespace(origGap, corrGap)

      if (leading) result.push({ kind: 'equal', original: leading, corrected: leading })
      if (origMiddle || corrMiddle) pushNonEqual(result, origMiddle, corrMiddle)
      if (trailing) result.push({ kind: 'equal', original: trailing, corrected: trailing })
    }

    // The anchored word
    const wordText = original.slice(anchor.origStart, anchor.origEnd)
    result.push({ kind: 'equal', original: wordText, corrected: wordText })

    oPos = anchor.origEnd
    cPos = anchor.corrEnd
  }

  // After last anchor
  const origTail = original.slice(oPos)
  const corrTail = corrected.slice(cPos)

  if (origTail === corrTail && origTail.length > 0) {
    result.push({ kind: 'equal', original: origTail, corrected: origTail })
  } else if (origTail || corrTail) {
    const { leading, origMiddle, corrMiddle, trailing } = extractCommonWhitespace(origTail, corrTail)
    if (leading) result.push({ kind: 'equal', original: leading, corrected: leading })
    if (origMiddle || corrMiddle) pushNonEqual(result, origMiddle, corrMiddle)
    if (trailing) result.push({ kind: 'equal', original: trailing, corrected: trailing })
  }

  // Merge adjacent equal spans and adjacent non-equal spans
  return mergeAdjacentSpans(result)
}

/**
 * Extract common leading and trailing whitespace from two strings.
 * Returns the common prefix whitespace, the remaining middles, and common suffix whitespace.
 */
function extractCommonWhitespace(
  a: string,
  b: string
): { leading: string; origMiddle: string; corrMiddle: string; trailing: string } {
  let leadLen = 0
  const minLead = Math.min(a.length, b.length)
  while (leadLen < minLead && a[leadLen] === b[leadLen] && /\s/.test(a[leadLen])) {
    leadLen++
  }

  const aAfterLead = a.slice(leadLen)
  const bAfterLead = b.slice(leadLen)

  let trailLen = 0
  const minTrail = Math.min(aAfterLead.length, bAfterLead.length)
  while (
    trailLen < minTrail &&
    aAfterLead[aAfterLead.length - 1 - trailLen] === bAfterLead[bAfterLead.length - 1 - trailLen] &&
    /\s/.test(aAfterLead[aAfterLead.length - 1 - trailLen])
  ) {
    trailLen++
  }

  return {
    leading: a.slice(0, leadLen),
    origMiddle: aAfterLead.slice(0, aAfterLead.length - trailLen),
    corrMiddle: bAfterLead.slice(0, bAfterLead.length - trailLen),
    trailing: trailLen > 0 ? aAfterLead.slice(aAfterLead.length - trailLen) : '',
  }
}

/**
 * Merge adjacent spans of the same kind and merge adjacent non-equal spans.
 */
function mergeAdjacentSpans(spans: DiffSpan[]): DiffSpan[] {
  if (spans.length === 0) return spans

  const result: DiffSpan[] = [spans[0]]

  for (let i = 1; i < spans.length; i++) {
    const prev = result[result.length - 1]
    const curr = spans[i]

    if (prev.kind === 'equal' && curr.kind === 'equal') {
      // Merge adjacent equal spans
      result[result.length - 1] = {
        kind: 'equal',
        original: prev.original + curr.original,
        corrected: prev.corrected + curr.corrected,
      }
    } else if (prev.kind !== 'equal' && curr.kind !== 'equal') {
      // Merge adjacent non-equal spans into a single replaced span
      result[result.length - 1] = {
        kind: 'replaced',
        original: prev.original + curr.original,
        corrected: prev.corrected + curr.corrected,
      }
    } else {
      result.push(curr)
    }
  }

  return result
}

// ── Span → Segment conversion ─────────────────────────────────────────────────

/**
 * Convert diff spans into Segment[] for ImprovedVersionPane rendering.
 * Non-equal spans become highlighted segments (changeIndex = sequential index).
 * Equal spans become plain segments (changeIndex = null).
 *
 * INVARIANT: segments.map(s => s.text).join('') === corrected
 * No empty segments.
 */
export function diffToSegments(spans: DiffSpan[]): Segment[] {
  const segments: Segment[] = []
  let changeIdx = 0

  for (const span of spans) {
    if (span.kind === 'equal') {
      if (span.corrected.length > 0) {
        segments.push({ text: span.corrected, changeIndex: null })
      }
    } else {
      // For deleted spans, there's no corrected text to show
      if (span.corrected.length > 0) {
        segments.push({ text: span.corrected, changeIndex: changeIdx })
      }
      changeIdx++
    }
  }

  return segments
}

/**
 * Convert diff spans into Segment[] for OriginalVersionPane rendering.
 * Non-equal spans become highlighted segments (changeIndex = sequential index).
 * Equal spans become plain segments (changeIndex = null).
 *
 * changeIndex numbering is identical to diffToSegments so that clicking
 * a red mark on the left and a green mark on the right select the same
 * change in the list.
 *
 * INVARIANT: segments.map(s => s.text).join('') === original
 * No empty segments.
 */
export function diffToOriginalSegments(spans: DiffSpan[]): Segment[] {
  const segments: Segment[] = []
  let changeIdx = 0

  for (const span of spans) {
    if (span.kind === 'equal') {
      if (span.original.length > 0) {
        segments.push({ text: span.original, changeIndex: null })
      }
    } else {
      // For inserted spans, there's no original text to show
      if (span.original.length > 0) {
        segments.push({ text: span.original, changeIndex: changeIdx })
      }
      // Always increment to stay in sync with diffToSegments
      changeIdx++
    }
  }

  return segments
}

// ── Build changes list ────────────────────────────────────────────────────────

/**
 * Build the CHANGES list from diff spans + model-reported changes.
 * For each non-equal diff span, try to find a model Change whose corrected
 * text overlaps that span; if found, attach its type + explanation.
 * Unmatched spans get type=null, explanation=null.
 */
export function buildDiffChanges(
  spans: DiffSpan[],
  modelChanges: Change[]
): DiffChange[] {
  const changes: DiffChange[] = []

  // Build a simple list of model changes for matching
  const used = new Set<number>()

  for (const span of spans) {
    if (span.kind === 'equal') continue

    // Try to match a model change
    let matchedType: ChangeType | null = null
    let matchedExplanation: string | null = null
    let matchedHeadword: string | null = null
    let matchedPos: string | null = null
    let matchedWorthSaving = false

    for (let i = 0; i < modelChanges.length; i++) {
      if (used.has(i)) continue
      const mc = modelChanges[i]

      // Match if the model's corrected text overlaps with the diff span's corrected text,
      // or the model's original text overlaps with the diff span's original text.
      const corrOverlap = mc.corrected && span.corrected &&
        (span.corrected.includes(mc.corrected) || mc.corrected.includes(span.corrected))
      const origOverlap = mc.original && span.original &&
        (span.original.includes(mc.original) || mc.original.includes(span.original))

      if (corrOverlap || origOverlap) {
        matchedType = mc.type
        matchedExplanation = mc.explanation
        matchedHeadword = mc.headword ?? null
        matchedPos = mc.pos ?? null
        matchedWorthSaving = mc.worth_saving ?? false
        used.add(i)
        break
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
    })
  }

  return changes
}
