# Phase 14: Vocabulary Library Page

## Context Recap

Phase 13 built the in-entry vocabulary system: popover on highlighted fragments
in the tutor's copy, vocab panel above the stage tabs, three API routes
(save/lookup/delete), and two Supabase tables (`saved_vocab` + `vocab_definitions`).

Current schema (actually applied):
- `saved_vocab`: id, user_id, entry_id, definition_id (FK → vocab_definitions,
  ON DELETE SET NULL), display_form, original_form, headword, change_type
  (grammar/vocabulary/style/spelling/''), status (learning/known), created_at.
  UNIQUE(user_id, entry_id, headword). Full CRUD RLS on own rows.
- `vocab_definitions`: id, headword (UNIQUE), ipa, part_of_speech, definition,
  example, source (dictionary/llm), fetched_at. RLS: SELECT only for
  authenticated; writes via service role client.

Existing API routes: POST `/api/vocab/save`, POST `/api/vocab/lookup`,
DELETE `/api/vocab/[id]`. No PATCH exists yet.

**No MCP to Supabase.** All SQL is copy-paste for the user.

## Goal

Add a standalone page at `/vocabulary` where the user browses every term they
have saved across all entries. Stats bar, search, sort, filter, date-grouped
cards, Learning/Known toggle, delete, retry lookup, pronunciation, and links
back to entries.

## Non-goals

- Spaced repetition / flashcard mode.
- Exporting vocabulary to CSV/Anki.
- Editing definitions or adding personal notes.
- URL-synced filters (Decision 1: filters are client state only).
- Virtualised scrolling (under 1,500 rows/year, not needed).
- Fuzzy search (Decision 3: substring match only, no library).

## Scale assumption

At 4 terms/day × 365 days = ~1,460 rows/year. Loading all rows server-side and
filtering client-side is fine up to roughly 5,000–8,000 rows. Beyond that, the
page payload size and initial render time become noticeable and we would switch
to server-side pagination with cursor-based fetch (keyset pagination on
`created_at`), moving search to a Supabase text search column. That threshold
is 3–5 years of daily use, so not a concern now.

## Interface Contract

### New file: `src/lib/vocabLibrary.ts`

All filtering, sorting, grouping, search, and stats logic lives here as pure
functions. The component imports and calls them.

```ts
// ── Types ──────────────────────────────────────────────────────────────

export type TimeRange = 'all' | '365' | '30' | '7'
export type KindFilter = 'all' | 'grammar' | 'vocabulary' | 'style' | 'spelling'
export type SortOrder = 'date' | 'az'

export type VocabGroup = {
  label: string       // "Today", "Yesterday", "Wednesday, Aug 5", or "All words, A – Z"
  count: string       // "3 words"
  items: SavedVocabItem[]
}

export type LibraryStats = {
  total: number
  last30: number
  thisWeek: number
  thisWeekEntries: number   // distinct entry_id count within 7-day window
  knownCount: number
  mostCommonKind: string | null  // null when no items; on tie, first alphabetically
  mostCommonKindCount: number
}

// ── Pure functions ─────────────────────────────────────────────────────

/**
 * Filter items by time range.
 * "7" = created_at within last 7 calendar days (inclusive of today).
 * "30" = last 30 calendar days. "365" = this calendar year. "all" = no filter.
 * `today` is the user's local date string (YYYY-MM-DD).
 */
export function filterByRange(
  items: SavedVocabItem[],
  range: TimeRange,
  today: string,
): SavedVocabItem[]

/**
 * Filter by change_type. "all" = no filter.
 */
export function filterByKind(
  items: SavedVocabItem[],
  kind: KindFilter,
): SavedVocabItem[]

/**
 * Case-insensitive, accent-stripped substring search across display_form,
 * headword, and definition text. Empty query returns all items.
 * Strips combining diacritics via String.normalize('NFD') + regex.
 */
export function searchItems(
  items: SavedVocabItem[],
  query: string,
): SavedVocabItem[]

/**
 * Sort by date (newest first) or alphabetically (A–Z by display_form,
 * case-insensitive). A–Z sorts by the full display_form — "a comforting
 * movie" sorts under A, not C. This is the simplest, most predictable rule.
 */
export function sortItems(
  items: SavedVocabItem[],
  order: SortOrder,
): SavedVocabItem[]

/**
 * Group items into date sections.
 * - order='date': groups by calendar date (Today, Yesterday, then
 *   "Wednesday, Aug 5" format). `today` and `tz` determine the boundary.
 * - order='az': single group "All words, A – Z".
 *
 * Date format for older headings: "Weekday, Mon D" (e.g. "Wednesday, Aug 5").
 * When the date is in a different year: "Weekday, Mon D, YYYY".
 * Example: Today is 2026-08-06. A term saved on 2025-12-30 groups under
 * "Tuesday, Dec 30, 2025".
 */
export function groupItems(
  items: SavedVocabItem[],
  order: SortOrder,
  today: string,
  tz: string,
): VocabGroup[]

/**
 * Compute stats from ALL items (before filtering).
 * `today` is user's local date (YYYY-MM-DD).
 */
export function computeLibraryStats(
  items: SavedVocabItem[],
  today: string,
): LibraryStats
```

### Date grouping detail

`created_at` is stored as `timestamptz`. To determine which local date a term
was saved on, convert `created_at` to the user's timezone, then extract the
date part. The grouping helper receives `tz` (the `profiles.timezone` value)
and uses `Intl.DateTimeFormat` for conversion.

A term saved at 2026-08-05 23:45:00+07 (Vietnam) belongs to Aug 5 in
`Asia/Ho_Chi_Minh`, not Aug 6.

### "This week" definition

Monday through today (inclusive), matching the app's Monday-first convention.
Uses the user's timezone for the Monday boundary.

### Tie-breaking for "most common kind"

When two or more kinds have the same count, pick the first alphabetically.
When there are no items, `mostCommonKind` is null and `mostCommonKindCount` is 0.

### New API route: PATCH `/api/vocab/[id]`

```ts
// Request body: { status: 'learning' | 'known' }
// Response: { updated: true }
// Auth: same pattern as DELETE — RLS ensures own rows.
```

Added to existing `src/app/api/vocab/[id]/route.ts` alongside the existing
DELETE handler.

### Navigation links

1. **VocabPanel.tsx** — add "Open library →" link in the header, between the
   count pill and the Hide button. Links to `/vocabulary`.

2. **Home page (src/app/page.tsx)** — add a subtle link below the CTA section.
   Proposed placement: a new row after the "Write today's entry" button row,
   styled as an italic serif link matching the encouragement text style:

   ```
   <Link href="/vocabulary" className="font-serif italic text-[14px] text-ink-3 hover:text-ink">
     Open your vocabulary library →
   </Link>
   ```

   This sits naturally after the streak encouragement line and doesn't compete
   with the primary CTA.

### Page structure

```
/vocabulary (src/app/vocabulary/page.tsx — server component)
  └─ VocabLibrary (src/components/VocabLibrary.tsx — client component)
       Props: { items: SavedVocabItem[], timezone: string, today: string }
```

The server component fetches all saved_vocab rows with joined vocab_definitions
(same query pattern as `diary/[date]/page.tsx`), plus `profiles.timezone`, then
passes everything to the client component.

The client component holds filter/search/sort state and renders:
1. Header ("EVERY WORD YOU KEPT" / "Vocabulary library" / ← Home)
2. Stats bar (brass spine, 4-column grid)
3. Controls section (search input, sort toggle, range chips, kind chips, count)
4. Grouped card grid OR empty/no-match state

### Card layout

Each card shows:
- **Row 1**: display_form (serif 18px 600) + ♪ button (hidden if no English voice)
- **Row 2**: IPA (mono 12px) + part_of_speech (serif italic 13px)
- **Row 3**: definition (13.5px, text-wrap: pretty)
- **Row 4**: example in quotes (serif italic 13.5px)
- **Footer** (border-top): change_type chip + "you wrote '...'" + "Aug 5 entry →"
  link + ☆/★ Learning/Known toggle (pill, right-aligned)

Cards with missing definition show a "Retry lookup" button instead of rows 2–4.
Long definitions/examples use `text-wrap: pretty` and natural word wrap — no
truncation, no explicit max-height.

### Learning/Known toggle

Optimistic update:
1. Flip `status` in local state immediately.
2. Fire PATCH `/api/vocab/[id]` with `{ status: newStatus }`.
3. On success: done (state already correct).
4. On failure: revert local state, show a brief error (e.g. toast or inline).

### Delete from library

Each card has a × remove button (same as in-entry VocabPanel). Fires
DELETE `/api/vocab/[id]`. Optimistic: remove from local state, revert on error.
Does NOT delete from `vocab_definitions`.

### Empty states

1. **No saved terms at all** (items.length === 0):
   ```
   Dashed-border card, grain background.
   "Your vocabulary library will grow here."
   "When you read your tutor's notes, tap ✎ Note on any correction to save it."
   ```

2. **Filters match nothing** (items.length > 0 but filtered to 0):
   ```
   "Nothing here yet — no word matches that filter."
   [Clear filters] button
   ```
   The "Clear filters" button resets search, range, and kind to defaults.

## Schema changes

No new tables. One recommended index for the library page query:

```sql
-- The library page fetches all saved_vocab for a user, ordered by created_at.
-- The existing idx_saved_vocab_user_entry covers (user_id, entry_id) but not
-- ordering by created_at. For the library query we want:
CREATE INDEX idx_saved_vocab_user_created
  ON public.saved_vocab(user_id, created_at DESC);
```

This makes the `ORDER BY created_at` scan efficient when a user has many saved
terms. Not strictly needed at current scale but cheap to add.

## Flags

### Flag 1: "This week" entries stat requires entry_date

The "from N entries" subtitle under THIS WEEK needs to count distinct entries
that produced vocab saves this week. The `saved_vocab` table has `entry_id` but
not `entry_date`. Options:

**(A) Join through entries table server-side** — the server component already
has access; query `saved_vocab` joined with `entries(entry_date)` and pass the
date alongside each item. This means adding `entry_date` to the data passed to
the client.

**(B) Derive from created_at** — a term's `created_at` is close to but not
identical to the entry's date (e.g. an entry for Jul 30 could have a term saved
on Aug 1). This would be inaccurate.

**Recommendation**: Option A. Add `entry_date` to the server-side query join
and include it in `SavedVocabItem` type (or a library-specific extended type).
The entry link also benefits from having `entry_date` directly.

### Flag 2: SavedVocabItem needs entry_date for the card link

The card's "Aug 5 entry →" link needs the entry's date to construct
`/diary/[date]`. Currently `SavedVocabItem` has `entry_id` (UUID) but not
`entry_date`. Same solution as Flag 1: join entries in the server query.

**Recommendation**: Extend the type used on the library page to include
`entry_date: string`. Rather than modifying the shared `SavedVocabItem` type
(which would require the entry page query to also join entries), define a
library-specific type:

```ts
export type LibraryVocabItem = SavedVocabItem & { entry_date: string }
```

### Flag 3: The mockup's "tap ☆ to promote a word" subtitle

The design shows "tap ☆ to promote a word" under MARKED KNOWN. This is
instructional text that makes sense when the count is 0 but is redundant once
the user has promoted words. Recommend always showing it (it's short, not
distracting, and serves as a reminder).

**No action needed** — implement as-is from the design.

## Steps

### Step A: Pure logic + tests

1. Create `src/lib/vocabLibrary.ts` with all pure functions.
2. Create `scripts/test_vocab_library.mjs` with fixtures covering:

**Fixtures** (shared across test groups):

```js
// 18 items spanning multiple dates, kinds, statuses
const ITEMS = [
  // Today (2026-08-06 in Asia/Ho_Chi_Minh)
  { id:'1', display_form:'a comforting movie', headword:'comforting', original_form:'a comfortable movie', change_type:'vocabulary', status:'learning', created_at:'2026-08-06T10:00:00+07:00', entry_date:'2026-08-06', entry_id:'e1', definition:{ id:'d1', ipa:'/ˈkʌm.fə.tɪŋ/', part_of_speech:'adjective', definition:'Making you feel calmer.', example:'A comforting movie.', source:'dictionary' } },
  { id:'2', display_form:'delicious', headword:'delicious', original_form:'delicous', change_type:'spelling', status:'known', created_at:'2026-08-06T11:00:00+07:00', entry_date:'2026-08-06', entry_id:'e1', definition:{ id:'d2', ipa:'/dɪˈlɪʃ.əs/', part_of_speech:'adjective', definition:'Having a very pleasant taste.', example:'The chicken was delicious.', source:'dictionary' } },

  // Yesterday (2026-08-05)
  { id:'3', display_form:'arrived at', headword:'arrived at', original_form:'arrived to', change_type:'grammar', status:'learning', created_at:'2026-08-05T22:30:00+07:00', entry_date:'2026-08-05', entry_id:'e2', definition:{ id:'d3', ipa:'/əˈraɪvd ət/', part_of_speech:'phrasal verb', definition:'To reach a specific place.', example:'We arrived at the office.', source:'llm' } },
  { id:'4', display_form:'in such a hurry', headword:'in such a hurry', original_form:'so hurry', change_type:'vocabulary', status:'learning', created_at:'2026-08-05T22:35:00+07:00', entry_date:'2026-08-05', entry_id:'e2', definition:null },

  // 3 days ago (2026-08-03, Sunday)
  { id:'5', display_form:'overslept', headword:'overslept', original_form:'still woke up late', change_type:'style', status:'learning', created_at:'2026-08-03T15:00:00+07:00', entry_date:'2026-08-03', entry_id:'e3', definition:{ id:'d5', ipa:'/ˌəʊ.vəˈslept/', part_of_speech:'verb', definition:'To sleep longer than intended.', example:'I overslept and missed the meeting.', source:'dictionary' } },

  // 6 days ago (2026-07-31, Friday) — still within 7-day window
  { id:'6', display_form:'due to', headword:'due to', original_form:'because of a', change_type:'style', status:'known', created_at:'2026-07-31T09:00:00+07:00', entry_date:'2026-07-31', entry_id:'e4', definition:{ id:'d6', ipa:'/djuː tə/', part_of_speech:'preposition', definition:'Because of.', example:'I skipped the gym due to injury.', source:'llm' } },

  // 8 days ago (2026-07-29) — outside 7-day, inside 30-day
  { id:'7', display_form:'good advice', headword:'good advice', original_form:'a good advice', change_type:'grammar', status:'learning', created_at:'2026-07-29T14:00:00+07:00', entry_date:'2026-07-29', entry_id:'e5', definition:{ id:'d7', ipa:'/ədˈvaɪs/', part_of_speech:'noun', definition:'An opinion about what to do.', example:'That was good advice.', source:'dictionary' } },
  { id:'8', display_form:'ended successfully', headword:'ended successfully', original_form:'ended successful', change_type:'grammar', status:'known', created_at:'2026-07-29T14:05:00+07:00', entry_date:'2026-07-29', entry_id:'e5', definition:{ id:'d8', ipa:'/səkˈses.fəl.i/', part_of_speech:'adverb', definition:'Achieving the intended result.', example:'The meeting ended successfully.', source:'dictionary' } },

  // 34 days ago (2026-07-03) — outside 30-day, inside 365-day
  { id:'9', display_form:'opted to', headword:'opted to', original_form:'went to', change_type:'vocabulary', status:'learning', created_at:'2026-07-03T10:00:00+07:00', entry_date:'2026-07-03', entry_id:'e6', definition:{ id:'d9', ipa:'/ˈɒp.tɪd/', part_of_speech:'verb', definition:'To choose one thing rather than another.', example:'I opted to stay home.', source:'llm' } },

  // 52 days ago (2026-06-15) — also inside 365-day
  { id:'10', display_form:'a better day', headword:'a better day', original_form:'a more better day', change_type:'grammar', status:'known', created_at:'2026-06-15T10:00:00+07:00', entry_date:'2026-06-15', entry_id:'e7', definition:{ id:'d10', ipa:'/ˈbet.ər/', part_of_speech:'adjective', definition:'Already comparative.', example:'I hope tomorrow is a better day.', source:'dictionary' } },
]
```

**Test groups**:

1. **Time range filtering** (7 tests):
   - `'all'` returns all 10 items
   - `'7'` returns items 1–6 (within 7 calendar days of Aug 6)
   - `'30'` returns items 1–8
   - `'365'` returns all 10 (all within 2026)
   - Boundary: item saved exactly 7 days ago (Jul 31 = day 6, included in '7')
   - Boundary: item saved exactly 30 days ago (Jul 7 = day 30, included — but
     our fixture has day 34 which is excluded)
   - Cross-year: modify a fixture item to 2025-12-30 and verify '365' excludes
     it but 'all' includes it

2. **Date grouping** (6 tests):
   - Today items group under "Today"
   - Yesterday items group under "Yesterday"
   - 3-days-ago items: "Sunday, Aug 3"
   - Different year: "Tuesday, Dec 30, 2025"
   - Late-night save at 23:45+07 stays in correct day (Aug 5 not Aug 6)
   - A–Z sort produces single group "All words, A – Z"

3. **Search matching** (5 tests):
   - Case: "DELICIOUS" matches "delicious"
   - Substring in definition: "pleasant taste" matches item 2
   - Punctuation in term: searching "comforting" matches "a comforting movie"
   - Query matching nothing: "xyznotfound" returns empty
   - Empty query returns all items

4. **Sorting** (4 tests):
   - Date descending: newest first (item 1 before item 2 before item 3...)
   - A–Z: "a better day" < "a comforting movie" < "arrived at" < "delicious"...
   - Case-insensitive: items differing only in case sort stably
   - "a comforting movie" sorts under A (full display_form), not C

5. **Stats calculations** (5 tests):
   - Total = 10
   - last30 = 8 (items 1–8)
   - thisWeek = 6, thisWeekEntries = 4 (entries e1, e2, e3, e4)
   - knownCount = 4 (items 2, 6, 8, 10)
   - mostCommonKind = 'grammar' (4 items: 3, 7, 8, 10)
   - Tie: when grammar and vocabulary both have 3, pick 'grammar' (alphabetical)
   - Empty array: total=0, mostCommonKind=null

### Step B: API route (PATCH)

Add PATCH handler to `src/app/api/vocab/[id]/route.ts`:
- Auth check (same as DELETE)
- Validate body: `status` must be 'learning' or 'known'
- Update via Supabase (RLS ensures own rows)
- Return `{ updated: true }`

### Step C: Page + component

1. `src/app/vocabulary/page.tsx` — server component:
   - Auth check, redirect if not logged in
   - Fetch `profiles.timezone`
   - Fetch all `saved_vocab` joined with `vocab_definitions` and `entries(entry_date)`,
     ordered by `created_at DESC`
   - Compute `today` from timezone
   - Pass to `VocabLibrary` component

2. `src/components/VocabLibrary.tsx` — client component:
   - State: `query`, `range` (TimeRange), `kind` (KindFilter), `sort` (SortOrder),
     `items` (local copy for optimistic updates)
   - Compute filtered/sorted/grouped items and stats from pure functions
   - Render: header, stats bar, controls, groups with cards, empty states
   - Handle: search input, filter chips, sort toggle, Learning/Known toggle
     (optimistic PATCH), delete (optimistic DELETE), retry lookup, pronunciation

3. `src/components/VocabPanel.tsx` — add "Open library →" link:
   - Insert between count pill and the divider line
   - `<Link href="/vocabulary">Open library →</Link>`

4. `src/app/page.tsx` — add link to vocabulary library:
   - Below the CTA row, a serif italic link to `/vocabulary`

### Step D: Verify

1. `node scripts/test_vocab_library.mjs` — all assertions pass
2. All existing test scripts pass unchanged
3. `npm run build` clean
4. Manual: resize 1920px → 390px, light + dark, populated/empty/no-match states

## Definition of Done

### Data integrity
- [ ] No code path writes `corrected_version` into `entries.content`
- [ ] `is_backfill` only set on INSERT, never changed on UPDATE
- [ ] All "today" calculations use `profiles.timezone`
- [ ] No `NEXT_PUBLIC_` prefix on AI env vars
- [ ] No `dangerouslySetInnerHTML`
- [ ] Deleting a saved term does NOT delete the cached definition
- [ ] No dictionary/LLM calls on page load (Decision 6)
- [ ] PATCH only updates `status`, not other fields

### Display invariants
- [ ] Four heatmap cell states visually distinct
- [ ] Today cell has distinct indicator
- [ ] Mood dots on month calendar
- [ ] Word count displayed as text, not colour intensity
- [ ] Photo-only days don't light up cells
- [ ] Week starts Monday

### Behaviour invariants
- [ ] Autosave 1500ms + blur
- [ ] Word count updates realtime
- [ ] Two panes equal fixed height, independent scroll, `min-h-0` throughout
- [ ] Photo tilt deterministic from `photo.id`, no `Math.random()`
- [ ] No continuous animation on entry page
- [ ] Click highlight → selects MARGIN NOTE item
- [ ] Click highlight → opens popover
- [ ] Lightbox closes via backdrop, ×, Escape
- [ ] Future dates not clickable
- [ ] Suggestion counter correct

### Library-specific
- [ ] Stats bar shows correct totals
- [ ] "This week" counts from Monday through today
- [ ] "Most common kind" shows correct kind (alphabetical on tie)
- [ ] Search matches display_form, headword, and definition text
- [ ] Search is case-insensitive and accent-tolerant
- [ ] Sort by date: newest first
- [ ] Sort A–Z: full display_form, "a comforting" under A
- [ ] Time range "7 days" includes today and 6 days back
- [ ] Kind filter filters by change_type
- [ ] Live count updates as filters change
- [ ] Learning/Known toggle is optimistic with revert on error
- [ ] Delete is optimistic, does not touch vocab_definitions
- [ ] Retry lookup reuses existing `/api/vocab/lookup` route
- [ ] Empty library shows inviting message
- [ ] Filters-match-nothing shows different message + Clear filters
- [ ] Cards with missing definition show retry button
- [ ] Long definitions wrap naturally, no truncation
- [ ] Sound button hidden when no English voice
- [ ] Each card links to `/diary/[entry_date]`
- [ ] "Open library →" link in VocabPanel
- [ ] Link to library from home page
- [ ] Page accessible at `/vocabulary`
- [ ] Responsive: 1920px → 390px without clipping

### Tests
- [ ] All existing test scripts pass unchanged
- [ ] `npm run build` clean
- [ ] `scripts/test_vocab_library.mjs` — all assertions pass

### Manual checks
- [ ] Resize 1920px → 360px: nothing clipped, nothing overlapping
- [ ] `prefers-reduced-motion` respected
- [ ] Dark mode renders correctly

## Handoff Obligations

1. Write `memory/phase_14_report.md`
2. Update `memory/STATE.md` (full replace)
3. Update `memory/discoveries.md` if Moderate/Major findings
4. All DoD items reported with actual verification status
