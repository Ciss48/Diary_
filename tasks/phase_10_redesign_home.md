# Phase 10 — Session 1: Design System Foundation + Home Page Redesign

## Context Recap

Phases 1–9 complete. The app works end-to-end: auth, entries with autosave,
calendar heatmap (year + month views), AI suggestions, photos. The current UI
uses default Tailwind stone/emerald palette with no design system — functional
but plain.

The reference design ("Ink & Almanac") in `docs/design/DiaryInkAlmanac.jsx`
defines a warm, paper-textured aesthetic with serif typography, CSS custom
properties for light/dark mode, and subtle motion. This session applies that
design to the global foundation and the home page only.

**Stack:** Tailwind CSS v4 (PostCSS plugin, no `tailwind.config.*` — theme
extension via `@theme inline` in `globals.css`). No external UI libs.

**Hard constraint:** `src/lib/` is frozen. All test scripts must pass unchanged.

## Goal

Replace the current home page with the Ink & Almanac design:
- Global design tokens as CSS custom properties (light + dark via `[data-theme]`)
- Fonts: Literata (serif), Instrument Sans (body), Space Grotesk (mono/numbers)
- Paper grain texture overlay
- StatsBar: single card with wax spine, hairline dividers, 4 stat columns
- HeatmapCard: grain background, year/month views with new palette
- "Write today's entry" CTA button in wax red
- Dark mode toggle and `[data-theme]` attribute on `<html>`
- Motivational tagline below CTA

## Non-goals

- Do NOT touch diary entry page, suggestion panes, or photo strip (session 2)
- Do NOT modify anything in `src/lib/`
- Do NOT add animation libraries, UI kits, or state management libs
- Do NOT create new Supabase tables or migrations
- Do NOT add features beyond what the mockup shows

## Interface Contract

### Data flow (unchanged)
- `page.tsx` fetches entries via Supabase, calls `computeStats()`, `buildYearGrid()`,
  `buildMonthGrid()`, passes data to components as props
- Component prop interfaces (`Stats`, `YearCell[][]`, `MonthCell[][]`) stay identical
- URL params (`hview`, `y`, `hm`) stay identical

### New additions
- CSS custom properties in `globals.css` (design tokens)
- Google Fonts loaded in `layout.tsx` via `next/font/google` for Literata and
  Instrument Sans; Space Grotesk via `next/font/google` as well
- `[data-theme="dark"]` attribute on `<html>` element, toggled by a client
  component `ThemeToggle`
- Theme persistence in `localStorage` (no server round-trip)

## Steps

### Step 1: Design tokens + globals.css

Rewrite `globals.css` to define all CSS custom properties from the reference:

**Light (`:root`):**
- `--paper: #f6f1e7`, `--paper-2: #efe8da`, `--card: #fffdf8`, `--deckle: #e8dfcd`
- `--ink: #23201c`, `--ink-2: #5a5346`, `--ink-3: #8a7f6d`
- `--wax: #9c3b2c`, `--wax-soft: #f0dcd6`
- `--leaf: #4f7b58`, `--leaf-deep: #2f4a37`, `--leaf-soft: #dfe8e0`
- `--brass: #c9a227`, `--brass-soft: #f3e7c4`
- `--line: rgba(35,32,28,.11)`, `--line-2: rgba(35,32,28,.2)`
- `--empty: #e4dccc`, `--future: rgba(35,32,28,.045)`
- Shadows: `--shadow-1`, `--shadow-2`, `--shadow-3`
- `--grain`: fractal noise SVG data URI (opacity 0.05)

**Dark (`[data-theme="dark"]`):**
- All tokens reassigned per reference dark palette

**Tailwind v4 theme extension (`@theme inline`):**
- Map tokens to Tailwind: `--color-paper: var(--paper)`, etc.
- Font families: `--font-serif`, `--font-sans`, `--font-mono`

**Utility classes (plain CSS):**
- `.hv-lift`, `.hv-cell`, `.hv-day`, `.hv-out` — hover transforms
- `@keyframes riseIn`, `@keyframes unroll` — enter animations
- `.an-rise`, `.an-unroll` — animation classes
- `@media (prefers-reduced-motion: reduce)` — kill all animation/transition

### Step 2: Font loading in layout.tsx

Replace Geist with three fonts via `next/font/google`:
- **Literata** (serif) — weights 400, 500, 600; italic 400; optical size 7–72
- **Instrument Sans** — weights 400, 500, 600
- **Space Grotesk** — weights 400, 500, 700

Apply CSS variable classes to `<html>`. Update `<body>` to use `font-sans`
(Instrument Sans). Set `color: var(--ink)` and `background: var(--paper)`.

The `<html>` element needs a `data-theme` attribute. Default to light; a client
component will read `localStorage` and set it on mount.

### Step 3: ThemeToggle client component

Small client component: reads `localStorage('diary-theme')` on mount, sets
`document.documentElement.dataset.theme`. Toggle button renders ☾/☀ with the
same style as the reference (border, rounded, small text).

### Step 4: StatsBar redesign

Rewrite `StatsBar.tsx` to match the mockup:
- Single card with rounded corners, `bg-card`, `border border-line`
- Absolute-positioned wax spine (5px wide, left edge, `bg-wax`)
- 4-column grid (2-col on mobile) separated by hairline `bg-line` gap
- Each cell: label (uppercase, small, `color-ink-3`), big number (mono font,
  large, tight tracking), subtitle line (serif italic, `color-ink-3`)
- Current streak cell: number in wax red, "days" label in serif italic,
  7-bead trail showing last 7 days
- Longest streak: date range subtitle
- Total entries: "since Sep 2025" subtitle
- Total words: "≈ a short novel" subtitle

**Props change:** The `Stats` type stays the same. Extra display info (like
"since Sep 2025") is derived from available data or hardcoded as appropriate
for now (the start date can be computed from the earliest entry).

### Step 5: HeatmapCard redesign

Rewrite `HeatmapCard.tsx` to match:
- Grain overlay (`backgroundImage: var(--grain)`)
- Title in serif: "2026 in full" for year, "Month Year" for month
- Subtitle in serif italic
- Year/Month toggle: segmented control with `bg-paper-2` track
- Nav arrows: `border border-line-2`, rounded, hover effect `.hv-out`
- Month dropdown keeps the same `<select>` approach

**Year grid cells:**
- `bg-leaf` for on-time, `repeating-linear-gradient(135deg, var(--leaf)…)` for
  backfilled (hatched pattern), `bg-empty` for no entry, dashed border for future
- Today cell: `box-shadow: 0 0 0 2px var(--brass)` (brass ring)
- Hover: `scale(1.4)` via `.hv-cell`

**Month grid cells:**
- Rounded-lg, padding, flex column between day number and word count
- Mood dot: top-right corner, `bg-brass` for happy, `bg-[#f3f7f3]`/`bg-ink-3`
  for normal (light/dark aware), transparent border ring for sad
- Day number in mono font, word count text below
- On-time cells: green bg, white text. Backfill: hatched pattern.
  Empty: `bg-empty`. Future: dashed border, low opacity.
- Hover: `.hv-day` translateY(-3px) + shadow

**Legend row:**
- Border-top separator
- Same keys: No entry, Written on time, Backfilled, Future, Today ring
- Mood dots: happy, normal, sad — with separator line

### Step 6: Page shell (page.tsx)

Update `page.tsx`:
- Header: "Diary" in serif + date label (uppercase, small) + greeting
- Sign out link (not button)
- CTA: "Write today's entry" button in `bg-wax`, white text, rounded, shadow,
  `.hv-lift` hover
- Motivational tagline: serif italic, ink-3 color
- Max width ~1500px on desktop, tighter on mobile
- Background: `bg-paper` with grain overlay

### Step 7: Verify

- Run all 6 test scripts
- Run `npm run build`
- Visual check at 1920px, 1440px, 390px in light and dark mode

## Expensive / Awkward Effects — Decision Needed

1. **Grain texture overlay**: A fractal noise SVG as a CSS `background-image`
   data URI. Cheap — pure CSS, no runtime cost. **Recommend: include.**

2. **Hatched pattern for backfilled cells**: `repeating-linear-gradient(135deg,
   var(--leaf) 0 3px, var(--leaf-deep) 3px 6px)`. Pure CSS. Clearly
   distinguishes backfill from on-time, which INVARIANTS.md requires.
   **Recommend: include.**

3. **Enter animations (riseIn, unroll)**: Simple CSS keyframe animations that
   fire once on mount. Very cheap. Disabled by `prefers-reduced-motion`.
   **Recommend: include.**

4. **Mood dot on month cells**: The "normal" mood dot in the mockup renders as
   a filled light dot (light mode) or a filled muted dot (dark mode). "Sad"
   renders as a hollow circle with a border. This is achievable with conditional
   styling. **Recommend: include.**

5. **Google Fonts (3 families)**: Adds ~60-80KB total (woff2, variable fonts).
   `next/font/google` handles self-hosting and font-display: swap automatically.
   **Recommend: include.** Literata is essential for the design's character.

6. **7-bead trail in streak stat**: Shows last 7 days' status as small colored
   squares. Requires passing `entries` + `today` to `StatsBar` (or computing
   the beads in `page.tsx`). Small extra data, no new queries.
   **Recommend: include — compute beads in page.tsx, pass as prop.**

Nothing in the home page mockup is expensive to implement. No lightbox, no
drag-and-drop, no scroll-linked animations.

## Definition of Done

### From INVARIANTS.md — Data

- [ ] No code path writes `corrected_version` into `entries.content`
- [ ] `is_backfill` only set once at INSERT, no blind upsert
- [ ] All "today" calculations go through `profiles.timezone`
- [ ] No AI env var has `NEXT_PUBLIC_` prefix
- [ ] No `dangerouslySetInnerHTML` anywhere

### From INVARIANTS.md — Visual meaning

- [ ] Four cell states visually distinct: no entry / on-time / backfilled / future
- [ ] Backfilled clearly different from on-time (hatched pattern vs solid green)
- [ ] Today cell has distinct marker (brass ring)
- [ ] Mood dot present on month cells: happy/sad visible, does not drown cell state
- [ ] Word count rendered as text, never as colour intensity
- [ ] Green always means "written on time", never "wrote more words"
- [ ] Day with photos but no text stays unlit, doesn't count
- [ ] Week starts Monday (labels MON–SUN) on both year and month grids

### From INVARIANTS.md — Behaviour

- [ ] Autosave debounce 1500ms + blur (unchanged — not touching editor)
- [ ] Word count updates realtime (unchanged)
- [ ] Future cells not clickable
- [ ] Click highlight → correct change item (unchanged — not touching suggestions)

### From INVARIANTS.md — Testing

- [ ] All test scripts pass unchanged (no fixture edits)
- [ ] `npm run build` clean
- [ ] No files in `src/lib/` modified

### From INVARIANTS.md — Manual checks

- [ ] Resize 1920px → 360px: nothing cut off or overlapping
- [ ] `prefers-reduced-motion` respected (all animation/transition killed)

### Redesign-specific

- [ ] Dark mode toggle works, persists across page loads
- [ ] Light and dark modes match reference PNGs
- [ ] Grain texture visible in both modes
- [ ] Fonts loaded (Literata, Instrument Sans, Space Grotesk)
- [ ] CTA button links to `/diary/{today}`
- [ ] Sign out still works

## Handoff Obligations

1. Update `memory/STATE.md` — mark Phase 10 session 1 complete
2. Write `memory/phase_10_report.md` with DoD status
3. Update `memory/discoveries.md` if any Moderate/Major findings
4. Session 2 scope: diary entry page, suggestion panes, photo strip —
   all using the same design tokens established here
