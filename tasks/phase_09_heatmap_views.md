# Phase 09: Heatmap Year/Month two-mode view

## Context Recap

Phase 01–04 done (see `memory/phase_04_report.md`). Home page (`src/app/page.tsx`)
currently shows:

- `StatsBar` — 4 all-time metrics (unchanged in this phase)
- `HeatmapGrid` — rolling 53 weeks ending at today, Mon→Sun, 4 cell states
- `MonthCalendar` — single month with mood dots, prev/next via `?month=YYYY-MM`

Design reference: `docs/design/heatmap_year_month_reference.jsx` (layout/spacing),
`docs/design/heatmap_year_view.png`, `docs/design/heatmap_month_view.png`.

No Supabase MCP access. All SQL goes to user as copy-paste.

## Goal

Replace `HeatmapGrid` + `MonthCalendar` with a single card (`HeatmapCard`) that
has two modes switchable via a Year/Month toggle:

- **Year mode**: calendar year Jan–Dec as a 7-row grid (Mon→Sun), month labels
  along the top, weekday labels on the left, year navigation ‹ › with year
  between them. Header: `"2026 · full year"`, subtitle:
  `"N weeks · hover a day for details"`.
- **Month mode**: one month at a time as large cells. Each cell shows day number,
  word count (`Nw` or em dash), and mood dot. Header: `"May 2026"`, subtitle:
  `"31 days · 19 entries logged"`. Navigation ‹ ›, plus a `<select>` dropdown to
  jump to any month.

Legend row at the bottom of the card: No entry · Written on time · Backfilled ·
Future · Today (ring).

## Three user decisions (locked, do not reinterpret)

1. **Week starts Monday.** The design mock shows SUN–SAT. Keep Monday-first
   (MON–SUN) to match the rest of the codebase and 74 passing assertions.
   Relabel columns; match everything else from the design.

2. **Month mode replaces MonthCalendar.** The new large cells carry mood dots
   (from the existing MonthCalendar) together with day number and word count.
   Once Month mode works, delete `MonthCalendar.tsx` and its usage.

3. **Year mode is a calendar year (Jan 1 – Dec 31), not rolling 53 weeks.**
   Write a new `buildYearGrid` function. Keep `buildHeatmapWeeks` and its 32
   tests untouched until the new view is verified, then remove its usage from
   `page.tsx` (the function and tests stay in place — no dead code removal of
   tested library code).

## Non-goals

- StatsBar stays all-time — do not scope stats to the visible range.
- No new npm packages, no date library, no dropdown library.
- No custom date ranges, no multi-month selection, no "last N months" presets.
- Do not touch `computeStats`, `src/lib/suggestions.ts`, the diary editor, or
  anything to do with photos or AI.
- Do not encode word count as colour intensity. No five-level GitHub-style scale.
  Darker green = on-time, lighter green = backfilled, always.
- No tooltip library — use native `title` attribute.

## Cell colours (unchanged semantics)

| State      | Tailwind                  | Description                    |
|------------|---------------------------|--------------------------------|
| `future`   | `bg-stone-100 opacity-40` | Not clickable                  |
| `empty`    | `bg-stone-200`            | Past day, no entry             |
| `ontime`   | `bg-emerald-500`          | Entry written on date          |
| `backfill` | `bg-emerald-300`          | Entry written after date       |
| today ring | `ring-1 ring-amber-500`   | Current day highlight          |
| padding    | `transparent`             | Adjacent-year/month filler     |

## URL state

```
?hview=year&y=2026        → year mode, year 2026
?hview=month&hm=2026-05   → month mode, May 2026
```

Fallback: anything missing or invalid → year mode, current year.

These do NOT collide with the existing `?month=` param (which will be removed
when MonthCalendar is deleted). Only the toggle, dropdown, and nav links are
client-side; the grids stay server-rendered.

## Interface Contract — Pure Functions

All new functions go in `src/lib/calendar.ts`. New types:

```ts
export type YearCell = {
  date: string        // 'YYYY-MM-DD'
  inYear: boolean     // false = padding from adjacent year (render blank)
  state: CellState    // 'future' | 'empty' | 'ontime' | 'backfill'
  mood: Mood | null
  wordCount: number
}
```

### buildYearGrid(entries: EntryLite[], year: number, today: string): YearCell[][]

Returns an array of weeks (outer = weeks, inner = 7 cells Mon→Sun).

- Grid starts on the Monday of the week containing Jan 1 of `year`.
- Grid ends on the Sunday of the week containing Dec 31 of `year`.
- Cells outside the year have `inYear: false` (rendered as transparent blanks).
- Cells inside the year follow the same state logic as existing functions:
  `date > today → 'future'`; entry present → `'ontime'`/`'backfill'`; else → `'empty'`.
- Total weeks: usually 53, but can be 54 for leap years starting on Sunday
  (Mon-first grid). The function handles both.

### monthLabelOffsets(weeks: YearCell[][]): { month: number; weekIndex: number }[]

For each of the 12 months, returns the 0-based week-column index where that
month's label should sit. Logic: scan the flat cell list; for each month, record
the week index of the first `inYear: true` cell belonging to that month.

Returns exactly 12 items, sorted by month (0=Jan … 11=Dec).

### yearStats(entries: EntryLite[], year: number): { entries: number; words: number }

Counts entries and sums word counts for entries whose date falls within the
given year. Used for the subtitle in year mode.

### monthStats(entries: EntryLite[], monthStr: string): { daysInMonth: number; entries: number }

Returns total days in that month and how many entries exist. Used for the
subtitle in month mode.

### isValidYear(raw: string | undefined): number | null

Returns the parsed year if `raw` is a 4-digit string representing a year
between 2020 and the current year (inclusive), else `null`. Caller falls back
to the current year on `null`.

## Interface Contract — Fixtures (`scripts/test_calendar.mjs`)

Append to the existing test file (which has 42 passing assertions for
`buildMonthGrid` etc). New fixtures:

### buildYearGrid fixtures

1. **Normal year 2026** (Jan 1 = Thursday):
   - Total cells = weeks × 7, all divisible by 7
   - Padding before: 3 cells (Dec 29–31 of 2025), all `inYear: false`
   - Padding after: 3 cells (Jan 1–3 of 2027), all `inYear: false`
   - Total weeks = 53
   - First in-year cell date = `'2026-01-01'`, last = `'2026-12-31'`
   - Dec 31 present and `inYear: true`

2. **Leap year 2024** (Jan 1 = Monday):
   - Feb 29 exists as a cell with `inYear: true`
   - Padding before: 0 (Jan 1 is Monday)
   - Total weeks = 53 (366 days + 5 padding after = 371 = 53×7)

3. **Year starting on Sunday: 2023** (Jan 1 = Sunday, Mon-first):
   - Padding before: 6 cells (Dec 26–31 of 2022)
   - Padding after: 0 (Dec 31 is Sunday = last column)
   - Total weeks = 53

4. **Leap year starting on Sunday: 2012** (Jan 1 = Sunday):
   - Total weeks = 54 (6 padding + 366 days + 6 padding = 378 = 54×7)
   - This is the rare 54-week case

5. **All in-year cells have correct `inYear: true`; all padding `inYear: false`**:
   - Count `inYear: true` cells = 365 (or 366 for leap)
   - Count `inYear: false` cells = total - days in year

6. **State assignment with entries**:
   - Year 2026 with entries on Jan 1 (ontime), Jan 2 (backfill), Jul 31 (ontime),
     today = `'2026-07-31'`
   - Jan 1 cell: state `'ontime'`, Jan 2: `'backfill'`, Jan 3: `'empty'`,
     Aug 1: `'future'`, Jul 31: `'ontime'` with today ring semantics

7. **Year with no entries at all**:
   - All in-year cells where date ≤ today have state `'empty'`,
     all where date > today have state `'future'`

8. **Future year clamping**:
   - `isValidYear('2099')` returns `null`
   - `isValidYear('abcd')` returns `null`
   - `isValidYear('2026')` returns `2026` (assuming current year is 2026)
   - `isValidYear('2019')` returns `null` (below 2020)
   - `isValidYear(undefined)` returns `null`

### monthLabelOffsets fixtures

9. **Year 2026** (Jan 1 = Thursday):
   - Returns 12 items
   - First item (Jan): weekIndex = 0 (Jan 1 is in the first week column)
   - Items are in ascending weekIndex order
   - No two months share the same weekIndex

10. **Year 2024** (Jan 1 = Monday):
    - First item (Jan): weekIndex = 0
    - Verify at least Feb, Jun, Dec offsets are reasonable
      (Feb weekIndex ≈ 4–5, Jun ≈ 22, Dec ≈ 48)

### yearStats / monthStats fixtures

11. **yearStats** with mixed entries across years:
    - Entries: `['2026-01-01', '2026-06-15', '2025-12-31']`
    - `yearStats(entries, 2026)` → `{ entries: 2, words: sum of those two }`
    - `yearStats(entries, 2025)` → `{ entries: 1, words: ... }`
    - `yearStats(entries, 2023)` → `{ entries: 0, words: 0 }`

12. **monthStats**:
    - `monthStats(entries, '2026-01')` with one entry in Jan →
      `{ daysInMonth: 31, entries: 1 }`
    - `monthStats([], '2024-02')` → `{ daysInMonth: 29, entries: 0 }` (leap)
    - `monthStats([], '2026-02')` → `{ daysInMonth: 28, entries: 0 }` (non-leap)

## Component Architecture

### `HeatmapCard.tsx` — server component

The outer card with white background, border, rounded corners. Receives props:

```ts
type Props = {
  mode: 'year' | 'month'
  // Year mode
  yearGrid: YearCell[][]
  yearLabelOffsets: { month: number; weekIndex: number }[]
  year: number
  currentYear: number
  yearEntries: number
  yearWords: number
  // Month mode
  monthGrid: MonthCell[][]    // reuse existing buildMonthGrid
  monthStr: string            // 'YYYY-MM'
  today: string
  monthDays: number
  monthEntries: number
  // Shared
  canGoPrevMonth: boolean
  canGoNextMonth: boolean
}
```

Renders:
- Header row: title + subtitle (left), toggle + nav (right)
- Conditional: year grid or month grid
- Legend row

### `HeatmapYearGrid.tsx` — server component

Renders the year heatmap: weekday labels on the left, month labels along top,
grid of small coloured squares. Cells with `inYear: false` are transparent.
Cells with `state !== 'future'` are `<Link href={/diary/${date}}>`.
Today cell gets `ring-1 ring-amber-500`.

Mobile: `overflow-x-auto` for horizontal scroll (existing pattern).

### `HeatmapMonthGrid.tsx` — server component

Renders the month calendar with large cells. DOW headers: MON TUE WED THU FRI
SAT SUN. Each cell shows:
- Day number (top-left, bold)
- Word count `Nw` or em dash (bottom-left)
- Mood dot (small circle, same colours as existing MonthCalendar):
  happy = `bg-amber-400`, sad = `bg-blue-400`, normal/null = hidden

Cells with `!inMonth` are transparent padding. Cells with
`state !== 'future'` and `inMonth` are `<Link>`.

### `MonthDropdown.tsx` — `'use client'` component

Tiny client component wrapping a `<select>` for month jumping. On change,
navigates to `/?hview=month&hm=YYYY-MM`. This is the ONLY client component
in the heatmap card (toggle and ‹/› are plain `<Link>` elements).

```ts
type Props = {
  currentMonthStr: string   // 'YYYY-MM' — selected value
  options: { value: string; label: string; disabled: boolean }[]
}
```

### Files deleted after verification

- `src/components/MonthCalendar.tsx` — replaced by HeatmapMonthGrid inside
  HeatmapCard
- `src/components/HeatmapGrid.tsx` — replaced by HeatmapYearGrid inside
  HeatmapCard
- Remove `buildHeatmapWeeks` call from `page.tsx` (function stays in
  `streaks.ts` with its tests)
- Remove `?month=` param handling from `page.tsx`

## Steps

### Step 0: Pure functions + tests (no UI yet)

0a. Add `YearCell` type, `buildYearGrid`, `monthLabelOffsets`, `yearStats`,
    `monthStats`, `isValidYear` to `src/lib/calendar.ts`.

0b. Append all fixtures (items 1–12 above) to `scripts/test_calendar.mjs`.

0c. Run `node scripts/test_calendar.mjs` — all new + existing assertions pass.

### Step 1: Year mode in HeatmapCard (additive — old components still present)

1a. Create `src/components/HeatmapYearGrid.tsx`.

1b. Create `src/components/HeatmapCard.tsx` (year mode only for now).

1c. In `page.tsx`: parse `?hview` and `?y` params, call `buildYearGrid` +
    `monthLabelOffsets` + `yearStats`, render `<HeatmapCard>` ABOVE the existing
    `<HeatmapGrid>` + `<MonthCalendar>` (temporarily showing both old and new).

1d. Verify year mode renders correctly. Verify existing heatmap and month
    calendar still render below (safety net). Run `npm run build`.

### Step 2: Month mode in HeatmapCard

2a. Create `src/components/HeatmapMonthGrid.tsx` (large cells with mood dots +
    word counts).

2b. Create `src/components/MonthDropdown.tsx` ('use client').

2c. Wire month mode into `HeatmapCard`: toggle, month navigation, dropdown.

2d. In `page.tsx`: parse `?hm` param, call `buildMonthGrid` + `monthStats`,
    pass month-mode props to `<HeatmapCard>`.

2e. Verify month mode works: navigation, dropdown, mood dots, word counts,
    cell states, links.

### Step 3: Delete old components + clean up

3a. Remove `<HeatmapGrid>` and `<MonthCalendar>` from `page.tsx`.
    Remove their imports. Remove `buildHeatmapWeeks` call. Remove old `?month=`
    param handling.

3b. Delete `src/components/HeatmapGrid.tsx`.

3c. Delete `src/components/MonthCalendar.tsx`.

3d. Run `node scripts/test_calendar.mjs`, `node scripts/test_streaks.mjs`,
    `npm run build` — all pass.

### Step 4: Responsive + visual verification

4a. Verify at 1920px, 1440px, 390px:
    - Year mode on phone: horizontal scroll, cells legible
    - Month mode on phone: large cells, day number + mood dot always visible,
      word count shrinks if it would wrap

4b. Screenshots at three widths for both modes (6 screenshots total).

## Definition of Done

- [ ] `node scripts/test_calendar.mjs` — all existing (42) + new assertions pass
- [ ] `node scripts/test_streaks.mjs` — 32/32 (no regression)
- [ ] `node scripts/test_dates.mjs` — 20/21 or 21/21 (pre-existing flaky OK)
- [ ] `npm run build` — clean, no warnings
- [ ] Year mode: header "2026 · full year", subtitle with week count, ‹/› nav,
      month labels along top, weekday labels on left, 4 cell states + today ring,
      cells link to `/diary/[date]`
- [ ] Month mode: header "July 2026", subtitle "31 days · N entries logged",
      ‹/› nav, dropdown jumps to any month, large cells with day number + word
      count + mood dot, 4 cell states + today ring, cells link to `/diary/[date]`
- [ ] Toggle switches between Year and Month via URL params
- [ ] URL `?hview=year&y=2025` shows 2025; `?hview=month&hm=2026-05` shows May;
      garbage values fall back to current year in year mode
- [ ] `MonthCalendar.tsx` and `HeatmapGrid.tsx` deleted — no duplicate views
- [ ] StatsBar unchanged — shows all-time metrics regardless of heatmap view
- [ ] No new npm packages
- [ ] Cell colours: on-time = `emerald-500`, backfill = `emerald-300`,
      empty = `stone-200`, future = `stone-100 opacity-40`, today = amber ring.
      Word count is TEXT, never colour intensity.
- [ ] Responsive: year mode scrolls horizontally on mobile; month mode shows
      large cells with day + mood dot prioritised over word count
- [ ] Screenshots at 1920px, 1440px, 390px for both modes

## Handoff Obligations

1. Write `memory/phase_09_report.md`.
2. Overwrite `memory/STATE.md` entirely.
3. Update `memory/discoveries.md` if any Moderate/Major findings.
4. In the report, list every DoD item with actual verification status.
