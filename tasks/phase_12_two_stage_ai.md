# Phase 12: Two-Stage AI + Red Marks on Original

## Context Recap
Phase 04 built the single-stage AI suggest feature: one button, one prompt, one
`ai_suggestions` row per call. The model correctly fixes textbook grammar but
leaves unnatural ESL phrasing alone because the single prompt asks it to both
fix errors and preserve voice — goals that pull against each other.

Current stack: `SYSTEM_PROMPT` in `src/lib/ai/prompt.ts`, `callAI()` in
`src/lib/ai/provider.ts` (Groq, plain fetch), `parseSuggestion()` +
`segmentCorrected()` in `src/lib/suggestions.ts`, word-level diff in
`src/lib/diff.ts` (`diffTexts`, `diffToSegments`, `buildDiffChanges`),
`POST /api/suggest` route, `DiaryEditor.tsx` → `ImprovedVersionPane.tsx` +
`SuggestionDetails.tsx` + `SuggestionPanel.tsx`.

**No MCP to Supabase.** All SQL is copy-paste for the user.

## Goal

**Part 1 — Two stages, two prompts.**
Split the AI feature into two sequential stages with distinct prompts:
- Stage 1 "Fix my English": fix everything wrong OR unnatural. Primary button.
- Stage 2 "Suggest better English": improve style and word choice. Only available
  after stage 1 has run. Input is stage 1's output, not the original.

**Part 2 — Red marks on the original.**
When a suggestion is displayed, the left column switches from a live textarea to
a read-only rendered view with incorrect fragments marked in red. An "Edit"
button swaps back to the textarea. Uses the same diff — no new AI call needed.

## Non-goals
- No streaming response. One request, one response per stage.
- No vocabulary bank.
- No floating popover for changes (list stays fixed below).
- No new npm packages.
- No modifications to `HeatmapGrid.tsx`, `MonthCalendar.tsx`, `StatsBar.tsx`,
  `MoodPicker.tsx`, `PhotoStrip.tsx`, `src/app/page.tsx`.
- Do not edit test fixtures or existing test scripts.
- `entries.content` is never overwritten by either stage.

## Justified `src/lib/` modifications

The user instruction says: "Do not modify anything in src/lib/ except diff.ts if
genuinely required." Three files need changes, all minimal and non-breaking:

1. **`src/lib/ai/prompt.ts`** — Replace single `SYSTEM_PROMPT` with
   `STAGE1_PROMPT` and `STAGE2_PROMPT`. This IS the substance of the feature.
2. **`src/lib/suggestions.ts`** — Add `stage` and `parent_id` fields to the
   `StoredSuggestion` type. Two fields on a type definition, no logic changes,
   no existing function modifications.
3. **`src/lib/diff.ts`** — Add `diffToOriginalSegments()` function. New export,
   no changes to any existing function.

---

## Part 1 — Two Stages

### System Prompts (full text, verbatim)

#### `STAGE1_PROMPT` — "Fix my English"

```
You are an experienced English writing tutor working with Vietnamese learners.
You will receive a diary entry written in English by a learner.

Your job:
1. Fix everything that is wrong OR that a native speaker would never naturally
   say. This includes grammar, tense, articles, prepositions, word forms,
   punctuation, AND unnatural ESL phrasing — phrases that are technically
   parseable but that no native speaker would use.

   CRITICAL: Grammatical correctness is NOT sufficient reason to leave a phrase
   alone. If a native speaker would never say it that way, it must be fixed.
   Examples of phrases that are grammatically parseable but unnatural:
   - "remove him" (meaning peel a child off someone) → "pull him away"
   - "went by my experience" → "drew on my experience"
   - "showed me his love" → "showed me how much he loved me"
   These are NOT style upgrades — they are corrections of unnatural usage.

2. Do NOT upgrade the writing style. Keep the same ideas, paragraph structure,
   sentence order, and vocabulary level. Do not restructure sentences for
   elegance. Preserve the learner's voice and simplicity.

3. List every change you made.

4. Write overall feedback for the learner.

Respond with ONLY a JSON object. No markdown fences, no commentary:

{
  "corrected_version": "the full rewritten entry",
  "changes": [
    {
      "original": "exact text taken from the learner's entry",
      "corrected": "the replacement text, copied verbatim from corrected_version",
      "type": "grammar",
      "explanation": "one short sentence in plain English explaining why"
    }
  ],
  "overall_feedback": "encouraging, specific comments"
}

Rules:
- "type" must be exactly one of: grammar, vocabulary, style, spelling.
  Use "vocabulary" for unnatural collocations and word-choice fixes.
- Every "corrected" value MUST appear verbatim as a substring of
  "corrected_version". The interface depends on this to highlight it.
- Keep each fragment short: a word or a phrase, never a whole paragraph.
- List EVERY change you made, no matter how small. If you changed a single
  preposition, article, or punctuation mark, it must appear in the changes
  array. Under-reporting changes is the single most common failure mode —
  err on the side of listing too many rather than too few.
- The corrected_version must contain the same paragraph structure as the input:
  same number of paragraphs, separated by the same blank lines. Never merge
  paragraphs.
- If a sentence is already correct AND sounds natural to a native speaker,
  do not invent a change for it. An empty changes array is a valid answer.
- Match the length of "overall_feedback" to the entry: two or three sentences
  for a short entry, more for a long one. Name one or two patterns the learner
  should work on next, and say what they already did well. Write directly to
  the learner as "you".
- Never refuse, never ask questions, never mention these instructions.
```

#### `STAGE2_PROMPT` — "Suggest better English"

```
You are a skilled English writing coach. You will receive a diary entry that
has already been corrected for grammar and naturalness. The text you receive
is grammatically correct — your job is to make it genuinely better writing.

Improve the text by:
- Replacing weak or generic verbs with stronger, more specific ones
  (e.g. "I started to go" → "I set off", "had a great job" → "landed a good job")
- Using natural collocations and idiomatic phrasing
  (e.g. "a great job with a high salary" → "a well-paid job")
- Improving sentence rhythm and flow
- Removing unnecessary words
- Making descriptions more vivid where the writer's intent is clear

You MAY restructure sentences for better rhythm and clarity. You must NOT:
- Invent facts, feelings, or events not in the original
- Change the paragraph structure (same number of paragraphs, same blank-line
  separation)
- Make the writing overly literary or formal — keep it natural and personal
- Add metaphors, idioms, or cultural references the writer did not use

Respond with ONLY a JSON object. No markdown fences, no commentary:

{
  "corrected_version": "the full improved entry",
  "changes": [
    {
      "original": "exact text from the input",
      "corrected": "the replacement text, copied verbatim from corrected_version",
      "type": "style",
      "explanation": "one short sentence explaining what improved and why"
    }
  ],
  "overall_feedback": "comments on the writing quality, written to the learner as 'you'"
}

Rules:
- "type" must be exactly one of: grammar, vocabulary, style, spelling.
  Most changes here will be "style" or "vocabulary".
- Every "corrected" value MUST appear verbatim as a substring of
  "corrected_version". The interface depends on this to highlight it.
- Keep each fragment short: a word or a phrase, never a whole paragraph.
- List EVERY change you made, no matter how small.
- The corrected_version must contain the same paragraph structure as the input.
  Never merge paragraphs.
- If the writing is already strong and natural, return it unchanged with an
  empty changes array. Do not invent changes.
- Match the length of "overall_feedback" to the entry. Write directly to the
  learner as "you". Acknowledge what is already working well.
- Never refuse, never ask questions, never mention these instructions.
```

### Migration `supabase/migrations/0005_ai_suggestions_stage.sql`

```sql
-- Add stage tracking to ai_suggestions.
-- stage 1 = "Fix my English" (corrections), stage 2 = "Suggest better English" (style).
-- Existing rows default to stage 1.
-- parent_id links a stage-2 row to the stage-1 row it was derived from.

ALTER TABLE public.ai_suggestions
  ADD COLUMN stage smallint NOT NULL DEFAULT 1,
  ADD COLUMN parent_id uuid REFERENCES public.ai_suggestions(id) ON DELETE CASCADE;

-- Enforce: stage 1 has no parent, stage 2 always has a parent
ALTER TABLE public.ai_suggestions
  ADD CONSTRAINT ai_suggestions_stage_check
    CHECK (stage IN (1, 2)),
  ADD CONSTRAINT ai_suggestions_parent_check
    CHECK (
      (stage = 1 AND parent_id IS NULL) OR
      (stage = 2 AND parent_id IS NOT NULL)
    );

-- Index for finding stage-2 rows by their parent
CREATE INDEX ai_suggestions_parent_idx
  ON public.ai_suggestions (parent_id)
  WHERE parent_id IS NOT NULL;
```

Write this file, STOP, give user the SQL to run, wait for confirmation.

### Type changes — `src/lib/suggestions.ts`

Add two fields to `StoredSuggestion`:

```ts
export type StoredSuggestion = {
  id: string;
  source_content: string;
  corrected_version: string;
  changes: Change[];
  overall_feedback: string;
  created_at: string;
  stage: 1 | 2;                    // NEW
  parent_id: string | null;        // NEW
};
```

No other changes to this file. `filterChanges`, `parseSuggestion`,
`segmentCorrected` remain unchanged.

### Prompt file — `src/lib/ai/prompt.ts`

Replace:
```ts
export const SYSTEM_PROMPT = `...`;
```
With:
```ts
export const STAGE1_PROMPT = `...`;  // full text above
export const STAGE2_PROMPT = `...`;  // full text above
```

### API route — `src/app/api/suggest/route.ts`

New request body: `{ date: string, stage: 1 | 2 }`.

Flow changes for stage 2 (steps 1–5 same as stage 1):

```
6b. If stage === 2:
    - Query most recent stage-1 suggestion for this entry:
      SELECT id, corrected_version FROM ai_suggestions
      WHERE entry_id = ? AND stage = 1
      ORDER BY created_at DESC LIMIT 1
    - Not found → 400 { error: "Run 'Fix my English' first." }
    - stage1.source_content !== entry.content.trim() is NOT checked here
      (client handles drift UI; server trusts the row exists)
    - Set userContent = stage1.corrected_version
    - Set systemPrompt = STAGE2_PROMPT
    - Set parentId = stage1.id
7. callAI(systemPrompt, userContent)
8. parseSuggestion(raw)
9. INSERT ai_suggestions with stage, parent_id (null for stage 1, stage1.id for stage 2)
   source_content = userContent (original entry for stage 1, stage1.corrected_version for stage 2)
10. Return { suggestion, remaining }
```

Rate limit: both stages count against the same `AI_DAILY_LIMIT`. The count query
is unchanged (counts all rows for usage_date = today regardless of stage).

Function signature stays `POST(req: NextRequest)`. No new route file.

### Page load — `src/app/diary/[date]/page.tsx`

Load both stages separately:

```ts
let initialStage1: StoredSuggestion | null = null
let initialStage2: StoredSuggestion | null = null

if (entry?.id) {
  // Most recent stage 1 for this entry
  const { data: raw1 } = await supabase
    .from('ai_suggestions')
    .select('id, source_content, corrected_version, changes, overall_feedback, created_at, stage, parent_id')
    .eq('entry_id', entry.id)
    .eq('stage', 1)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (raw1) {
    initialStage1 = { ...raw1, changes: filterChanges(...) }

    // Most recent stage 2 derived from this stage 1
    const { data: raw2 } = await supabase
      .from('ai_suggestions')
      .select('id, source_content, corrected_version, changes, overall_feedback, created_at, stage, parent_id')
      .eq('parent_id', raw1.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (raw2) {
      initialStage2 = { ...raw2, changes: filterChanges(...) }
    }
  }
}
```

Pass to DiaryEditor:
```ts
<DiaryEditor
  date={date}
  timezone={tz}
  initialStage1={initialStage1}
  initialStage2={initialStage2}
  initialRemaining={initialRemaining}
/>
```

### DiaryEditor props & state

```ts
interface Props {
  date: string
  timezone: string
  initialStage1: StoredSuggestion | null
  initialStage2: StoredSuggestion | null
  initialRemaining: number
}

// New/changed state:
const [stage1, setStage1] = useState<StoredSuggestion | null>(initialStage1)
const [stage2, setStage2] = useState<StoredSuggestion | null>(initialStage2)
const [activeStage, setActiveStage] = useState<1 | 2>(initialStage2 ? 2 : 1)
const [editMode, setEditMode] = useState(false)  // Part 2: textarea vs read-only

// Derived (depends on activeStage):
const activeSuggestion = activeStage === 2 ? stage2 : stage1
// For stage 1: diff original entry vs stage1.corrected_version
// For stage 2: diff stage1.corrected_version vs stage2.corrected_version
const diffSource = activeStage === 2 ? stage1!.corrected_version : activeSuggestion!.source_content
const diffTarget = activeSuggestion!.corrected_version
const diffSpans = diffTexts(diffSource, diffTarget)
// ... segments, originalSegments, diffChanges derived from diffSpans
```

### SuggestionPanel — two buttons

```ts
interface Props {
  loading: boolean
  loadingStage: 1 | 2 | null   // which stage is loading
  error: string | null
  remaining: number
  canRequestStage1: boolean     // content not empty, remaining > 0, not loading
  canRequestStage2: boolean     // stage 1 exists for current text, remaining > 0, not loading
  hasStage1: boolean            // stage 1 result exists (controls stage 2 button visibility)
  stage1Drifted: boolean        // entry changed since stage 1 (disables stage 2)
  onRequestStage1: () => void
  onRequestStage2: () => void
}
```

- "Fix my English" button: always visible. Label shows "Reviewing..." when
  `loadingStage === 1`. Disabled when `!canRequestStage1`.
- "Suggest better English" button: only rendered when `hasStage1 && !stage1Drifted`.
  Disabled when `!canRequestStage2`. Label shows "Improving..." when
  `loadingStage === 2`.

### Stage tabs (when both stages are done)

When both `stage1` and `stage2` are non-null, show a tab bar above the
two-column grid:

```
[Corrections]  [Style improvements]
```

Active tab has visual indicator (border-bottom or background). Switching tabs
changes `activeStage`, which recomputes the diff for both columns.

When viewing stage 1:
- Left: original entry → red marks where stage 1 fixed things
- Right: stage 1 output → green marks

When viewing stage 2:
- Left: stage 1 output → red marks where stage 2 improved things
- Right: stage 2 output → green marks
- Changes list and feedback: stage 2's

Default to the most recently completed stage.

---

## Part 2 — Red Marks on Original

### New function — `src/lib/diff.ts`

```ts
/**
 * Convert diff spans into Segment[] for OriginalVersionPane rendering.
 * Non-equal spans become highlighted segments (changeIndex = sequential index).
 * Equal spans become plain segments (changeIndex = null).
 *
 * INVARIANT: segments.map(s => s.text).join('') === original text
 * No empty segments.
 *
 * changeIndex numbering is identical to diffToSegments so that clicking
 * a red mark on the left and a green mark on the right select the same
 * change in the list.
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
      // Show the original text with red highlight
      if (span.original.length > 0) {
        segments.push({ text: span.original, changeIndex: changeIdx })
      }
      // Always increment, even if original is empty (inserted span),
      // to stay in sync with diffToSegments
      changeIdx++
    }
  }

  return segments
}
```

Both `diffToSegments` and `diffToOriginalSegments` use the same `changeIdx`
counter logic, so clicking red mark `changeIndex=3` on the left and green mark
`changeIndex=3` on the right refer to the same diff span and the same item in
the changes list.

### New component — `src/components/OriginalVersionPane.tsx`

```ts
interface Props {
  segments: Segment[]            // from diffToOriginalSegments
  selectedChange: number | null
  onSelectChange: (idx: number) => void
  onEdit: () => void             // switch back to textarea
  wordCount: number
  stageLabel: string             // "YOUR ENTRY" for stage 1, "CORRECTED VERSION" for stage 2
}
```

Renders identically to `ImprovedVersionPane` in structure (PaperSurface with
spine, paragraph splitting, scrollbar) but:
- Spine color: `wax` (not `leaf`)
- Highlight color: `--wax-soft` background (red tint), selected ring uses `--brass`
  (same as ImprovedVersionPane for selection consistency)
- Header shows `stageLabel` + word count + "Edit" button (small text link)
- No Copy button (the original text is already the user's own)

Click on a red mark → `onSelectChange(changeIndex)` → same `selectedChange`
state → matching green mark on the right AND matching item in the change list
all highlight simultaneously.

### Left column conditional in DiaryEditor

Three render states for the left column:

```
1. No suggestion visible → live textarea (current behavior, unchanged)
2. Suggestion visible + editMode=true → live textarea (user clicked Edit)
3. Suggestion visible + editMode=false → OriginalVersionPane with red marks
```

State 3 is the new default when a suggestion is displayed. The "Edit" button
in OriginalVersionPane calls `setEditMode(true)`, which switches to state 2
(textarea, no red marks). The × dismiss button sets `dismissed=true`, which
returns to state 1.

When entering edit mode: `editMode = true`. The right column
(ImprovedVersionPane) stays visible — only the left column changes. The user
can still see the improved version while editing. Red marks are gone because
the text is now editable and may diverge.

When a new suggestion arrives (stage 1 or stage 2 result): `editMode` resets
to `false` so the red marks appear on the fresh result.

### Stage 2 diff — what is compared to what

**Design decision and reasoning:**

When stage 2 has run, its diff is computed against stage 1's output, NOT against
the original entry. This is because:
1. Stage 2's input was stage 1's output — showing any other comparison would
   conflate the two layers.
2. The user explicitly stated this in the requirements.
3. Each stage tab tells one honest story: "here is what this stage changed
   relative to what it received."

In the stage 2 tab:
- Left pane header says "CORRECTED VERSION" (this is stage 1's output)
- Left pane shows stage 1's corrected text with red marks where stage 2 changed it
- Right pane header says "TUTOR'S COPY" (unchanged label)
- Right pane shows stage 2's output with green marks

The original entry is only shown in the stage 1 tab. The user can switch tabs
to see each layer. This avoids any confusion about which changes belong to which
stage.

### Join invariants

Both sides must satisfy:
- Left: `originalSegments.map(s => s.text).join('') === diffSource`
  (original entry for stage 1, stage 1 output for stage 2)
- Right: `segments.map(s => s.text).join('') === diffTarget`
  (stage 1 output for stage 1, stage 2 output for stage 2)

These are guaranteed by the existing invariants of `diffTexts` and the new
`diffToOriginalSegments` function, which mirrors `diffToSegments` exactly.

### Interaction details

- Click a red mark → selects the matching item in the changes list (same index)
- Click a green mark → selects the matching item in the changes list (same index)
- Click a change list item → highlights both the red mark on the left AND the
  green mark on the right (same `selectedChange` state drives all three)
- Autosave, word count, fixed pane heights, independent scrolling, `min-h-0`
  overflow fixes all still apply (no changes to these)

---

## Steps

### Part 1 — Two stages (implement first, test prompt quality before Part 2)

1. Write migration `0005_ai_suggestions_stage.sql` → STOP, give user SQL, wait.
2. Update `src/lib/ai/prompt.ts`: replace `SYSTEM_PROMPT` with `STAGE1_PROMPT`
   and `STAGE2_PROMPT`.
3. Update `src/lib/suggestions.ts`: add `stage` and `parent_id` to
   `StoredSuggestion` type.
4. Update `src/app/api/suggest/route.ts`: accept `stage` param, implement
   stage 2 flow (load parent stage 1, use STAGE2_PROMPT, persist with
   parent_id).
5. Update `src/app/diary/[date]/page.tsx`: load both stages, pass both.
6. Update `DiaryEditor.tsx`: two-stage state, stage tabs, two request handlers.
7. Update `SuggestionPanel.tsx`: two buttons with correct enable/disable logic.
8. Update `ImprovedVersionPane.tsx`: minor — header label may vary per stage.
9. Run all 4 test scripts — must pass unchanged.
10. `npm run build` clean.
11. User tests prompt quality on real entries. Iterate on prompt wording if
    needed before proceeding to Part 2.

### Part 2 — Red marks on original (after Part 1 prompt quality is approved)

12. Add `diffToOriginalSegments()` to `src/lib/diff.ts`.
13. Create `src/components/OriginalVersionPane.tsx`.
14. Update `DiaryEditor.tsx`: `editMode` state, conditional left column
    (OriginalVersionPane vs textarea).
15. Run all 4 test scripts — must pass unchanged.
16. `npm run build` clean.
17. User verifies red marks, click-to-select, Edit button, stage switching.

## Definition of Done

### Part 1
- [ ] 4 test scripts pass 100% unchanged.
- [ ] `npm run build` clean.
- [ ] Write entry with intentional errors + unnatural ESL phrasing (e.g. "I
      remove my son from his grandmother" / "went by my experience"), click
      "Fix my English" → result fixes BOTH grammar errors AND unnatural phrasing.
      Verify that previously-missed ESL patterns are now caught.
- [ ] `entries.content` unchanged after either stage.
- [ ] Stage 1 row in `ai_suggestions` has `stage=1, parent_id=NULL`. User runs:
      ```sql
      SELECT id, stage, parent_id, usage_date, model,
             jsonb_array_length(changes) as n_changes
      FROM public.ai_suggestions ORDER BY created_at DESC LIMIT 1;
      ```
- [ ] After stage 1, "Suggest better English" button appears. Click → stage 2
      result shows style improvements. Stage 2 row has `stage=2, parent_id =
      <stage1 id>`. User verifies with same query.
- [ ] Each stage call decrements the "suggestions left today" counter.
- [ ] `AI_DAILY_LIMIT=2` → use both stages → buttons disabled, API returns 429.
- [ ] Stage 2 button disabled when entry has changed since stage 1 (drift).
- [ ] Refresh page → both stages reload from DB, correct stage tabs appear.
- [ ] Stage tabs switch the diff view correctly (stage 1: original vs corrected;
      stage 2: corrected vs improved).
- [ ] Grep: no `NEXT_PUBLIC_AI`, no hardcoded key, no `dangerouslySetInnerHTML`.

### Part 2
- [ ] When suggestion is displayed, left column shows read-only text with red
      marks on incorrect/changed fragments.
- [ ] Clicking a red mark highlights the matching change in the list AND the
      matching green mark on the right.
- [ ] Clicking a green mark highlights the matching red mark on the left.
- [ ] "Edit" button in left column header → swaps to live textarea, red marks
      disappear.
- [ ] × dismiss → returns to textarea, suggestion hidden.
- [ ] Join invariant: both sides' segment texts concatenate to their respective
      source texts character-for-character.
- [ ] Autosave still works in edit mode. Word count still updates.
- [ ] Fixed pane heights, independent scrolling, `min-h-0` all still correct.
- [ ] Stage 2 tab: left pane shows stage 1 output with red marks, right pane
      shows stage 2 output with green marks. Labels are accurate.

## Handoff Obligations
1. Write `memory/phase_12_report.md` with DoD status for every item.
2. Overwrite `memory/STATE.md`.
3. Update `memory/discoveries.md` if any Moderate/Major findings.
4. In report: note prompt quality observations from real entries — compare
   stage 1 catch rate for ESL phrasing vs the old single-prompt approach.
