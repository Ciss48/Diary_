# Design Brief: Diary — Learn English by Journaling

## Product summary

Diary is a web app that helps people improve their English by writing a short
diary entry every day. Two motivational engines work together:

1. **Discipline** — a GitHub-style calendar heatmap on the home screen shows which
   days you wrote. Streaks make you come back.
2. **Learning** — after writing, an AI suggests a better English version of your
   entry, shown side-by-side with inline highlights and personalized feedback.

Target users: Vietnamese learners of English (UI text stays in English — it is
part of the immersion). Primary device split is roughly 50/50 desktop/mobile, so
every screen needs a proper mobile layout, not an afterthought.

## Brand feel

- **Warm, analog, paper-like.** The writing surface should feel like a real
  notebook page: cream/off-white paper, subtle texture or ruled lines, ink-dark
  text. Avoid cold SaaS dashboard aesthetics.
- Typography: a readable serif (e.g. Lora, Crimson Pro, Source Serif) for diary
  content; a clean sans (e.g. Inter) for UI chrome. Generous line height in the
  editor.
- Accent palette: warm green or amber for the heatmap "written" states; a soft
  red/coral only for destructive actions. Dark ink (#2b2620-ish) instead of pure
  black.
- Micro-delights welcome (page-turn feel, gentle transitions) but performance and
  clarity first.

## Screens to design

### 1. Login
- Minimal: logo/wordmark "Diary", one-line value proposition ("Write a little
  English every day"), single button **Continue with Google**.
- A tasteful illustration or paper texture is enough. No email/password form —
  Google OAuth only.

### 2. Home — Calendar heatmap
- Hero element: a **year heatmap** (GitHub contribution style, 7 rows × ~53
  columns) OR a month-grid calendar with heatmap coloring — propose what works
  best responsively; on mobile a scrollable month view is acceptable.
- Cell states (design a legend for these):
  - **Empty** — day with no entry (subtle paper-gray).
  - **Written on time** — full accent color.
  - **Backfilled** — the entry was written after that day passed: visibly
    lighter shade and/or dashed border. It still counts as "written" but must be
    distinguishable at a glance (streaks only count on-time days).
  - **Today** — outlined/ringed so it pops.
- Stats bar above or beside the heatmap: **Current streak**, **Longest streak**,
  **Total entries**, **Total words written**. Small, warm, not gamified-loud.
- Clicking any non-future day navigates to that day's diary page. Future days
  are visually disabled.
- Header: small avatar + display name from Google, sign-out affordance.

### 3. Diary editor (one day = one page)
- Looks like an open notebook page. Date as a handwritten-style or elegant serif
  header (e.g. "Thursday, July 9, 2026"). If the day is being backfilled, show a
  quiet "backfilled" tag near the date.
- Large writing area (plain text, no rich-text toolbar), ruled-line feel,
  live **word count** in a corner.
- Save behavior: autosave indicator ("Saved just now" / "Saving…") rather than a
  loud save button.
- **Photo strip**: a row (bottom or side) of small photo thumbnails for that
  day's memories + an "add photo" tile. Max 4 photos. Tapping a photo opens it
  larger. (Design the slots now; the feature ships in a later phase.)
- Primary action button: **"Suggest better English"** — visible but not covering
  the writing area. Disabled state when the entry is empty.

### 4. AI suggestion view
Appears after pressing "Suggest better English" (below the entry or as an
expanded section — your call):
- **Side-by-side comparison** (stacked vertically on mobile): left = "Your
  version", right = "Improved version".
- In the improved version, changed fragments are **highlighted** (e.g. soft
  amber background). Hover (desktop) / tap (mobile) on a highlight reveals a
  small popover: the original fragment, the correction, and a one-line
  explanation, plus a category chip (grammar / vocabulary / style / spelling).
- Below the comparison: a **Feedback card** — the AI's overall comments on the
  entry. Free-length prose, so design it to breathe at both 2 lines and 12
  lines. Warm "teacher's note in the margin" feel.
- Loading state: the AI takes 2–8 seconds — design a pleasant "thinking" state
  (e.g. a pen writing animation) and an error state with a retry action.
- A small counter such as "3 of 5 suggestions left today".

## States to include for every screen
Empty (new user, day with no entry), loading, error, and mobile layout.

## Deliverables requested
High-fidelity screens for the 4 pages above (desktop + mobile), the heatmap
cell-state legend, the highlight-popover component, and a small style-tokens
summary (colors, type scale, spacing) that a developer can reference.

## Out of scope (do not design)
Settings pages, onboarding tours, social/sharing features, notifications,
vocabulary bank (future phase), native app chrome.
