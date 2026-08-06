# Phase 13: Vocabulary — In-Entry Popover + Panel

## Context Recap

Phase 12 built two-stage AI suggest: Stage 1 fixes grammar/unnatural phrasing,
Stage 2 improves style. The tutor's copy (right pane, `ImprovedVersionPane.tsx`)
renders highlighted diff spans as clickable `<span>` elements that select the
matching item in the MARGIN NOTES list below. The diff engine in `src/lib/diff.ts`
is the single source of truth for highlight positions.

Current stack: `STAGE1_PROMPT` + `STAGE2_PROMPT` in `src/lib/ai/prompt.ts`,
`callAI()` in `src/lib/ai/provider.ts` (Groq, plain fetch), diff engine in
`src/lib/diff.ts` (`diffTexts`, `diffToSegments`, `diffToOriginalSegments`,
`buildDiffChanges`), `DiaryEditor.tsx` → `ImprovedVersionPane.tsx` +
`OriginalVersionPane.tsx` + `SuggestionDetails.tsx` + `SuggestionPanel.tsx`.

**No MCP to Supabase.** All SQL is copy-paste for the user.

## Goal

Add a vocabulary-saving feature to the entry page:
1. **Popover on the tutor's copy** — clicking a highlighted fragment still selects
   the matching MARGIN NOTE, AND now also shows a small popover with Copy, Sound,
   and Note to vocabulary actions.
2. **Vocabulary panel** at the top of the diary page — shows terms saved from this
   entry with IPA, part of speech, definition, example, change category chip, and
   the original text. Collapsible, only visible when the entry has saved terms.

## Non-goals
- The standalone vocabulary library page (comes in a later session).
- Spaced repetition, flashcards, quiz features.
- Audio file storage or downloading pronunciation files.
- No new npm packages.
- No modifications to `HeatmapGrid.tsx`, `MonthCalendar.tsx`, `StatsBar.tsx`,
  `MoodPicker.tsx`, `PhotoStrip.tsx`, `src/app/page.tsx`.
- Do not edit existing test fixtures or existing test scripts.
- `entries.content` is never overwritten.

## Justified `src/lib/` modifications

1. **`src/lib/ai/prompt.ts`** — Extend `STAGE1_PROMPT` to also return `headword`,
   `pos`, and `worth_saving` per change. This IS the substance of decision 2.
2. **`src/lib/suggestions.ts`** — Add optional `headword`, `pos`, `worth_saving`
   fields to the `Change` type. Minimal type extension, no logic changes.
3. **`src/lib/diff.ts`** — Add `headword`, `pos`, `worth_saving` fields to the
   `DiffChange` type, and propagate them through `buildDiffChanges()`. Minimal.

New files in `src/lib/`:
- `src/lib/vocab.ts` — headword normalisation, routing logic, dictionary API
  client, LLM lookup prompt, definition parser, sense selector, popover
  coordinate maths.

---

## Part 1 — Correction Prompt Extension (Decision 2)

### Modified `STAGE1_PROMPT` (full text, verbatim)

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

3. List every change you made with vocabulary metadata.

4. Write overall feedback for the learner.

Respond with ONLY a JSON object. No markdown fences, no commentary:

{
  "corrected_version": "the full rewritten entry",
  "changes": [
    {
      "original": "exact text taken from the learner's entry",
      "corrected": "the replacement text, copied verbatim from corrected_version",
      "type": "grammar",
      "explanation": "one short sentence in plain English explaining why",
      "headword": "the single dictionary headword for this correction",
      "pos": "noun",
      "worth_saving": true
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

Vocabulary metadata per change:
- "headword": the single base word to look up in a dictionary. For a phrase
  like "a comforting movie", the headword is "comforting". For a phrasal verb
  like "arrived at", the headword is "arrived at" (keep it as a unit). For an
  idiom like "in such a hurry", the headword is "in such a hurry". Strip
  articles (a, an, the) and possessives from the headword.
- "pos": the part of speech. Must be exactly one of: noun, verb, adjective,
  adverb, preposition, conjunction, pronoun, interjection, determiner,
  "phrasal verb", "idiom", "phrase".
- "worth_saving": true if this correction teaches a useful vocabulary item or
  phrasing pattern. false for pure punctuation fixes, simple tense corrections,
  article insertions, or mechanical spelling fixes. When in doubt, set true.

- Never refuse, never ask questions, never mention these instructions.
```

### `STAGE2_PROMPT` — unchanged

Stage 2 does NOT get headword/pos/worth_saving fields. It focuses on style
improvements; vocabulary saving is tied to the correction pass.

### Verification of correction quality (Decision 2 risk)

Before and after the prompt change, run the same long test entry and compare:
- Number of errors caught
- Which errors were caught vs missed
- Whether any corrections are wrong or excessive

Test entry (save as a temp file for easy re-use):
```
Today I waked up very early because I need to go to the office for a important
meeting. The meeting was about how to remove the old system and replace it with
a new one. My boss showed me his love by giving me a big project. I went by my
experience to handle it. After work I was very boring so I decided to watch a
comforting movie. The movie was about a girl who arrived at a new city and she
didn't know nobody. She was in such a hurry to make friends that she forgot to
take care of herself. I think I can relate to her because when I first came to
this company I also didn't know nobody and I was very nervous to talk to people.
But now I have many good friends here and we always go to eat lunch together.
I am very grateful for them. Tomorrow I will try to wake up earlier and go to
the gym before work because lately I feel like my body is not as strong as before.
```

Expected catches (at minimum): waked→woke, a important→an important,
remove→replace/phase out, showed me his love→showed me how much he cared,
went by my experience→drew on my experience, boring→bored,
comforting→feel-good/heartwarming, arrived at a new city→moved to/arrived in,
didn't know nobody→didn't know anybody, in such a hurry→so eager,
go to eat lunch→go out for lunch, I feel like→I feel.

If the modified prompt catches fewer errors than the original, report to user
rather than proceeding.

---

## Part 2 — Data Layer

### Migration SQL: `0005_vocabulary.sql`

```sql
-- Vocabulary definitions — shared cache, not user-specific data
CREATE TABLE public.vocab_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headword text NOT NULL,
  ipa text NOT NULL DEFAULT '',
  part_of_speech text NOT NULL DEFAULT '',
  definition text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'dictionary'
    CHECK (source IN ('dictionary', 'llm')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (headword)
);

-- RLS: any authenticated user can read, nobody can write via client
-- (only server-side API routes insert/update)
ALTER TABLE public.vocab_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read definitions"
  ON public.vocab_definitions FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — writes happen via service role
-- or through API route using the user's session (which does the insert
-- via a server-side supabase client that bypasses RLS for this table).
-- JUSTIFICATION: A dictionary definition is not personal data. Any
-- authenticated user should be able to read any cached definition.
-- One user's saves are NOT inferable from this table because it contains
-- no user_id — you cannot tell who triggered the cache population.
-- The saved_vocab table (below) is where personal data lives.

-- Saved vocabulary — per-user, per-entry
CREATE TABLE public.saved_vocab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  definition_id uuid REFERENCES public.vocab_definitions(id) ON DELETE SET NULL,
  display_form text NOT NULL,
  original_form text NOT NULL DEFAULT '',
  headword text NOT NULL,
  change_type text NOT NULL DEFAULT ''
    CHECK (change_type IN ('grammar', 'vocabulary', 'style', 'spelling', '')),
  status text NOT NULL DEFAULT 'learning'
    CHECK (status IN ('learning', 'known')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_id, headword)
);

ALTER TABLE public.saved_vocab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved vocab"
  ON public.saved_vocab FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved vocab"
  ON public.saved_vocab FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved vocab"
  ON public.saved_vocab FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved vocab"
  ON public.saved_vocab FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_saved_vocab_user_entry ON public.saved_vocab(user_id, entry_id);
CREATE INDEX idx_saved_vocab_user_status ON public.saved_vocab(user_id, status);
CREATE INDEX idx_vocab_definitions_headword ON public.vocab_definitions(headword);
```

### RLS justification for `vocab_definitions`

`vocab_definitions` has no `user_id` column. It is a shared cache of dictionary
lookups — identical to how a dictionary works: the definition of "comforting"
is not personal to any user. One user's saves cannot be inferred from this table
because it contains no user_id, no entry_id, and no timestamp tied to a user
action. The `fetched_at` field records when the cache was populated, not when
a user saved a word.

The table has SELECT for authenticated users only (not anon). INSERT is done
server-side only — API routes use the Supabase client with the user's session
but insert into this table through a server-side path that either uses service
role or a permissive INSERT policy. Given the low risk, I'll add a permissive
INSERT policy:

```sql
CREATE POLICY "Authenticated users can insert definitions"
  ON public.vocab_definitions FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

This is safe because: (a) the table has a UNIQUE constraint on headword, so
spam is bounded; (b) the data is not sensitive; (c) the worst case is a user
inserting a bad definition, which gets overwritten on next lookup.

### Headword normalisation

```typescript
// src/lib/vocab.ts
export function normaliseHeadword(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')        // collapse internal whitespace
    .replace(/^[^\w]+/, '')       // strip leading punctuation
    .replace(/[^\w]+$/, '')       // strip trailing punctuation
}
```

Cases:
- `"  Comforting  "` → `"comforting"`
- `"arrived  at"` → `"arrived at"`
- `"'hello'"` → `"hello"`
- `"don't"` → `"don't"` (apostrophe inside word preserved by \w+ match — wait,
  apostrophe is not \w. Revise: strip only edge punctuation that is not an
  apostrophe within a word.)

Revised:
```typescript
export function normaliseHeadword(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '')  // strip leading non-alphanumeric
    .replace(/[^a-z0-9]+$/i, '')  // strip trailing non-alphanumeric
}
```

This preserves internal apostrophes (`don't`), hyphens (`well-known`), and
multi-word units (`arrived at`).

### Routing logic (Decision 1)

```typescript
type LookupRoute = 'dictionary' | 'llm'

const LLM_POS = new Set(['phrasal verb', 'idiom', 'phrase'])

export function routeLookup(headword: string, pos: string): LookupRoute {
  if (LLM_POS.has(pos.toLowerCase())) return 'llm'
  const tokens = headword.trim().split(/\s+/)
  if (tokens.length === 1) return 'dictionary'
  return 'llm'
}
```

### Sense selection from dictionary response (Decision 3)

```typescript
export type DictMeaning = {
  partOfSpeech: string
  definitions: Array<{ definition: string; example?: string }>
}

export type DictEntry = {
  word: string
  phonetic?: string
  phonetics?: Array<{ text?: string; audio?: string }>
  meanings: DictMeaning[]
}

export type LookupResult = {
  ipa: string
  part_of_speech: string
  definition: string
  example: string
}

export function selectSense(entries: DictEntry[], pos: string): LookupResult {
  // Collect all meanings across all entries
  const allMeanings: DictMeaning[] = entries.flatMap(e => e.meanings)

  // Find IPA from phonetics
  const ipa = entries
    .flatMap(e => e.phonetics ?? [])
    .find(p => p.text)?.text
    ?? entries.find(e => e.phonetic)?.phonetic
    ?? ''

  // Try to match by pos
  const posLower = pos.toLowerCase()
  const matched = allMeanings.find(
    m => m.partOfSpeech.toLowerCase() === posLower
  )
  const meaning = matched ?? allMeanings[0]

  if (!meaning || meaning.definitions.length === 0) {
    return { ipa, part_of_speech: pos, definition: '', example: '' }
  }

  const def = meaning.definitions[0]
  return {
    ipa,
    part_of_speech: meaning.partOfSpeech,
    definition: def.definition ?? '',
    example: def.example ?? '',
  }
}
```

### Dictionary API client

```typescript
export async function lookupDictionary(headword: string): Promise<DictEntry[] | null> {
  const encoded = encodeURIComponent(headword)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`,
      { signal: controller.signal }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return data as DictEntry[]
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
```

### LLM lookup prompt (Decision 1 — for phrasal verbs, idioms, multi-word)

```typescript
export const DEFINITION_PROMPT = `You are a concise English dictionary.
Given a word or phrase, return ONLY a JSON object:

{
  "ipa": "IPA transcription (use / slashes /)",
  "part_of_speech": "noun, verb, adjective, adverb, phrasal verb, idiom, or phrase",
  "definition": "one short sentence, plain English, Cambridge-learner style",
  "example": "one short example sentence using the word naturally"
}

Rules:
- Keep the definition under 20 words.
- The example must be a complete sentence, under 15 words.
- Do not include the word "means" in the definition.
- For phrasal verbs and idioms, define the meaning as a unit.
- No markdown, no commentary, just the JSON object.`
```

### LLM definition parser (defensive, like parseSuggestion)

```typescript
export function parseLookupResponse(raw: string): LookupResult | null {
  let text = raw.trim()

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  text = text.slice(start, end + 1)

  let obj: unknown
  try { obj = JSON.parse(text) } catch { return null }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
  const r = obj as Record<string, unknown>

  return {
    ipa: typeof r.ipa === 'string' ? r.ipa : '',
    part_of_speech: typeof r.part_of_speech === 'string' ? r.part_of_speech : '',
    definition: typeof r.definition === 'string' ? r.definition : '',
    example: typeof r.example === 'string' ? r.example : '',
  }
}
```

### Matching model edits onto diff spans (extending `buildDiffChanges`)

Currently `buildDiffChanges()` in `diff.ts` creates `DiffChange` objects with
`type` and `explanation`. Extend `DiffChange` to also carry:
```typescript
export type DiffChange = {
  original: string
  corrected: string
  type: ChangeType | null
  explanation: string | null
  headword: string | null    // NEW
  pos: string | null         // NEW
  worthSaving: boolean       // NEW — defaults to false if no match
}
```

The matching logic in `buildDiffChanges()` already does overlap-based matching.
When a match is found, also propagate `headword`, `pos`, `worth_saving` from
the model change. When no match is found, these default to `null`/`false`.

The `Change` type in `suggestions.ts` gains optional fields:
```typescript
export type Change = {
  original: string
  corrected: string
  type: ChangeType
  explanation: string
  headword?: string       // NEW
  pos?: string            // NEW
  worth_saving?: boolean  // NEW
}
```

`filterChanges()` keeps working — these new fields are optional, so existing
changes without them are still valid. The filter passes them through if present.

---

## Part 3 — API Routes

### `POST /api/vocab/save` — save a term

Request: `{ entryId, displayForm, originalForm, headword, changeType }`

Flow:
1. Auth check
2. Validate body
3. Normalise headword
4. Check if already saved (UNIQUE constraint) — if so, return existing
5. INSERT into `saved_vocab` with `definition_id = null` (definition fetched separately)
6. Return the saved row

### `POST /api/vocab/lookup` — fetch definition for a headword

Request: `{ headword, pos }`

Flow:
1. Auth check
2. Normalise headword
3. Check `vocab_definitions` cache — if hit, return cached
4. Rate limit: count LLM lookups today (not dictionary lookups)
   - `LOOKUP_DAILY_LIMIT` env var, default 30
   - Only count if route is 'llm'
5. Route: dictionary or LLM (Decision 1)
6. If dictionary:
   - Call dictionaryapi.dev
   - `selectSense()` with pos
   - INSERT into `vocab_definitions` (ON CONFLICT DO NOTHING — race-safe)
7. If LLM:
   - Call `callAI(DEFINITION_PROMPT, headword)`
   - Parse response
   - INSERT into `vocab_definitions`
8. Return definition
9. UPDATE `saved_vocab` SET `definition_id` WHERE headword matches and user_id

### `DELETE /api/vocab/[id]` — remove a saved term

1. Auth check
2. DELETE from `saved_vocab` WHERE `id = params.id AND user_id = auth.uid()`
3. Do NOT delete from `vocab_definitions` (shared cache)

### `GET /api/vocab/entry/[entryId]` — load saved vocab for an entry

This is server-side loaded in the page component, not a client API call.
Query: `saved_vocab` JOIN `vocab_definitions` WHERE `entry_id` and `user_id`.

---

## Part 4 — Popover UI (Decision 6)

### Component: `VocabPopover.tsx`

Portal-rendered into `document.body` with `position: fixed`.

Props:
```typescript
interface VocabPopoverProps {
  anchorRect: DOMRect          // from getBoundingClientRect()
  fragment: string             // the highlighted text
  changeIndex: number          // which change this corresponds to
  isSaved: boolean             // already in vocabulary?
  hasEnglishVoice: boolean     // from speechSynthesis check
  onCopy: () => void
  onSound: () => void
  onSave: () => void
  onRemove: () => void
  onClose: () => void
}
```

### Coordinate maths

```typescript
export function computePopoverPosition(
  anchorRect: DOMRect,
  popoverWidth: number,
  popoverHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; left: number; above: boolean } {
  const GAP = 8
  const MARGIN = 8  // minimum distance from viewport edge

  // Prefer below
  let top = anchorRect.bottom + GAP
  let above = false

  // Flip above if not enough room below
  if (top + popoverHeight > viewportHeight - MARGIN) {
    top = anchorRect.top - GAP - popoverHeight
    above = true
  }

  // Horizontal: center on anchor, clamp to viewport
  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
  left = Math.max(MARGIN, Math.min(left, viewportWidth - popoverWidth - MARGIN))

  return { top, left, above }
}
```

### Behaviour
- Close on: Escape key, click outside, scroll of either pane (close, not
  reposition — repositioning during scroll while typing causes jank and the
  popover is cheap to re-open).
- Clicking a fragment: (a) selects the MARGIN NOTE (existing), (b) opens the
  popover (new). If already open on same fragment, closes it.
- Saved fragments show a different visual: dashed brass underline instead of
  solid leaf background. Popover shows "Remove" instead of "Note to vocabulary".

### Speech synthesis (Decision 5)

```typescript
function speakText(text: string): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel() // stop any current speech
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = window.speechSynthesis.getVoices()
  const englishVoice = voices.find(v => v.lang.startsWith('en-'))
  if (englishVoice) utterance.voice = englishVoice
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function hasEnglishVoice(): boolean {
  if (!window.speechSynthesis) return false
  const voices = window.speechSynthesis.getVoices()
  return voices.some(v => v.lang.startsWith('en-'))
}
```

If no English voice is available, the Sound button is hidden entirely.

---

## Part 5 — Vocabulary Panel UI

### Component: `VocabPanel.tsx`

Location: above the stage tabs in `DiaryEditor.tsx`, below the header.
Only renders when there are saved terms for this entry.

Design (from `vocab_library_reference.html` lines 342–373):
- Brass spine on the left
- Header: "VOCABULARY FROM THIS ENTRY" + count pill + "Open library →" link
  (disabled/hidden for now since library page is out of scope) + collapse button
- Collapsible grid of cards
- Each card: headword (bold), Sound button, IPA, × remove, pos (italic),
  definition, example (italic, quoted), change type chip + "you wrote ___"

### Card loading state
When a term is saved but definition hasn't loaded yet:
- Show the headword and original_form immediately
- Show a subtle skeleton pulse for IPA, definition, example
- Replace with real data when lookup completes

### Card with lookup failure
- Show headword, original_form, change type
- Small "Retry" link in place of definition
- Never lose the user's save due to failed lookup

---

## Part 6 — Integration in DiaryEditor.tsx

### New state
```typescript
const [savedVocab, setSavedVocab] = useState<SavedVocabItem[]>(initialSavedVocab)
const [popover, setPopover] = useState<PopoverState | null>(null)
const [vocabCollapsed, setVocabCollapsed] = useState(false)
```

### Server-side loading in page.tsx
```typescript
// In diary/[date]/page.tsx — load saved vocab for this entry
const { data: savedVocabRaw } = await supabase
  .from('saved_vocab')
  .select(`
    id, display_form, original_form, headword, change_type, status, created_at,
    vocab_definitions (id, ipa, part_of_speech, definition, example, source)
  `)
  .eq('user_id', user.id)
  .eq('entry_id', entry.id)
  .order('created_at', { ascending: true })
```

### Flow: user saves a term
1. User clicks highlighted span → popover opens
2. User clicks "Note to vocabulary"
3. Immediately: POST `/api/vocab/save` → row in `saved_vocab`
4. Card appears in panel with loading skeleton
5. POST `/api/vocab/lookup` → definition fetched → card fills in
6. If lookup fails → card shows retry affordance
7. Page reload → everything loads server-side

### Flow: user removes a term
1. Click × on card OR click "Remove" in popover
2. DELETE `/api/vocab/[id]`
3. Card disappears from panel
4. Fragment reverts to normal highlight style

---

## Tests (all in `scripts/test_vocab.mjs`)

### Test group 1: Headword normalisation

| Input | Expected |
|-------|----------|
| `"  Comforting  "` | `"comforting"` |
| `"ARRIVED AT"` | `"arrived at"` |
| `"  don't  "` | `"don't"` |
| `"'hello'"` | `"hello"` |
| `"well-known"` | `"well-known"` |
| `"  in   such  a   hurry "` | `"in such a hurry"` |
| `"...word..."` | `"word"` |
| `"THE"` | `"the"` |
| `""` | `""` |
| `"   "` | `""` |
| `"can't-stop"` | `"can't-stop"` |

### Test group 2: Routing decision

| Headword | POS | Expected route |
|----------|-----|----------------|
| `"comforting"` | `"adjective"` | `"dictionary"` |
| `"arrived at"` | `"phrasal verb"` | `"llm"` |
| `"in such a hurry"` | `"phrase"` | `"llm"` |
| `"ring"` | `"noun"` | `"dictionary"` |
| `"pull away"` | `"phrasal verb"` | `"llm"` |
| `"hurry"` | `"noun"` | `"dictionary"` |
| `"look up"` | `"verb"` | `"llm"` (multi-token) |
| `"break"` | `"verb"` | `"dictionary"` |
| `"kind of"` | `"idiom"` | `"llm"` |
| `"well"` | `"adverb"` | `"dictionary"` |

### Test group 3: Sense selection

Fixture — mock dictionaryapi.dev response for "ring":
```json
[{
  "word": "ring",
  "phonetic": "/rɪŋ/",
  "phonetics": [{ "text": "/rɪŋ/" }],
  "meanings": [
    {
      "partOfSpeech": "noun",
      "definitions": [
        { "definition": "A circular band worn as an ornament.", "example": "She wore a gold ring." },
        { "definition": "An enclosed area for boxing or wrestling." }
      ]
    },
    {
      "partOfSpeech": "verb",
      "definitions": [
        { "definition": "To make a clear resonant sound.", "example": "The phone rang." },
        { "definition": "To surround or encircle." }
      ]
    }
  ]
}]
```

| POS arg | Expected part_of_speech | Expected definition (starts with) |
|---------|------------------------|----------------------------------|
| `"verb"` | `"verb"` | `"To make a clear"` |
| `"noun"` | `"noun"` | `"A circular band"` |
| `"adjective"` | `"noun"` (fallback to first) | `"A circular band"` |

Empty response: `[]` → `{ ipa: '', part_of_speech: 'noun', definition: '', example: '' }`

Fixture with only phonetic (no phonetics array):
```json
[{ "word": "test", "phonetic": "/tɛst/", "meanings": [{ "partOfSpeech": "noun", "definitions": [{ "definition": "A trial." }] }] }]
```
→ `ipa` should be `"/tɛst/"`

### Test group 4: Matching model edits onto diff spans

Using existing `buildDiffChanges` with extended Change objects:

```javascript
const spans = [
  { kind: 'equal', original: 'I ', corrected: 'I ' },
  { kind: 'replaced', original: 'waked up', corrected: 'woke up' },
  { kind: 'equal', original: ' early', corrected: ' early' },
]
const modelChanges = [
  { original: 'waked up', corrected: 'woke up', type: 'grammar',
    explanation: 'Past tense of wake is woke',
    headword: 'wake', pos: 'verb', worth_saving: true },
]
```
→ First DiffChange should have `headword: 'wake'`, `pos: 'verb'`, `worthSaving: true`

Unmatched span (no model change matches):
```javascript
const spans = [
  { kind: 'replaced', original: 'foo', corrected: 'bar' },
]
const modelChanges = []
```
→ DiffChange has `headword: null`, `pos: null`, `worthSaving: false`

### Test group 5: LLM definition parser

| Input | Expected |
|-------|----------|
| `'{"ipa":"/kəmˈfɔːrtɪŋ/","part_of_speech":"adjective","definition":"Making you feel calm.","example":"A comforting cup of tea."}'` | All four fields populated |
| `` '```json\n{"ipa":"/x/","part_of_speech":"n","definition":"d","example":"e"}\n```' `` | Parses through fence stripping |
| `'Sure! Here is the definition: {"ipa":"","part_of_speech":"","definition":"","example":""} Hope that helps!'` | Extracts JSON, all fields empty strings |
| `'not json at all'` | `null` |
| `'{}'` | `{ ipa: '', part_of_speech: '', definition: '', example: '' }` |
| `'{"ipa": 123}'` | `{ ipa: '', ... }` (non-string → empty) |

### Test group 6: Popover coordinate maths

| Anchor rect | Viewport | Expected |
|------------|----------|----------|
| `{ top: 100, bottom: 120, left: 200, width: 80, height: 20 }` viewport 1024×768, popover 236×40 | Below, centered | `{ top: 128, left: ~122, above: false }` |
| `{ top: 740, bottom: 760, left: 200, width: 80, height: 20 }` viewport 1024×768, popover 236×40 | Not enough room below → flip above | `{ top: 692, above: true }` |
| `{ top: 100, bottom: 120, left: 370, width: 20, height: 20 }` viewport 390×844, popover 236×40 | Right edge clamp at 390px | `left ≤ 390 - 236 - 8 = 146` |
| `{ top: 100, bottom: 120, left: 0, width: 20, height: 20 }` viewport 390×844, popover 236×40 | Left edge clamp | `left ≥ 8` |

---

## Build Order

### Step A: Correction prompt change + quality verification
1. Modify `STAGE1_PROMPT` in `src/lib/ai/prompt.ts`
2. Extend `Change` type in `src/lib/suggestions.ts`
3. Extend `DiffChange` type and `buildDiffChanges()` in `src/lib/diff.ts`
4. Extend `filterChanges()` to pass through new optional fields
5. Run the test entry through old and new prompts, compare results

### Step B: Data layer + lookup logic + CLI verification
1. User applies migration `0005_vocabulary.sql`
2. Create `src/lib/vocab.ts` with all pure functions
3. Create `scripts/test_vocab.mjs` — all tests must pass
4. Create API routes: `/api/vocab/save`, `/api/vocab/lookup`, `/api/vocab/[id]`
5. Create CLI script `scripts/test_vocab_live.mjs` to test real lookups:
   - "comforting" (adjective) — dictionary path
   - "ring" (verb, polysemous) — dictionary path, should pick verb sense
   - "arrived at" (phrasal verb) — LLM path
   - "in such a hurry" (phrase) — LLM path
   User runs this and reports results.

### Step C: Popover + Panel UI
1. Create `VocabPopover.tsx` (portal, fixed positioning)
2. Create `VocabPanel.tsx` (collapsible card grid)
3. Integrate into `ImprovedVersionPane.tsx` (popover trigger on span click)
4. Integrate into `DiaryEditor.tsx` (panel + state management)
5. Update `diary/[date]/page.tsx` (server-side load of saved vocab)
6. Manual verification at 390px and 1920px

---

## Flags / Concerns for User Review

### 1. Popover scroll behaviour — CLOSE on scroll, not reposition
I chose to close the popover when either pane scrolls, rather than repositioning
it. Reason: repositioning a fixed-position element during scroll requires
`requestAnimationFrame` polling or a scroll listener that fires on every frame,
which adds complexity and potential jank — especially since this page re-renders
while the user types. Closing is cheap, and re-opening is one click.

### 2. `vocab_definitions` INSERT policy
The migration adds a permissive INSERT policy for authenticated users. This means
any authenticated user can insert a definition. The alternative is to use a
service role key for inserts, but that means storing `SUPABASE_SERVICE_ROLE_KEY`
in env vars and creating a separate client — more complexity for minimal gain,
since the table has a UNIQUE constraint on headword and contains no sensitive data.

### 3. "Open library →" link in the panel header
The design shows this link but the library page is out of scope. I'll render it
as greyed-out / non-clickable text with a title tooltip "Coming soon". Or I can
omit it entirely. Your call.

### 4. Prompt output burden (Decision 2 risk)
Adding three fields per change increases the output token count by ~15-20 tokens
per change. For an entry with 8 changes, that's ~150 extra tokens. Groq's
`llama-3.3-70b-versatile` has a 32k context window and typically returns 500-1500
tokens for a correction — the extra 150 tokens should be well within capacity.
But I'll verify empirically as described in the verification section.

### 5. No STAGE2_PROMPT extension
Stage 2 (style improvements) does NOT get headword/pos/worth_saving. The rationale:
vocabulary saving is about learning from corrections, not from style upgrades.
Style changes are subjective and less dictionary-friendly. The user can still save
terms from stage 2 via the popover — the headword will be derived at save time
from the display_form, and the lookup will use the LLM path since there's no
pre-attached metadata. This is consistent with decision 2's "match sometimes
fails" fallback.

### 6. Popover width is 236px (from the design reference)
At 390px viewport, this leaves 154px of horizontal space. The popover will be
clamped to stay within the viewport, but it may cover the fragment itself on very
narrow screens. This matches the design mockup behaviour. If you want it narrower
on mobile, say so.

---

## Definition of Done

### Data integrity
- [ ] No code path writes `corrected_version` into `entries.content`
- [ ] `is_backfill` only set on INSERT, never changed on UPDATE
- [ ] All "today" calculations use `profiles.timezone`
- [ ] No `NEXT_PUBLIC_` prefix on AI env vars
- [ ] No `dangerouslySetInnerHTML`
- [ ] `LOOKUP_DAILY_LIMIT` env var exists and defaults to 30
- [ ] Saving a word does NOT count against `AI_DAILY_LIMIT`
- [ ] Deleting a saved term does NOT delete the cached definition

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
- [ ] Click highlight → selects MARGIN NOTE item (existing behaviour preserved)
- [ ] Click highlight → opens popover (new behaviour, coexists)
- [ ] Lightbox closes via backdrop, ×, Escape
- [ ] Future dates not clickable
- [ ] Suggestion counter correct

### Vocabulary-specific
- [ ] Popover renders in portal with `position: fixed`
- [ ] Popover closes on Escape, outside click, scroll
- [ ] Popover flips above when not enough room below
- [ ] Popover clamped horizontally at 390px viewport
- [ ] Sound button hidden when no English voice available
- [ ] Saved fragment has distinct visual state
- [ ] Panel only shows when entry has saved terms
- [ ] Panel is collapsible
- [ ] Card shows loading state while definition fetches
- [ ] Failed lookup shows retry, doesn't lose the save
- [ ] Remove card → term removed, definition cache untouched
- [ ] Page reload → vocab panel reappears with data
- [ ] Dictionary path picks correct sense by POS
- [ ] LLM fallback used for phrasal verbs, idioms, multi-word

### Tests
- [ ] All existing test scripts pass unchanged
- [ ] `npm run build` clean
- [ ] `scripts/test_vocab.mjs` — all assertions pass
- [ ] Correction quality verified (same errors caught before and after prompt change)
- [ ] `scripts/test_vocab_live.mjs` — 4 terms produce good definitions (user verified)

### Manual checks
- [ ] Resize 1920px → 360px: nothing clipped, nothing overlapping
- [ ] `prefers-reduced-motion` respected
