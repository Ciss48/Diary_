# Phase 17 — Vietnamese Meaning + Explanation on Vocabulary Cards

## Context

Phase 16 added a "Vn" button to the popover that fetches Vietnamese on demand.
But:
- The Phase 16 migration was **never applied** — `vi_meaning`, `vi_source`
  columns and the `vi_explanations` table do not exist in the live DB.
- Vietnamese never appears on the saved vocabulary cards (entry panel or library).
- Pressing "Note" saves a card with English only — no Vietnamese is fetched.
- Search in the library does not cover Vietnamese.

This phase applies the missing schema, wires Vietnamese into the save flow, and
surfaces it on vocabulary cards in both views.

---

## 1. Migration SQL (includes Phase 16's unapplied schema)

```sql
-- 0007_vietnamese.sql
-- Phase 17: Vietnamese meaning + explanation cache

-- 1. Add Vietnamese columns to vocab_definitions
ALTER TABLE public.vocab_definitions
  ADD COLUMN IF NOT EXISTS vi_meaning text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vi_source text NOT NULL DEFAULT '';

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

-- No INSERT/UPDATE/DELETE policies — writes via service role only.

CREATE INDEX IF NOT EXISTS idx_vi_explanations_pair
  ON public.vi_explanations(norm_corrected, norm_original);
```

---

## 2. Two situations — handled differently

### A. SAVING A NEW TERM — fetch Vietnamese as part of the save

When the user presses "Note" in the popover:

1. `handleVocabSave` in DiaryEditor calls `POST /api/vocab/save` (unchanged).
2. Fire-and-forget `POST /api/vocab/lookup` for the English definition (unchanged).
3. **NEW**: Fire-and-forget `POST /api/vocab/vietnamese` for the Vietnamese.
4. As each resolves, `setSavedVocab` updates the card progressively.

The card appears immediately with the headword. English definition fills in when
lookup resolves. Vietnamese fills in when vietnamese resolves. A failure in
Vietnamese never prevents the card from showing or the English from working.

**If the user had already pressed "Vn" in the popover before pressing "Note"**,
the Vietnamese is already cached in the DB. The `/api/vocab/vietnamese` call
returns `fromCache: true` instantly — no LLM cost.

#### Changes to `handleVocabSave` in DiaryEditor.tsx

After the existing fire-and-forget lookup call, add:

```typescript
// 3. Trigger async Vietnamese fetch (fire-and-forget)
fetch('/api/vocab/vietnamese', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fragment: fragment,
    original: dc.original,
  }),
}).then(async viRes => {
  if (!viRes.ok) return
  const viData = await viRes.json()
  if (viData.meaning || viData.explanation) {
    setSavedVocab(prev => prev.map(v =>
      v.headword === (dc.headword ?? fragment)
        ? {
            ...v,
            vi_meaning: viData.meaning || v.vi_meaning || '',
            vi_explanation: viData.explanation || v.vi_explanation || '',
          }
        : v
    ))
  }
}).catch(() => {})
```

### B. TERMS ALREADY SAVED — on demand, per card

Cards that were saved before this feature show a small "Xem tiếng Việt"
affordance. Tapping it fetches that one card's Vietnamese via
`POST /api/vocab/vietnamese` with `{ fragment: item.display_form, original:
item.original_form }`.

**Rules:**
- Nothing fetches automatically on page load (entry panel or library).
- The library's zero-automatic-calls rule stands.
- No "translate everything" bulk action.

---

## 3. Type changes

### `SavedVocabItem` — extend in `src/lib/vocab.ts`

```typescript
export type SavedVocabItem = {
  id: string
  display_form: string
  original_form: string
  headword: string
  change_type: string
  status: 'learning' | 'known'
  created_at: string
  definition: {
    id: string
    ipa: string
    part_of_speech: string
    definition: string
    example: string
    source: string
  } | null
  vi_meaning?: string      // NEW
  vi_explanation?: string   // NEW
}
```

### `LibraryVocabItem` — inherits from `SavedVocabItem`, no change needed

---

## 4. Server-side loading — include Vietnamese in existing queries

### Entry page (`src/app/diary/[date]/page.tsx`)

Change the `vocab_definitions` join select to include `vi_meaning`:

```typescript
vocab_definitions ( id, ipa, part_of_speech, definition, example, source, vi_meaning )
```

Then when mapping rows, read `vi_meaning` from the definition:

```typescript
vi_meaning: (row.vocab_definitions as any)?.vi_meaning || '',
```

For the explanation, join `vi_explanations` too. But `saved_vocab` has no FK to
`vi_explanations` — the link is conceptual: `normalisePairKey(display_form)` =
`norm_corrected` and `normalisePairKey(original_form)` = `norm_original`.

**This join cannot be done in a single Supabase query** because there is no FK.
Instead: after loading vocab rows, do a **single batch query** to
`vi_explanations` with all the distinct (norm_corrected, norm_original) pairs
present in the loaded rows:

```typescript
// Collect pairs
const pairs = vocabRows
  .filter(r => r.original_form?.trim())
  .map(r => ({
    nc: normalisePairKey(r.display_form),
    no: normalisePairKey(r.original_form),
  }))

// Single query with OR conditions (max ~50 items per entry, usually <10)
if (pairs.length > 0) {
  const { data: explRows } = await supabase
    .from('vi_explanations')
    .select('norm_corrected, norm_original, explanation')
    .or(
      pairs.map(p =>
        `and(norm_corrected.eq.${p.nc},norm_original.eq.${p.no})`
      ).join(',')
    )
  // Build a lookup map
  const explMap = new Map(
    (explRows ?? []).map(r => [`${r.norm_corrected}|${r.norm_original}`, r.explanation])
  )
  // Attach to items
  items.forEach(item => {
    if (!item.original_form?.trim()) return
    const key = `${normalisePairKey(item.display_form)}|${normalisePairKey(item.original_form)}`
    item.vi_explanation = explMap.get(key) || ''
  })
}
```

**Important**: This is NOT an external API call. It reads from our own DB tables
that are already populated by prior Vietnamese popover usage. No LLM calls.
This satisfies the "no extra round trips for anything already cached" rule.

### Library page (`src/app/vocabulary/page.tsx`)

Same pattern — extend the `vocab_definitions` join to include `vi_meaning`, then
batch-query `vi_explanations` for all items. This is a single DB read, not an
external call. The library's "zero automatic external calls" rule is preserved
because this is reading our own cache, not calling an LLM.

---

## 5. Card display — four states

Each card has Vietnamese state derived from its data:

```typescript
type ViCardState =
  | 'has-both'         // vi_meaning + vi_explanation present
  | 'has-meaning-only' // vi_meaning present, no explanation (or no original_form)
  | 'not-cached'       // neither present → show "Xem tiếng Việt" affordance
  | 'fetch-failed'     // on-demand fetch returned error → show retry
```

Decision logic (pure function, testable):

```typescript
export function getViCardState(item: SavedVocabItem): ViCardState {
  const hasMeaning = !!item.vi_meaning
  const hasExplanation = !!item.vi_explanation
  if (hasMeaning && hasExplanation) return 'has-both'
  if (hasMeaning) return 'has-meaning-only'
  return 'not-cached'
}
```

Note: `fetch-failed` is a transient UI state, not derivable from data alone.

---

## 6. Card layout — Vietnamese section

Vietnamese sits **below** the English definition and example, visually secondary.
Follows the existing card design language (no new card chrome).

### Entry panel card (`VocabPanel.tsx`)

After the definition/example block, before the footer:

```
┌──────────────────────────────────────────┐
│ comforting           ♪ ×                 │  ← existing
│ /ˈkʌm.fə.tɪŋ/                          │
│ adjective                                │
│ Making you feel calmer.                  │
│ "A comforting movie."                    │
│                                          │
│ ┄┄┄ Vietnamese ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │  ← NEW: thin dashed separator
│ làm yên lòng, dễ chịu                   │  ← vi_meaning (font-medium)
│ "Comforting" diễn tả cảm giác an ủi,    │  ← vi_explanation (text-ink-2)
│ "comfortable" chỉ nói về sự thoải mái   │
│ vật lý.                                 │
│────────────────────────────────────────── │
│ VOCABULARY  you wrote "comfortable"      │  ← existing footer
└──────────────────────────────────────────┘
```

For `not-cached` state:

```
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ Xem tiếng Việt                           │  ← clickable, text-brass
└──────────────────────────────────────────┘
```

For `fetch-failed` state:

```
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ Không tải được — thử lại                 │  ← clickable, text-wax
└──────────────────────────────────────────┘
```

**Collapsibility on entry panel**: Entry panel cards sit in a 2-column grid.
Vietnamese text can be long. The Vietnamese section is **not collapsible** on
entry cards — the grid's `auto-fill` already handles varying heights, and the
cards have `min-w-0` overflow protection. Long text wraps naturally within the
card's existing width. If needed, `vi_explanation` is capped at 3 lines with
`line-clamp-3` on mobile (<md), uncapped on desktop.

### Library page card (`VocabLibrary.tsx`)

Same layout as entry panel, positioned before the footer div. Identical states,
same CSS, same "Xem tiếng Việt" / retry affordance.

**A card without a matched original** (i.e., `original_form` is empty or the
explanation was legitimately empty) shows the meaning alone. No hint that
something is missing.

---

## 7. On-demand fetch handler — per card

Both VocabPanel and VocabLibrary need an `onFetchVietnamese(id: string)` callback:

```typescript
const handleFetchVietnamese = useCallback(async (id: string) => {
  const item = items.find(v => v.id === id)
  if (!item) return

  // Mark as loading (transient state on a per-card basis)
  setViLoading(prev => new Set(prev).add(id))

  try {
    const res = await fetch('/api/vocab/vietnamese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fragment: item.display_form,
        original: item.original_form,
      }),
    })
    if (!res.ok) {
      setViFailed(prev => new Set(prev).add(id))
      return
    }
    const data = await res.json()
    setItems(prev => prev.map(v =>
      v.id === id
        ? { ...v, vi_meaning: data.meaning || '', vi_explanation: data.explanation || '' }
        : v
    ))
  } catch {
    setViFailed(prev => new Set(prev).add(id))
  } finally {
    setViLoading(prev => { const s = new Set(prev); s.delete(id); return s })
  }
}, [items])
```

For the entry panel (VocabPanel), the `items` state lives in DiaryEditor, so the
callback chains up the same way existing callbacks do — a new prop `onFetchVietnamese`.

For the library, state is local to VocabLibrary.

---

## 8. Search — extend to match Vietnamese

### Change to `searchItems` in `src/lib/vocabLibrary.ts`

```typescript
export function searchItems(
  items: LibraryVocabItem[],
  query: string,
): LibraryVocabItem[] {
  const q = stripAccents(query.trim().toLowerCase())
  if (!q) return items
  return items.filter(item => {
    const haystack = stripAccents(
      [
        item.display_form,
        item.headword,
        item.definition?.definition ?? '',
        item.vi_meaning ?? '',          // NEW
      ]
        .join(' ')
        .toLowerCase()
    )
    return haystack.includes(q)
  })
}
```

### Diacritics handling verification

`stripAccents` uses `normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.

Vietnamese diacritics to verify:
- `ộ` → NFD: `o` + `̣` (U+0323, **below** dot) + `̂` (U+0302, circumflex)
- U+0323 is NOT in `[\u0300-\u036f]` — it's at U+0323 which IS in that range.
  Wait — let me check: U+0300–U+036F is "Combining Diacritical Marks" block.
  U+0323 (combining dot below) IS in range U+0300–U+036F.

Actually, let me verify precisely:
- U+0300–U+036F: Combining Diacritical Marks. U+0323 = 0x323 = 803 decimal.
  0x36F = 879 decimal. 803 < 879, so yes, U+0323 is in range. ✓

So `stripAccents("vội")` → `"voi"`. Searching `"voi"` will match `"vội"`. ✓

But we need to test edge cases:
- `đ` (U+0111) is NOT a combining mark — it's a standalone character. NFD does
  not decompose `đ`. So `stripAccents("đến")` → `"đen"` (strips the tonal mark
  but keeps `đ`).
- Searching `"den"` will NOT match `"đến"` because `đ` ≠ `d`.
- Searching `"đen"` WILL match `"đến"`. This is acceptable — `đ` is
  phonemically distinct from `d` in Vietnamese, so not matching is correct.

**Test plan for diacritics**: searching `"voi"` finds `"vội"`, searching `"đen"`
finds `"đến"`, searching `"den"` does NOT find `"đến"`.

---

## 9. Files to modify

| File | Change |
|------|--------|
| `src/lib/vocab.ts` | Add `vi_meaning?`, `vi_explanation?` to `SavedVocabItem`. Add `getViCardState()`. |
| `src/lib/vocabLibrary.ts` | Extend `searchItems` haystack to include `vi_meaning`. |
| `src/app/diary/[date]/page.tsx` | Extend vocab_definitions join to include `vi_meaning`. Batch-query `vi_explanations`. Map both onto items. |
| `src/app/vocabulary/page.tsx` | Same: extend join, batch-query explanations. |
| `src/components/VocabPanel.tsx` | Add Vietnamese section to VocabCard. Add `onFetchVietnamese` prop. Loading/error states. |
| `src/components/VocabLibrary.tsx` | Add Vietnamese section to VocabCard. On-demand fetch handler. Loading/error states. |
| `src/components/DiaryEditor.tsx` | Extend `handleVocabSave` to fire-and-forget Vietnamese fetch. Pass `onFetchVietnamese` to VocabPanel. |

## 10. Files NOT modified

- `src/lib/ai/provider.ts` — `callAISmall` already exists
- `src/lib/vocab.ts` — beyond the type addition and `getViCardState`, no other changes
- `src/app/api/vocab/vietnamese/route.ts` — already exists, already works once schema exists
- `src/app/api/vocab/save/route.ts` — unchanged (Vietnamese is fetched client-side after save)
- `src/app/api/vocab/lookup/route.ts` — unchanged
- `src/lib/diff.ts` — unchanged
- `src/lib/suggestions.ts` — unchanged
- `src/lib/dates.ts` — unchanged
- `src/components/VocabPopover.tsx` — unchanged
- `src/components/ImprovedVersionPane.tsx` — unchanged

---

## 11. Test fixtures — `scripts/test_vietnamese_cards.mjs`

### A. `getViCardState` — card display state

| Item | Expected |
|------|----------|
| `{ vi_meaning: 'làm yên lòng', vi_explanation: 'vì diễn tả cảm giác...' }` | `'has-both'` |
| `{ vi_meaning: 'làm yên lòng', vi_explanation: '' }` | `'has-meaning-only'` |
| `{ vi_meaning: 'làm yên lòng', vi_explanation: undefined }` | `'has-meaning-only'` |
| `{ vi_meaning: '', vi_explanation: '' }` | `'not-cached'` |
| `{ vi_meaning: undefined, vi_explanation: undefined }` | `'not-cached'` |
| `{ vi_meaning: '', vi_explanation: 'something' }` | `'not-cached'` (meaning is primary) |

### B. Search matching Vietnamese — `searchItems` with `vi_meaning`

Fixtures (extend the existing ITEMS array with `vi_meaning`):

| Query | Match? | Why |
|-------|--------|-----|
| `"vội"` | YES — matches item with `vi_meaning: "rất vội vàng, gấp gáp"` | Exact substring |
| `"voi"` (no diacritics) | YES — `stripAccents("vội")` → `"voi"` | Accent-tolerant |
| `"gấp gáp"` | YES — substring of vi_meaning | Vietnamese substring |
| `"gap gap"` | YES — accent-stripped match | Accent-tolerant |
| `"yên lòng"` | YES — matches `vi_meaning: "làm yên lòng"` | Vietnamese |
| `"hurry"` | YES — matches English `display_form: "in such a hurry"` | English still works |
| `"xin chào"` | NO — not in any field | No false positive |

Key test: a query that matches ONLY Vietnamese, not English:

| Query | Expected matches |
|-------|-----------------|
| `"gấp gáp"` | Only the item whose `vi_meaning` contains "gấp gáp" — no English field matches this |

### C. On-demand fetch reuses cache

This is a flow test described as assertions on the expected API behaviour:

1. Card has `vi_meaning: ''`, `vi_explanation: ''` → state is `not-cached`.
2. User taps "Xem tiếng Việt" → `POST /api/vocab/vietnamese` fires.
3. API checks `vocab_definitions` for `vi_meaning` where `headword = normHeadword`.
4. If cached → returns `fromCache: true`, no LLM call.
5. Card updates to show the meaning.

This flow is tested via the existing pure functions: `getViCardState` transitions
from `not-cached` to `has-meaning-only` or `has-both` based on the response.
The cache-hit logic is already tested in `test_vietnamese.mjs`.

### D. Diacritics edge cases — `stripAccents` on Vietnamese

| Input | After stripAccents | Note |
|-------|-------------------|------|
| `"vội"` | `"voi"` | Tonal mark + hook stripped |
| `"đến"` | `"đen"` | `đ` preserved (not a combining mark), tonal stripped |
| `"nghĩa"` | `"nghia"` | Tilde stripped |
| `"ước"` | `"uoc"` | Circumflex + horn stripped |

Search assertions:
- `search("voi")` matches item with `vi_meaning` containing `"vội"` ✓
- `search("đen")` matches item with `vi_meaning` containing `"đến"` ✓
- `search("den")` does NOT match item with `vi_meaning` containing `"đến"` ✓
  (because `đ` ≠ `d` after stripping — this is correct behaviour)

---

## 12. Definition of Done

- [ ] Migration `0007_vietnamese.sql` applied (user runs SQL)
- [ ] `SavedVocabItem` extended with `vi_meaning?`, `vi_explanation?`
- [ ] `getViCardState()` pure function in `src/lib/vocab.ts`
- [ ] Entry page loads `vi_meaning` from joined `vocab_definitions`
- [ ] Entry page batch-queries `vi_explanations` for explanations
- [ ] Library page loads `vi_meaning` from joined `vocab_definitions`
- [ ] Library page batch-queries `vi_explanations` for explanations
- [ ] `handleVocabSave` fires Vietnamese fetch alongside English lookup
- [ ] Card appears immediately, fields fill progressively
- [ ] Vietnamese failure never prevents card from showing
- [ ] VocabPanel: Vietnamese section below English, visually secondary
- [ ] VocabLibrary: Vietnamese section below English, same layout
- [ ] Card state: meaning + explanation — both shown
- [ ] Card state: meaning only — shown alone, nothing hinting explanation is missing
- [ ] Card state: not-cached — "Xem tiếng Việt" affordance shown
- [ ] Card state: fetch-failed — retry affordance shown
- [ ] On-demand fetch per card works (entry panel)
- [ ] On-demand fetch per card works (library page)
- [ ] No automatic fetches on page load (either view)
- [ ] No bulk "translate all" action
- [ ] `searchItems` includes `vi_meaning` in haystack
- [ ] Search: typing Vietnamese finds English terms
- [ ] Search: accent-stripped matching works (e.g., "voi" finds "vội")
- [ ] `scripts/test_vietnamese_cards.mjs` — all fixtures pass
- [ ] All existing test scripts pass unchanged
- [ ] `npm run build` clean
- [ ] Two-pane layout: fixed heights, independent scrolling, min-h-0 preserved
- [ ] Autosave unaffected
- [ ] Deleting a saved term leaves shared caches intact
- [ ] Popover behaviour on entry page untouched

## Non-goals

- Modifying the VocabPopover (Phase 16 already handles it)
- Pre-fetching Vietnamese for all terms on page load
- Bulk "translate everything" action on the library
- New npm packages
- Modifying `src/lib/diff.ts`, `src/lib/suggestions.ts`, `src/lib/dates.ts`
- Modifying `src/lib/ai/prompt.ts`

---

## 13. Argument for per-card on-demand (situation B)

The user asked me to argue if I think this is wrong. I don't — it's correct.

**Why on-demand is right for old terms:**
1. **Quota protection.** A library of 100 untranslated words × 1 LLM call each
   = 100 calls on page load. With a 30/day limit, this exhausts the quota
   instantly and blocks all other lookups for the day.
2. **Progressive value.** Most old cards were saved for the English definition.
   The user doesn't necessarily want Vietnamese for all of them — only the ones
   they revisit and find confusing.
3. **Cache builds naturally.** Every time a new card is saved (situation A),
   Vietnamese is fetched immediately. Over time, most active vocabulary will have
   Vietnamese without the user lifting a finger.
4. **Predictable cost.** One tap = one call (or zero if cached). The user is
   always in control.

The only alternative would be a background job that translates old terms in
small batches (e.g., 5/day). That's a future optimisation, not a launch
requirement.
