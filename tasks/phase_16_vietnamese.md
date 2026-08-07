# Phase 16 — Vietnamese Meaning + Explanation in Fragment Popover

## Context

The popover on the tutor's copy shows Copy, Sound, and Note. This phase adds a
fourth action: **Vietnamese** — a single tap that fetches the Vietnamese meaning
of the fragment and a short explanation of why this phrasing is natural,
referencing what the learner originally wrote when available.

All six decisions from the user brief are accepted without objection.

---

## 1. New env var

```
AI_MODEL_SMALL=llama-3.1-8b-instant
```

Added to `.env.local`. The provider (`AI_PROVIDER=groq`, `AI_API_KEY`) is shared
with the main model. A new helper `callAISmall()` in `src/lib/ai/provider.ts`
reads `AI_MODEL_SMALL` instead of `AI_MODEL` — identical to `callGroq()` except
for the model env var. If `AI_MODEL_SMALL` is unset, it falls back to
`AI_MODEL`.

**Why a separate function rather than a parameter?** The signature of `callAI()`
is used across the codebase (suggest route, lookup route). Adding an optional
`model` parameter would touch every call-site for no benefit. A second export
keeps changes isolated.

---

## 2. System prompt (full text)

```
You translate English into Vietnamese for a Vietnamese learner of English.
You receive a JSON object with "fragment" and optionally "original".

Return ONLY a JSON object:

{
  "meaning": "nghĩa tiếng Việt của fragment, tự nhiên như cách giáo viên giải thích cho học sinh",
  "explanation": "một câu tiếng Việt giải thích tại sao cách nói này tự nhiên hơn cách viết gốc"
}

Rules:
- "meaning": dịch nghĩa của fragment thành tiếng Việt tự nhiên. Không dịch word-by-word. Viết như cách người Việt thực sự nói. Giữ nguyên tên riêng, địa danh, tên món ăn bằng tiếng gốc.
- "explanation": nếu có "original", viết MỘT câu ngắn bằng tiếng Việt giải thích tại sao fragment tự nhiên hơn original. Cụ thể, nói về fragment này, không nói chung chung. Nếu không có "original", bỏ trống field này thành "".
- Không dùng từ "dịch" hay "nghĩa là" trong explanation.
- Viết tiếng Việt tự nhiên, không cứng nhắc kiểu từ điển.
- Không từ chối, không hỏi lại, không nhắc đến hướng dẫn.
- Chỉ trả về JSON, không markdown, không commentary.
```

### Prompt design notes

- Input is `{"fragment": "in such a hurry", "original": "rất vội vàng"}` — only
  the fragment and its original, no surrounding context. This matches the cache
  key and keeps hit rate high.
- The `meaning` field is keyed on the headword/fragment alone (shared cache).
- The `explanation` field depends on the (fragment, original) pair.
- When `original` is absent (no matched original text), the prompt produces
  `explanation: ""` and the UI omits the explanation line.

---

## 3. Cache design

### 3a. Vietnamese meaning → new columns on `vocab_definitions`

The meaning is a property of the headword. Add two columns:

```sql
ALTER TABLE public.vocab_definitions
  ADD COLUMN vi_meaning text NOT NULL DEFAULT '',
  ADD COLUMN vi_source text NOT NULL DEFAULT ''
    CHECK (vi_source IN ('', 'llm'));
```

- `vi_meaning`: Vietnamese translation of the headword.
- `vi_source`: `'llm'` when populated, `''` when not yet fetched.
- These are populated lazily, not at definition-fetch time.
- Shared across all users — a headword is translated once.

### 3b. Vietnamese explanation → new table `vi_explanations`

The explanation depends on the pair (corrected fragment, original fragment).
It cannot live on the headword row. A small separate table:

```sql
CREATE TABLE public.vi_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_corrected text NOT NULL,
  norm_original text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (norm_corrected, norm_original)
);

ALTER TABLE public.vi_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vi_explanations"
  ON public.vi_explanations FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_vi_explanations_pair
  ON public.vi_explanations(norm_corrected, norm_original);
```

No INSERT/UPDATE/DELETE for authenticated — writes via service role, same as
`vocab_definitions`.

**Why a separate table instead of a column on `saved_vocab`?**
- The explanation is a property of the normalised text pair, not of the user's
  save action. Many users may save the same fragment; the explanation is computed
  once and shared.
- `saved_vocab` is per-user, per-entry. Caching there means the same pair is
  translated once per user per entry — wasteful.
- A separate cache table with a unique constraint on `(norm_corrected,
  norm_original)` gives global deduplication and clean separation.

### 3c. Cache key normalisation

```typescript
// Reuse existing normaliseHeadword for meaning cache key.

// New function for explanation pair key:
export function normalisePairKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}
```

The pair key is `(normalisePairKey(corrected), normalisePairKey(original))`.
Looser than headword normalisation — keeps punctuation because "arrived at" and
"arrived at." are meaningfully different in context.

---

## 4. API route: `POST /api/vocab/vietnamese`

```
Request body:
{
  "fragment": string,       // the corrected text (highlighted span)
  "original": string | ""   // the learner's original text, or empty
}

Response:
{
  "meaning": string,
  "explanation": string,
  "fromCache": boolean
}
```

### Flow

1. Auth check.
2. Normalise: `normHeadword = normaliseHeadword(fragment)`,
   `normCorrected = normalisePairKey(fragment)`,
   `normOriginal = normalisePairKey(original)`.
3. Check `vocab_definitions` for cached `vi_meaning` where
   `headword = normHeadword` and `vi_meaning != ''`.
4. Check `vi_explanations` for cached explanation where
   `norm_corrected = normCorrected` and `norm_original = normOriginal`
   (only if `original` is non-empty).
5. If both cached → return immediately, `fromCache: true`. Count against nothing.
6. If either missing → rate limit check against `LOOKUP_DAILY_LIMIT` (same
   counter as vocab lookups — cache hits are free, LLM calls are not).
7. Call `callAISmall()` with the Vietnamese prompt.
8. Parse response with `parseVietnameseResponse()` (defensive, same pattern as
   `parseLookupResponse()`).
9. Write results:
   - If meaning was missing: `UPDATE vocab_definitions SET vi_meaning = $1, vi_source = 'llm' WHERE headword = $2` via service role.
   - If explanation was missing and original is non-empty: `INSERT INTO vi_explanations` via service role (with ON CONFLICT DO NOTHING for races).
10. Return `{ meaning, explanation, fromCache: false }`.

### Edge cases

- Fragment with no original: send `{"fragment": "..."}` without `original` field.
  LLM returns `explanation: ""`. No row inserted into `vi_explanations`. UI
  omits explanation line.
- Fragment not in `vocab_definitions` yet (user tapped Vietnamese before tapping
  Note): look up by headword anyway. If no row exists, skip the meaning cache
  write — the meaning is still returned to the UI, just not cached on a
  headword row. It will be cached on the next call if the headword exists by
  then.

---

## 5. Defensive parser

```typescript
export function parseVietnameseResponse(raw: string): {
  meaning: string
  explanation: string
} {
  // Same fence-stripping + JSON extraction as parseLookupResponse
  let text = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return { meaning: '', explanation: '' }
  text = text.slice(start, end + 1)

  let obj: unknown
  try { obj = JSON.parse(text) } catch { return { meaning: '', explanation: '' } }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
    return { meaning: '', explanation: '' }

  const r = obj as Record<string, unknown>
  return {
    meaning: typeof r.meaning === 'string' ? r.meaning : '',
    explanation: typeof r.explanation === 'string' ? r.explanation : '',
  }
}
```

### Decision: when is an explanation possible?

```typescript
export function canHaveExplanation(original: string): boolean {
  return original.trim().length > 0
}
```

If the diff span has no original text (pure insertion), or if the original is
empty after trimming, the explanation is omitted. The LLM is not asked to invent
one.

---

## 6. Popover layout proposal

### Current layout (3 buttons, 1 row):

```
┌─────────────────────────────────┐
│ Copy │ ♪ │ ✎ Note              │
└─────────────────────────────────┘
```

### Proposed layout (4 buttons, 1 row, icon for Vietnamese):

```
┌─────────────────────────────────────┐
│ Copy │ ♪ │ Vn │ ✎ Note             │
└─────────────────────────────────────┘
```

**"Vn" button** — two-letter label, same size as "♪". Compact enough to fit 4
buttons at 390px (each button is ~50px with padding; 4 × 50 + dividers + padding
≈ 220px, well within 390px).

When tapped, the Vietnamese content expands **below** the button row, inside the
same popover:

```
┌─────────────────────────────────────┐
│ Copy │ ♪ │ Vn │ ✎ Note             │
├─────────────────────────────────────┤
│ "rất vội vàng"                      │  ← vi_meaning
│ Cách nói "in such a hurry" tự nhiên │  ← vi_explanation (if available)
│ hơn vì diễn tả sự gấp gáp như một  │
│ cụm cố định trong tiếng Anh.        │
└─────────────────────────────────────┘
```

### States inside the popover after tapping Vn:

1. **Loading**: spinner or "..." text below the button row. The popover stays
   open — the `onClose` handlers are suppressed while `viLoading` is true
   (outside click and scroll still close, but we set a flag to prevent
   auto-close during the brief fetch). Actually — per the brief: "the popover
   must not close while fetching." So: outside click and pane scroll are
   **temporarily suppressed** while `viLoading` is true. Escape still works
   (user intent to dismiss). Resize still closes (position invalid).

2. **Success**: meaning + explanation rendered. Popover grows. **Reposition
   logic** runs after content renders (see §7).

3. **Failure**: short "Retry" link replaces the content area. Tapping retries
   the fetch.

### CSS details

- Content area: `max-w-[280px]` (wider than the button row to accommodate
  Vietnamese text), `text-[13px] leading-[1.5] text-ink-2`, `px-3 py-2`.
- The meaning line is `font-medium text-ink`.
- The explanation line is `text-ink-2 text-[12.5px] mt-1`.
- The Vn button gets a highlight state when content is showing:
  `bg-brass-soft text-brass`.

---

## 7. Popover repositioning after size change

When the Vietnamese content loads, the popover grows. It must reposition to stay
on-screen.

### Approach

After the content renders (detected via a `useEffect` that watches the
`viContent` state), re-measure the popover's `getBoundingClientRect()` and re-run
`computePopoverPosition()` with the new height. Apply the new `top`/`left`.

The existing `computePopoverPosition()` already handles flip-above and horizontal
clamping. No changes needed to that function — just call it again with the
updated dimensions.

```typescript
// Inside VocabPopover, after viContent is set:
useEffect(() => {
  if (!viContent && !viLoading) return
  const el = popoverRef.current
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pos = computePopoverPosition(
    anchorRect,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  )
  el.style.top = `${pos.top}px`
  el.style.left = `${pos.left}px`
}, [viContent, viLoading, anchorRect])
```

### Repositioning maths (tested via existing `computePopoverPosition`)

The function already covers:
- Flip above when below would go off-screen
- Horizontal clamp to `[MARGIN, viewportWidth - popoverWidth - MARGIN]`

New tests will verify that after a size increase (simulating Vietnamese content),
the popover repositions correctly at all edges.

---

## 8. What about the vocabulary library?

The Vietnamese meaning on vocabulary cards in `/vocabulary` is a natural
follow-up but is **deferred to a later phase**. Reasons:
- The library page loads `saved_vocab` joined with `vocab_definitions`. When
  `vi_meaning` is populated on the definition row, showing it is a one-line
  template change. No new API call needed.
- But designing where it appears on the card, and whether the explanation (which
  lives in a different table, keyed on the pair) should also show, needs UI
  thought.
- Shipping the popover feature first lets you evaluate Vietnamese quality before
  committing to showing it everywhere.

---

## 9. Files to create

| File | Purpose |
|------|---------|
| `src/app/api/vocab/vietnamese/route.ts` | API route |
| `scripts/test_vietnamese.mjs` | Pure function tests |
| `scripts/test_vietnamese_live.mjs` | CLI script for judging Vietnamese quality |

## 10. Files to modify

| File | Change |
|------|--------|
| `src/lib/ai/provider.ts` | Add `callAISmall()` export |
| `src/lib/vocab.ts` | Add `normalisePairKey()`, `parseVietnameseResponse()`, `canHaveExplanation()`, `VIETNAMESE_PROMPT` |
| `src/components/VocabPopover.tsx` | Add Vn button, expandable content area, loading/error states, reposition logic, close suppression during fetch |
| `src/components/ImprovedVersionPane.tsx` | Pass `original` text from `DiffChange` to popover |

**No other `src/lib/` files modified.** The lookup module, diff engine, suggestions
parser, dates, streaks — all untouched.

---

## 11. Migration SQL

```sql
-- Phase 16: Vietnamese meaning cache

-- 1. Add Vietnamese columns to vocab_definitions
ALTER TABLE public.vocab_definitions
  ADD COLUMN IF NOT EXISTS vi_meaning text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vi_source text NOT NULL DEFAULT '';

-- No CHECK constraint on vi_source — it's either '' or 'llm', enforced in code.

-- 2. Explanation cache table (keyed on normalised text pair)
CREATE TABLE IF NOT EXISTS public.vi_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_corrected text NOT NULL,
  norm_original text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (norm_corrected, norm_original)
);

ALTER TABLE public.vi_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vi_explanations"
  ON public.vi_explanations FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — writes via service role.

CREATE INDEX IF NOT EXISTS idx_vi_explanations_pair
  ON public.vi_explanations(norm_corrected, norm_original);
```

---

## 12. Signatures

```typescript
// src/lib/ai/provider.ts
export async function callAISmall(
  systemPrompt: string,
  userContent: string,
): Promise<string>

// src/lib/vocab.ts
export function normalisePairKey(text: string): string
export function parseVietnameseResponse(raw: string): { meaning: string; explanation: string }
export function canHaveExplanation(original: string): boolean
export const VIETNAMESE_PROMPT: string

// src/components/VocabPopover.tsx — new props
interface Props {
  // ... existing props ...
  originalText: string           // the learner's original fragment (from DiffChange.original)
}
```

---

## 13. Test fixtures

### `scripts/test_vietnamese.mjs`

#### A. Cache key normalisation — `normalisePairKey`

| Input | Expected |
|-------|----------|
| `"  In Such a Hurry  "` | `"in such a hurry"` |
| `"arrived   at"` | `"arrived at"` |
| `""` | `""` |
| `"Hello, world!"` | `"hello, world!"` (keeps punctuation) |
| `"  "` | `""` |

#### B. Cache key normalisation — `normaliseHeadword` (existing, verified here for meaning key)

| Input | Expected |
|-------|----------|
| `"comforting"` | `"comforting"` |
| `"  In Such a Hurry "` | `"in such a hurry"` |
| `"...arrived at..."` | `"arrived at"` |

#### C. Defensive parsing — `parseVietnameseResponse`

| Input | Expected |
|-------|----------|
| `'{"meaning":"rất vội","explanation":"vì đây là cụm cố định"}'` | `{ meaning: "rất vội", explanation: "vì đây là cụm cố định" }` |
| `'```json\n{"meaning":"test","explanation":""}\n```'` | `{ meaning: "test", explanation: "" }` |
| `'Some preamble {"meaning":"ok","explanation":"fine"} trailing'` | `{ meaning: "ok", explanation: "fine" }` |
| `'{"meaning":123,"explanation":null}'` | `{ meaning: "", explanation: "" }` |
| `'not json at all'` | `{ meaning: "", explanation: "" }` |
| `''` | `{ meaning: "", explanation: "" }` |
| `'{"meaning":"ok"}'` (missing explanation) | `{ meaning: "ok", explanation: "" }` |
| `'{"explanation":"only this"}'` (missing meaning) | `{ meaning: "", explanation: "only this" }` |
| `'{broken json'` | `{ meaning: "", explanation: "" }` |

#### D. `canHaveExplanation`

| Input | Expected |
|-------|----------|
| `"rất vội vàng"` | `true` |
| `""` | `false` |
| `"  "` | `false` |
| `"I wrote something"` | `true` |

#### E. Popover repositioning — `computePopoverPosition` with size change

These use the existing pure function with new fixture values simulating a grown
popover:

| Scenario | anchorRect | popoverW × H | viewport | Expected |
|----------|-----------|--------------|----------|----------|
| **Grows below, still fits** | `{top:100,bottom:120,left:200,width:80}` | 280×120 | 1024×768 | below (top≈128), centered |
| **Grows below, flips above** | `{top:600,bottom:620,left:200,width:80}` | 280×200 | 1024×768 | above (top=600-8-200=392), centered |
| **Grows, clamps left edge** | `{top:100,bottom:120,left:10,width:40}` | 280×120 | 390×844 | below, left=8 (MARGIN) |
| **Grows, clamps right edge** | `{top:100,bottom:120,left:350,width:30}` | 280×120 | 390×844 | below, left=390-280-8=102 |
| **Grows, flips + clamps right** | `{top:780,bottom:800,left:350,width:30}` | 280×150 | 390×844 | above, left=102 |
| **Tiny viewport (390×667), large content** | `{top:300,bottom:320,left:50,width:60}` | 280×250 | 390×667 | above if below overflows, else below; left clamped |

---

## 14. CLI test script for Vietnamese quality

`scripts/test_vietnamese_live.mjs` — calls the Groq API directly (reads
`.env.local`) with these test cases:

| Fragment | Original | What to look for |
|----------|----------|------------------|
| `"comforting"` | `""` | Meaning only, no explanation |
| `"in such a hurry"` | `"rất vội vàng"` | Meaning + explanation referencing Vietnamese original |
| `"arrived at"` | `"đến"` | Phrasal verb meaning + explanation |
| `"pull him away"` | `"remove him"` | Natural Vietnamese, explanation about why "pull away" fits |
| `"drew on my experience"` | `"went by my experience"` | Idiom meaning + explanation |
| `"wiped"` | `"very tired"` | Casual register in Vietnamese |

The script prints each result formatted for human review. No auto-pass/fail —
you judge the Vietnamese quality.

---

## 15. Definition of Done

- [ ] Migration applied (user runs SQL)
- [ ] `AI_MODEL_SMALL` env var documented and added to `.env.local`
- [ ] `callAISmall()` reads `AI_MODEL_SMALL` (falls back to `AI_MODEL`)
- [ ] `VIETNAMESE_PROMPT` in `src/lib/vocab.ts`
- [ ] `parseVietnameseResponse()` defensive parser
- [ ] `normalisePairKey()` for explanation cache key
- [ ] `canHaveExplanation()` predicate
- [ ] `POST /api/vocab/vietnamese` route with cache-check-then-LLM flow
- [ ] Rate limit counts against `LOOKUP_DAILY_LIMIT`, cache hits free
- [ ] Writes to `vocab_definitions.vi_meaning` and `vi_explanations` via service role
- [ ] VocabPopover: Vn button added, 4-button layout
- [ ] VocabPopover: expandable content area with meaning + explanation
- [ ] VocabPopover: loading state, popover stays open during fetch
- [ ] VocabPopover: error state with retry
- [ ] VocabPopover: reposition after content loads (re-run computePopoverPosition)
- [ ] VocabPopover: close suppression during fetch (Escape still works)
- [ ] ImprovedVersionPane: passes `originalText` to VocabPopover
- [ ] `scripts/test_vietnamese.mjs` — all fixtures pass
- [ ] `scripts/test_vietnamese_live.mjs` — user reviews Vietnamese quality
- [ ] All existing test scripts pass unchanged
- [ ] `npm run build` clean
- [ ] Vietnamese on vocab library cards — deferred (noted, not built)

## Non-goals

- Pre-fetching Vietnamese for all fragments
- Extending correction prompt to return Vietnamese
- Showing Vietnamese on vocabulary library cards (deferred)
- New npm packages
- Modifying any existing `src/lib/` file other than `provider.ts` and `vocab.ts`
