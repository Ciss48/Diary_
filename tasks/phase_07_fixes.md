# Phase 7: Three Fixes — Diff-based highlights, paragraph breaks, photos-before-text

## Context

Phase 4 AI Suggest works end-to-end but has three user-reported problems:

**A — Under-reported changes.** The model rewrites text correctly but its
`changes` array misses many edits (screenshot shows 6 reported vs ~12 real).
`segmentCorrected` faithfully highlights the `changes` array, so the bug is
upstream: the model is unreliable at self-reporting its own edits.

**B — Paragraph breaks lost.** The original entry has multiple paragraphs
separated by blank lines. The improved-version pane renders everything as a
continuous wall of text. Root cause TBD (could be data or rendering).

**C — Photos require text first.** PhotoStrip is disabled until an entry
exists, but users want to add photos immediately on opening a day.

## Goal

Fix all three problems in order A → B → C, each fully verified before moving
to the next.

## Non-goals

- Rewriting `computeStats` or `buildHeatmapWeeks` internals (Problem C filters
  at the mapping layer in `page.tsx`, not inside these functions).
- Adding new UI beyond what the fixes require.
- Changing the AI provider, model, or response format structure.
- Touching `middleware.ts` or auth.

---

## Problem A — Diff-based change detection

### Approach

Create `src/lib/diff.ts` with a word-level LCS diff that computes the ground
truth of what changed between `source_content` and `corrected_version`. This
replaces the model's `changes` array as the source of truth for highlights and
the CHANGES list. The model's `changes` array is demoted to an explanation
source only.

### Interface Contract

```ts
// src/lib/diff.ts

/** A token is a word or whitespace/punctuation run. */
type Token = { text: string; isWord: boolean };

/**
 * A span in the diff output.
 * - 'equal': text is unchanged.
 * - 'replaced': original text was replaced with corrected text.
 * - 'inserted': text exists only in corrected.
 * - 'deleted': text exists only in original.
 */
type DiffSpanKind = 'equal' | 'replaced' | 'inserted' | 'deleted';

type DiffSpan = {
  kind: DiffSpanKind;
  original: string;   // empty for 'inserted'
  corrected: string;  // empty for 'deleted'
};

/** A display-ready change for the CHANGES list. */
type DiffChange = {
  original: string;
  corrected: string;
  type: ChangeType | null;     // from model match, or null
  explanation: string | null;  // from model match, or null
};

/**
 * Tokenize text into words and non-word runs.
 * A "word" is a maximal run of \w characters.
 * Non-word runs (spaces, punctuation) are separate tokens.
 */
function tokenize(text: string): Token[];

/**
 * Word-level LCS diff between original and corrected text.
 * Returns an array of DiffSpan.
 * Adjacent non-equal spans separated only by whitespace are merged
 * into a single 'replaced' span to avoid noisy fragmentation.
 *
 * INVARIANT: diffSpans.map(s => s.corrected).join('') === corrected
 * INVARIANT: diffSpans.map(s => s.original).join('') === original
 */
function diffTexts(original: string, corrected: string): DiffSpan[];

/**
 * Convert diff spans into Segment[] for ImprovedVersionPane rendering.
 * Each non-equal span becomes a highlighted segment with a changeIndex
 * pointing into the DiffChange[] array. Equal spans have changeIndex null.
 *
 * INVARIANT: segments.map(s => s.text).join('') === corrected
 * No empty segments.
 */
function diffToSegments(spans: DiffSpan[]): Segment[];

/**
 * Build the CHANGES list from diff spans + model-reported changes.
 * For each non-equal diff span, try to find a model Change whose
 * corrected text overlaps that span; if found, attach type + explanation.
 * Unmatched spans get type=null, explanation=null.
 */
function buildDiffChanges(
  spans: DiffSpan[],
  modelChanges: Change[]
): DiffChange[];
```

### Where it plugs in

- `DiaryEditor.tsx` currently calls `segmentCorrected(correctedVersion, safeChanges)`.
  Replace with: `const spans = diffTexts(suggestion.source_content, suggestion.corrected_version)`,
  then `diffToSegments(spans)` for segments and `buildDiffChanges(spans, safeChanges)` for the
  changes list.
- `segmentCorrected` is NOT deleted (it's still used in tests and could be
  useful), but it is no longer called in the render path.
- `SuggestionDetails` receives `DiffChange[]` instead of `Change[]`. The type
  chip shows the model's type when matched, or a neutral "Change" chip when
  unmatched. The explanation shows the model's explanation when matched, or
  is omitted.
- `ImprovedVersionPane` receives the new segments — no interface change needed,
  `Segment[]` type is unchanged.
- The badge count in ImprovedVersionPane header changes from
  `safeChanges.length` to the number of non-equal diff spans (= `diffChanges.length`).

### Test Fixtures (scripts/test_diff.mjs)

All fixtures use `diffTexts` → verify both invariants (join original, join corrected),
then verify the non-equal spans are as expected.

| # | Name | Original | Corrected | Expected non-equal spans |
|---|------|----------|-----------|--------------------------|
| 1 | No change at all | `"I go to school."` | `"I go to school."` | 0 spans — all equal |
| 2 | Single word replaced | `"I go to school."` | `"I went to school."` | 1 span: `"go"` → `"went"` |
| 3 | Word inserted | `"I go school."` | `"I go to school."` | 1 span: `""` → `"to "` (or `" to"`) |
| 4 | Word deleted | `"I go to to school."` | `"I go to school."` | 1 span: `"to "` → `""` (or similar) |
| 5 | Multi-word phrase replaced | `"arrived to the"` | `"arrived at the"` | 1 span: `"to"` → `"at"` |
| 6 | Two separate changes | `"I go to school and I eated lunch."` | `"I went to school and I ate lunch."` | 2 spans: `"go"` → `"went"`, `"eated"` → `"ate"` |
| 7 | Change at very start | `"go to school."` | `"went to school."` | 1 span at position 0 |
| 8 | Change at very end | `"I go to school"` | `"I go to school."` | 1 span: `""` → `"."` (punctuation added) |
| 9 | Punctuation-only change | `"Hello world"` | `"Hello, world"` | 1 span involving the comma |
| 10 | Join invariant holds | (all above cases) | verify `segments.join === corrected` for each |
| 11 | Whitespace merging | `"she looked very strictly"` | `"she looked very strict"` | 1 span: `"strictly"` → `"strict"` (not fragmented) |
| 12 | buildDiffChanges with model match | diff has `"go"→"went"`, model has `{original:"go",corrected:"went",type:"grammar",explanation:"..."}` | DiffChange gets type="grammar" and explanation |
| 13 | buildDiffChanges without model match | diff has `"to"→"at"`, model has no matching change | DiffChange gets type=null, explanation=null |
| 14 | Paragraph preservation | `"Para one.\n\nPara two."` | `"Para one.\n\nPara two."` | 0 non-equal spans, newlines preserved in equal segments |

### Secondary: SYSTEM_PROMPT tightening

After diff is working, also update `src/lib/ai/prompt.ts` to add:

```
- List EVERY change you made, no matter how small. If you changed a single
  preposition, article, or punctuation mark, it must appear in the changes
  array. Under-reporting changes is the single most common failure mode —
  err on the side of listing too many rather than too few.
- The corrected_version must contain the same paragraph structure as the input:
  same number of paragraphs, separated by the same blank lines. Never merge
  paragraphs.
```

This is a nice-to-have. The diff is the fix.

---

## Problem B — Paragraph breaks in improved version

### Diagnostic step (before coding)

Run this SQL and report the result:

```sql
SELECT
  id,
  length(corrected_version) AS len,
  position(chr(10) IN corrected_version) AS first_newline_pos,
  (length(corrected_version) - length(replace(corrected_version, chr(10), ''))) AS newline_count
FROM ai_suggestions
ORDER BY created_at DESC
LIMIT 5;
```

**If newlines ARE present** (newline_count > 0): this is a rendering bug. The
`ImprovedVersionPane` already has `whitespace-pre-wrap` on its container div
(line 71 of `ImprovedVersionPane.tsx`), so the likely cause is that `<mark>`
elements or `<span>` elements are inline and collapsing the whitespace
differently. Fix: ensure the segment rendering preserves newlines. The
`whitespace-pre-wrap` class should already handle this, but if marks are
breaking it, we may need to split segments at newline boundaries and insert
explicit `<br />` or use `\n` within spans that respect `white-space: pre-wrap`.

**If newlines are ABSENT** (newline_count = 0): this is a prompt problem. Add
to SYSTEM_PROMPT (already covered in Problem A's secondary fix above):
"The corrected_version must preserve paragraph breaks from the original."

### Implementation (depends on diagnostic)

- If rendering bug: adjust the rendering in `ImprovedVersionPane.tsx` so that
  newlines within segment text are visible. Since `whitespace-pre-wrap` is
  already set, verify it applies to the content inside `<mark>` and `<span>`
  elements. If needed, ensure marks don't strip whitespace.
- If data bug: the SYSTEM_PROMPT change in Problem A already covers this. No
  additional work needed beyond verifying the next AI call preserves paragraphs.

Either way, verify with a fresh suggestion on a multi-paragraph entry that the
improved version shows the same paragraph breaks.

---

## Problem C — Photos (and mood) before text

### Approach

1. **New helper `ensureEntry`** in `src/lib/entries.ts`:

```ts
/**
 * Return the existing entry for `date`, or create one with empty content.
 * Sets is_backfill correctly at creation time (date < today).
 * Returns the entry row (existing or newly created).
 */
async function ensureEntry(
  date: string,
  tz: string
): Promise<Entry>
```

This is similar to `saveEntry` but creates with `content: ''`, `word_count: 0`,
`mood: null`. `is_backfill` is set once at insert time, never changed later.

2. **PhotoStrip changes:**
   - When `loadState === 'no-entry'`, instead of showing "Write something first",
     show the empty slots and allow upload.
   - On first upload attempt when `entryId` is null, call `ensureEntry(entryDate, timezone)`
     to create the empty entry, set `entryId` from the result, then proceed with upload.
   - Remove the "Write something first" message entirely.

3. **MoodPicker changes (in DiaryEditor):**
   - `handleMoodChange` currently does nothing when `entryExistsRef.current` is false.
     Change it to call `ensureEntry` first, set `entryExistsRef.current = true` and
     `entryId`, then save the mood.

4. **Heatmap/stats filtering in `page.tsx`:**
   - After mapping `rows` to `entries: EntryLite[]`, filter out entries whose
     `content` is empty (after trim). This is done at the mapping layer:
     ```ts
     // Only entries with actual content count for heatmap/stats
     const entries: EntryLite[] = (rows ?? []).map(...)
     // For heatmap and stats, exclude empty-content entries
     const writtenEntries = entries.filter(e => e.wordCount > 0)
     ```
     Pass `writtenEntries` to `computeStats`, `buildHeatmapWeeks`, and `buildMonthGrid`.

   **Note:** This requires fetching `content` (or at least `word_count`) in the
   home page query. Currently it fetches `entry_date, is_backfill, word_count, mood`.
   `word_count` is already there — entries with empty content have `word_count: 0`,
   so filtering by `wordCount > 0` is equivalent to filtering by non-empty content.
   No query change needed.

5. **Verification query** (for me to run):
   ```sql
   -- After creating an entry with photo only, no text:
   SELECT e.entry_date, e.content, e.word_count, e.is_backfill,
          count(p.id) AS photo_count
   FROM entries e
   LEFT JOIN entry_photos p ON p.entry_id = e.id
   WHERE e.entry_date = '2026-07-31'
   GROUP BY e.id;
   ```
   Expected: row exists with `content=''`, `word_count=0`, photo_count=1.
   The heatmap cell for that date should show as 'empty' (unlit) because
   `word_count=0` is filtered out.

---

## Steps

### A — Diff-based highlights
1. Create `src/lib/diff.ts` with `tokenize`, `diffTexts`, `diffToSegments`, `buildDiffChanges`.
2. Create `scripts/test_diff.mjs` with all 14 fixtures listed above.
3. Run tests, iterate until all pass.
4. Update `DiaryEditor.tsx`: replace `segmentCorrected` call with diff-based pipeline.
5. Update `SuggestionDetails.tsx`: accept `DiffChange[]`, render neutral chip for unmatched.
6. Update `ImprovedVersionPane.tsx`: badge count from diff changes length.
7. Tighten `SYSTEM_PROMPT` (secondary).
8. User verifies in browser: all real changes highlighted, CHANGES list complete.

### B — Paragraph breaks
1. User runs diagnostic SQL query.
2. Based on result, fix rendering or confirm prompt fix from A is sufficient.
3. User verifies: multi-paragraph entry shows paragraph breaks in improved version.

### C — Photos before text
1. Add `ensureEntry` to `src/lib/entries.ts`.
2. Update `PhotoStrip.tsx`: remove disabled state, call `ensureEntry` on first upload.
3. Update `DiaryEditor.tsx` `handleMoodChange`: call `ensureEntry` when no entry exists.
4. Update `page.tsx`: filter `entries` by `wordCount > 0` before passing to stats/heatmap/month.
5. User verifies: photo uploads without text; heatmap cell stays unlit; streak unaffected.

---

## Definition of Done

### Problem A
- [ ] `src/lib/diff.ts` exists with exported `diffTexts`, `diffToSegments`, `buildDiffChanges`.
- [ ] `scripts/test_diff.mjs` has all 14 fixtures and passes (`node scripts/test_diff.mjs`).
- [ ] Join invariant: `segments.map(s=>s.text).join('') === corrected_version` for all cases.
- [ ] `DiaryEditor.tsx` uses diff pipeline, not `segmentCorrected`, for rendering.
- [ ] All real differences between source and corrected are highlighted in the pane.
- [ ] All real differences appear in the CHANGES list.
- [ ] Model-matched changes show type chip + explanation; unmatched show neutral chip, no explanation.
- [ ] Old suggestions (already in DB) highlight correctly without migration or re-running AI.
- [ ] Two-column layout, fixed pane heights, min-h-0 overflow, autosave, Copy button, deterministic photo tilt all still work.
- [ ] SYSTEM_PROMPT updated to request complete change reporting (secondary, nice-to-have).

### Problem B
- [ ] Diagnostic SQL run and result reported by user.
- [ ] Multi-paragraph entry shows correct paragraph breaks in improved version pane.
- [ ] Paragraph breaks survive being wrapped in `<mark>` highlight elements.

### Problem C
- [ ] `ensureEntry` exists in `src/lib/entries.ts`.
- [ ] PhotoStrip allows upload without existing entry — creates entry with empty content.
- [ ] MoodPicker works without existing entry — creates entry with empty content.
- [ ] `is_backfill` set correctly at creation time, never changed on update.
- [ ] Home page heatmap and stats exclude entries with `wordCount === 0`.
- [ ] A day with only photos shows as unlit on heatmap and does not affect streak or totalEntries.
- [ ] Verification query confirms entry row exists with empty content + photo.
- [ ] `entries.content` is never overwritten by AI corrected_version (existing invariant).
- [ ] RLS still enforced — no new tables, no policy changes needed.

## Handoff Obligations

1. `memory/phase_07_report.md` — per-item DoD status.
2. `memory/STATE.md` — overwritten with current status.
3. `memory/discoveries.md` — updated if any Moderate/Major findings.
