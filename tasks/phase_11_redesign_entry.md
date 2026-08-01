# Phase 11 — Session 2: Entry Page + Suggestion Panes Redesign

## Context

Phase 10 (session 1) established the Ink & Almanac design system: CSS custom
properties for light/dark mode, three Google Fonts (Literata, Instrument Sans,
Space Grotesk), grain texture, hover/animation utility classes, and Tailwind v4
theme extension via `@theme inline` in `globals.css`. The home page is fully
redesigned.

This session applies the same tokens and surfaces to the **diary entry page**:
the editor, header, photos, and all four suggestion states.

**Stack:** Tailwind CSS v4 (PostCSS, `@theme inline` in `globals.css`). No
external UI libs.

**Hard constraint:** `src/lib/` is frozen. All test scripts pass unchanged.

## Scope

### Components to redesign (presentation only)

| Component | File | Role |
|-----------|------|------|
| DiaryEditor | `src/components/DiaryEditor.tsx` | Main entry page: header, textarea/paper, layout, footer |
| MoodPicker | `src/components/MoodPicker.tsx` | Mood selection circles |
| SuggestionPanel | `src/components/SuggestionPanel.tsx` | Trigger button + counter + loading/error states |
| ImprovedVersionPane | `src/components/ImprovedVersionPane.tsx` | Right pane: highlighted improved text + copy |
| SuggestionDetails | `src/components/SuggestionDetails.tsx` | Change list cards + feedback card |
| PhotoStrip | `src/components/PhotoStrip.tsx` | Photo frames, empty slots, lightbox |

### NOT in scope

- `src/lib/` — frozen, no modifications
- `src/app/diary/[date]/page.tsx` — server component, no visual changes needed
- Home page components — done in Phase 10
- New features, new Supabase tables, new API routes
- State management, data flow, or business logic changes

## Design Reference

### Entry screen (`design_write_entry.png`)
- **Header:** serif date title (Literata), BACKFILLED badge in wax-soft/wax
  colours, mood picker with brass ring on selected, save indicator with leaf
  pulse dot, "← Home" link in ink-3
- **Paper surface:** `bg-card` with grain overlay, 4px wax spine on left,
  thin wax vertical rule at ~30px, textarea with serif font (Literata),
  caret colour wax, no visible border — the card's border handles it
- **Empty state:** serif italic prompt + three dashed-border pill buttons
  for writing prompts (per reference JSX)
- **Photos:** tilted polaroid frames with `bg-card`, caption + time in serif/mono,
  empty slots with dashed border and "Drop a photo / browse files" text
- **Footer area:** "Suggest better English" button in `bg-ink text-paper`,
  counter text in ink-3, word count in mono font ink-3

### Suggestion screen (`design_suggestion_1.png`, `design_suggestion_2.png`)
- **Two-column layout:** equal fixed-height panes, both with paper surface
  (wax spine on left pane, leaf spine on right pane), grain overlay,
  serif text, independent scroll
- **Left pane header:** "YOUR ENTRY" label in ink-3, word count in mono
- **Right pane header:** "TUTOR'S COPY" label in leaf green, note count pill
  in leaf-soft/leaf, × dismiss button
- **Highlights on right pane:** `bg-leaf-soft` default, `bg-brass-soft` with
  brass ring when selected, no horizontal padding (use box-shadow bleed
  like reference JSX)
- **Copy footer:** bottom bar with `bg-paper-2`, serif italic message,
  "Copy" button with `border-line-2`
- **Change list:** 2-column grid on desktop, cards with `bg-card border-line`,
  left wax-spine accent when selected (`bg-brass-soft border-brass`),
  strikethrough original in ink-3 with wax-coloured line-through,
  arrow → corrected in serif bold, type chip (grammar=wax, vocabulary=brass,
  style=leaf, spelling=paper-2/ink-2) positioned right with `margin-left: auto`,
  explanation text below
- **Feedback card:** `bg-card` with grain, brass spine, "A NOTE FROM YOUR TUTOR"
  label with hairline separator, serif body text max-width ~78ch,
  "— see you tomorrow, same page" closing in serif italic ink-3

### Loading state
- Leaf pulse dot + "Reading your entry…" in serif italic
- Skeleton bars with sweep animation (nib-sweep: translateX shimmer)
- Bars unmounted when status !== loading (no continuous animation on write screen)

### Error state
- "The note came back blank." in serif, wax colour
- Explanation text in ink-3
- "Try again" button with wax border

### Idle state (no suggestion yet)
- Serif italic prompt: "When you're done writing, I'll read it and leave
  notes in the margin."
- "Suggest better English" button in `bg-ink text-paper`

### Dark mode
All of the above adapts automatically via CSS custom properties. No component
changes needed — the tokens handle dark mode.

## Steps

### Step 1: Add missing CSS utilities to globals.css

Add to `globals.css`:
- `.hv-photo` — photo hover: transition transform 320ms, on hover rotate(0deg)
  scale(1.05) + shadow-3
- `@keyframes inkPulse` — opacity 0.35→0.9→0.35 (2.4s)
- `@keyframes nibSweep` — translateX(-100%) → translateX(320%) (1.6s linear)
- `.an-pulse` — applies inkPulse
- `.an-sweep` — applies nibSweep

### Step 2: MoodPicker redesign

Restyle to match reference: circular buttons with border-line-2, selected gets
`bg-brass-soft border-brass` with slight scale(1.06), glyphs ☀/◐/☂ for
happy/normal/sad. Size ~34px, serif glyph.

### Step 3: DiaryEditor redesign

Major visual overhaul:
- **Loading state:** paper background, serif loading text
- **Outer wrapper:** `bg-paper` with grain (inherits from body)
- **Header:** serif date (Literata, 24px mobile / 31px desktop), BACKFILLED
  badge in wax colours (small caps, border, rounded-full), mood picker,
  save indicator (leaf pulse dot + "Saved · just now"), "← Home" link
- **Paper textarea surface:** rounded card, `bg-card` with grain overlay,
  wax spine (absolute, 4px wide, left), wax margin rule (absolute, 1px,
  ~30px from left, 22% opacity), textarea with no border/ring, serif font,
  wax caret, padding left of margin rule
- **Empty state overlay:** centered serif italic prompt + three dashed pill
  prompt buttons
- **Two-column mode:** grid with fixed height (`md:h-[60vh] md:min-h-[400px]`),
  `overflow-hidden`, both children `min-h-0`. Left pane gets wax spine,
  right pane gets leaf spine via ImprovedVersionPane.
- **Footer:** word count in mono ink-3, save status (pulse dot for saved,
  wax text for error)

**Critical:** preserve all `min-h-0` on flex/grid children (the overflow fix
from Phase 04 third addendum). Preserve autosave debounce 1500ms + onBlur.

### Step 4: ImprovedVersionPane redesign

- Paper surface: `bg-card` with grain, leaf spine (4px, absolute left),
  rounded card with border-line
- Header: "TUTOR'S COPY" in leaf-coloured label, note count pill in
  leaf-soft/leaf, × close button
- Highlights: `bg-leaf-soft` default with leaf-soft box-shadow bleed,
  `bg-brass-soft` with brass ring when selected. **No horizontal padding
  on marks** — use box-shadow to create visual bleed (prevents space between
  corrected word and punctuation).
- Copy footer: `bg-paper-2` bottom bar, serif italic note, Copy button with
  `border-line-2 bg-card`
- Scrollbar: thin, styled to match paper aesthetic
- Paragraph breaks: structural `<p>` tags, not white-space: pre-wrap
  (split corrected text on \n\n)

### Step 5: SuggestionPanel redesign

Four states, all in paper aesthetic:
- **Idle (no suggestion visible):** "Suggest better English" in `bg-ink text-paper`
  rounded-[10px], counter in ink-3
- **Loading:** leaf pulse dot + serif italic "Reading your entry…" + skeleton
  bars with nib-sweep. Skeleton bars unmounted when not loading.
- **Error:** "The note came back blank." in serif wax, explanation in ink-3,
  "Try again" button with wax border
- **Has suggestion:** just the trigger button + counter (details shown in
  SuggestionDetails)

### Step 6: SuggestionDetails redesign

- **Drift warning:** brass-soft bg, brass border, brass text
- **"MARGIN NOTES" header:** label in ink-3, serif italic subtitle
  "tap a highlight above to jump here"
- **Change list:** 2-column grid (md:grid-cols-2), cards with `bg-card
  border-line rounded-[11px]` padding, left accent spine (3px, brass when
  selected, transparent when not). Selected: `bg-brass-soft border-brass
  shadow-2`. Strikethrough original text with `text-decoration-color: var(--wax)`.
  Type chip: small caps, rounded-full, coloured per type:
  - grammar → wax-soft/wax
  - vocabulary → brass-soft/brass
  - style → leaf-soft/leaf
  - spelling → paper-2/ink-2
  Explanation in ink-2, 13px, leading-relaxed.
- **Feedback card:** `bg-card` with grain overlay, brass spine (4px left),
  "A NOTE FROM YOUR TUTOR" label + hairline separator, serif body text
  16px leading-[1.72] max-w-[78ch], closing "— see you tomorrow, same page"
  in serif italic ink-3.

### Step 7: PhotoStrip redesign

- **Filled card:** `bg-card` padding ~10px, rounded-[3px], shadow-2,
  deterministic tilt (unchanged — uses `photoAngle` from lib),
  hover straighten + scale(1.05) + shadow-3 via `.hv-photo` class.
  Caption in serif 13px ink-3, time in mono. Delete button
  (existing ×, restyle to match).
- **Empty slot:** `bg-card` padding, dashed border-line-2, serif italic
  "Drop a photo" + "or browse files" link in wax. Height matches filled cards.
- **Lightbox:** keep all existing functionality (backdrop close, × close,
  Escape close, caption/time editing, delete). Restyle inputs/buttons to
  use paper tokens.
- **Mobile strip:** horizontal scroll, same card styling, snap scroll.

### Step 8: Verify

- Run all test scripts (`test_dates.mjs`, `test_streaks.mjs`,
  `test_suggestions.mjs`, `test_calendar.mjs`)
- Run `npm run build`
- Visual check at 1920px, 1440px, 390px in light and dark
- Walk through INVARIANTS checklist

## Non-goals

- Do NOT modify anything in `src/lib/`
- Do NOT add animation libraries, UI kits, or state management libs
- Do NOT create new Supabase tables or migrations
- Do NOT add features beyond the existing spec
- Do NOT add an "Apply" or "Use this version" button — Copy only
- Do NOT change autosave logic (1500ms debounce + onBlur)
- Do NOT use `Math.random()` for photo angles
- Do NOT add continuously-running animations to the write screen
- Do NOT use `dangerouslySetInnerHTML`
- Do NOT use `white-space: pre-wrap` for the improved version pane
  (use structural paragraph breaks)

## Definition of Done

### From INVARIANTS.md — Data

- [ ] No code path writes `corrected_version` into `entries.content`
- [ ] `is_backfill` only set once at INSERT, no blind upsert
- [ ] All "today" calculations go through `profiles.timezone`
- [ ] No AI env var has `NEXT_PUBLIC_` prefix
- [ ] No `dangerouslySetInnerHTML` anywhere

### From INVARIANTS.md — Visual meaning

- [ ] Four cell states visually distinct (not directly visible on entry page,
      but verify no regression on home)
- [ ] Backfill badge clearly present on entry page when applicable
- [ ] Word count rendered as text, not colour intensity
- [ ] Day with photos but no text → doesn't count (unchanged logic)

### From INVARIANTS.md — Behaviour

- [ ] Autosave debounce 1500ms + blur, with status indicator, no Save button
- [ ] Word count updates realtime when typing
- [ ] Two panes same fixed height, scroll independently
- [ ] Every flex/grid child in the two-column chain has `min-h-0`
      (the Phase 04 overflow fix)
- [ ] Photo tilt angles deterministic from `photo.id` — no `Math.random()`
- [ ] No continuously-running animation on the write screen
- [ ] Click highlight → selects correct change-list item
- [ ] Lightbox closes via backdrop click, × button, and Escape key
- [ ] Caption and time editable in lightbox
- [ ] Drag-and-drop upload into empty slots works
- [ ] 4-photo cap enforced
- [ ] "N suggestions left today" counter present and correct
- [ ] Future dates not reachable (server redirect — unchanged)

### From INVARIANTS.md — Testing

- [ ] All test scripts pass unchanged (no fixture edits)
- [ ] `npm run build` clean
- [ ] No files in `src/lib/` modified

### From INVARIANTS.md — Manual checks

- [ ] Resize 1920px → 360px: nothing cut off or overlapping
- [ ] `prefers-reduced-motion` respected

### Redesign-specific

- [ ] Entry page uses Ink & Almanac tokens consistently (paper, ink, wax, leaf,
      brass, serif, mono)
- [ ] Dark mode works correctly on all entry page components
- [ ] Paper surface with grain overlay on textarea and improved version pane
- [ ] Wax spine on left pane, leaf spine on right pane
- [ ] Four suggestion states rendered correctly: idle, loading, error, result
- [ ] Change list type chips use correct colours per reference
      (grammar=wax, vocabulary=brass, style=leaf, spelling=paper-2)
- [ ] Feedback card has brass spine, grain texture, serif text
- [ ] Photo frames match reference polaroid style
- [ ] Loading skeleton has nib-sweep animation, unmounted when not loading
- [ ] Copy is the ONLY action on the improved version (no Apply/Use button)

## Handoff Obligations

1. Update `memory/STATE.md` — mark Phase 11 complete
2. Write `memory/phase_11_report.md` with DoD status
3. Update `memory/discoveries.md` if any Moderate/Major findings
