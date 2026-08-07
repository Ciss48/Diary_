# Phase 13–14 Report: Vocabulary (In-Entry + Library Page)

**Completed:** 2026-08-06

## Phase 13 — In-Entry Vocabulary Saving

### What was done
1. **Database schema** (`supabase/migrations/0005_vocabulary.sql`):
   - `saved_vocab` table: id, user_id, entry_id, display_form, original_form, headword, change_type, status (learning/known), created_at. RLS: user owns rows.
   - `vocab_definitions` table: id, headword, part_of_speech, ipa, definition, example, source, created_at. RLS: anyone can SELECT, no INSERT (service role writes). Unique on (headword, part_of_speech).
   - Index `idx_saved_vocab_user_created` on (user_id, created_at DESC).

2. **AI prompt enrichment** (`src/lib/ai/prompt.ts`):
   - Added `headword`, `pos`, `worth_saving` fields to the change schema in the AI prompt.
   - Instructions for headword extraction (strip articles, keep phrasal verbs as units).

3. **Types and parsing**:
   - `src/lib/suggestions.ts` — `Change` type extended with `headword?`, `pos?`, `worth_saving?`. `filterChanges()` passes them through.
   - `src/lib/diff.ts` — `DiffChange` extended with `headword`, `pos`, `worthSaving`. `buildDiffChanges()` matches them from model output.
   - `src/lib/vocab.ts` — NEW: `SavedVocabItem` type, shared between entry and library.

4. **API routes** (`src/app/api/vocab/`):
   - `save/route.ts` — POST: resolves entry by date + user, inserts into `saved_vocab`, returns saved item.
   - `lookup/route.ts` — POST: checks `vocab_definitions` cache, falls back to Free Dictionary API, writes via service-role client.
   - `[id]/route.ts` — DELETE (remove vocab), PATCH (toggle status learning/known).

5. **UI components**:
   - `VocabPopover.tsx` — NEW: floating toolbar on change click (Copy / Sound / Save / Remove).
   - `VocabPanel.tsx` — NEW: brass-spine panel showing all saved vocab cards for the entry.
   - `ImprovedVersionPane.tsx` — integrated popover, saved-word dashed underline styling.
   - `DiaryEditor.tsx` — vocab state management, save/remove/retry callbacks, VocabPanel rendering.

6. **Server loading** (`src/app/diary/[date]/page.tsx`):
   - Loads `initialSavedVocab` from `saved_vocab` joined with `vocab_definitions`.

7. **Service client** (`src/lib/supabase/server.ts`):
   - Added `createServiceClient()` using `SUPABASE_SERVICE_ROLE_KEY` for writing to `vocab_definitions`.

### Tests
- `scripts/test_vocab.mjs` — vocab type and utility tests
- All 259 existing tests continue to pass

## Phase 14 — Vocabulary Library Page

### What was done
1. **Pure library functions** (`src/lib/vocabLibrary.ts`):
   - Types: `LibraryVocabItem`, `TimeRange`, `KindFilter`, `SortOrder`, `VocabGroup`, `LibraryStats`.
   - `filterByRange()` — All time / This year / Last 30 / Last 7 (timezone-aware).
   - `filterByKind()` — all / grammar / vocabulary / style / spelling.
   - `searchItems()` — case-insensitive, accent-stripped substring across display_form, headword, definition.
   - `sortItems()` — date descending or A-Z (case-insensitive localeCompare).
   - `groupItems()` — Today/Yesterday/Weekday headings (date mode) or single "All words, A – Z" group.
   - `computeLibraryStats()` — total, last30, thisWeek (Monday-based), thisWeekEntries, knownCount, mostCommonKind.

2. **Server page** (`src/app/vocabulary/page.tsx`):
   - Auth check, timezone fetch, loads all `saved_vocab` joined with `vocab_definitions` and `entries(entry_date)`.
   - Passes items, timezone, today to VocabLibrary client component.

3. **Client component** (`src/components/VocabLibrary.tsx`, ~300 lines):
   - Stats bar: WORDS KEPT, THIS WEEK, MARKED KNOWN, MOST COMMON KIND.
   - Controls: search input, sort toggle, range chips, kind chips, live count.
   - VocabCard: term, IPA, POS, definition, example, change_type chip, "you wrote", entry link, Learning/Known toggle.
   - Empty states: inviting message (no terms), "no words match" + Clear filters.
   - Optimistic updates: status toggle (PATCH), delete (DELETE), retry lookup.

4. **Navigation**:
   - Home page (`src/app/page.tsx`): "Open your vocabulary library" CTA button (red box, white text) above heatmap.
   - VocabPanel: "Open library →" link in header.

### Tests
- `scripts/test_vocab_library.mjs` — 40 tests covering range filtering, date grouping, search, sorting, stats, kind filtering.
- All 299 tests pass, build clean.

## Definition of Done

### Phase 13
- [x] Migration creates `saved_vocab` + `vocab_definitions` with RLS — verified (user applied)
- [x] POST /api/vocab/save creates a row, returns it — verified (code review)
- [x] POST /api/vocab/lookup caches in `vocab_definitions` — verified (code review, service client used)
- [x] DELETE /api/vocab/[id] removes vocab — verified (code review)
- [x] PATCH /api/vocab/[id] toggles status — verified (code review)
- [x] VocabPopover shows on change click with Copy/Sound/Save/Remove — verified (code review)
- [x] VocabPanel displays saved words with definitions — verified (code review)
- [x] Saved words shown with dashed underline in ImprovedVersionPane — verified (code review)
- [x] Server-side loads initialSavedVocab on page load — verified (code review)

### Phase 14
- [x] /vocabulary page loads and displays all saved vocab — verified (code review)
- [x] Stats bar shows 4 metrics — verified (code review)
- [x] Search filters across term and definition — verified (40 tests pass)
- [x] Sort by date / A-Z works — verified (tests)
- [x] Range filtering (All/Year/30/7) works timezone-aware — verified (tests)
- [x] Kind filtering works — verified (tests)
- [x] Date grouping with Today/Yesterday/Weekday headings — verified (tests)
- [x] Learning/Known toggle with optimistic update — verified (code review)
- [x] Delete with optimistic update — verified (code review)
- [x] Retry lookup fires POST to /api/vocab/lookup — verified (code review)
- [x] Empty states render correctly — verified (code review)
- [x] Navigation: home page CTA + VocabPanel link — verified (code review)
- [x] All 299 tests pass — verified
- [x] Build clean — verified
- [ ] Manual verification: responsive 1920→390px, dark mode — not verified (requires browser)

## Files created/modified

### New files
- `supabase/migrations/0005_vocabulary.sql`
- `src/lib/vocab.ts`
- `src/lib/vocabLibrary.ts`
- `src/app/api/vocab/save/route.ts`
- `src/app/api/vocab/lookup/route.ts`
- `src/app/api/vocab/[id]/route.ts`
- `src/app/vocabulary/page.tsx`
- `src/components/VocabPanel.tsx`
- `src/components/VocabLibrary.tsx`
- `src/components/VocabPopover.tsx`
- `scripts/test_vocab.mjs`
- `scripts/test_vocab_library.mjs`
- `scripts/test_vocab_live.mjs`
- `scripts/verify_prompt_quality.mjs`
- `tasks/phase_13_vocabulary_entry.md`
- `tasks/phase_14_vocabulary_library.md`

### Modified files
- `src/lib/ai/prompt.ts` — headword/pos/worth_saving in AI prompt
- `src/lib/suggestions.ts` — Change type extended
- `src/lib/diff.ts` — DiffChange extended, buildDiffChanges passes vocab metadata
- `src/lib/supabase/server.ts` — added createServiceClient()
- `src/app/diary/[date]/page.tsx` — loads initialSavedVocab
- `src/app/page.tsx` — vocabulary library CTA button
- `src/components/DiaryEditor.tsx` — vocab state + callbacks + VocabPanel
- `src/components/ImprovedVersionPane.tsx` — popover integration + saved styling
