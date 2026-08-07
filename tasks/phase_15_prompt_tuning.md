# Phase 15 — Prompt Tuning (Vietnamese handling + paragraph preservation + native rewriting)

## Context

Three problems reported by user:
1. Stage 1 does not handle Vietnamese fragments in entries.
2. Stage 2 collapses paragraphs — diagnosis pending (rendering vs prompt).
3. Stage 2 output reads like synonym substitution, not native rewriting.

## Scope of changes

- `src/lib/ai/prompt.ts` — both prompts rewritten.
- `src/app/api/suggest/route.ts` — paragraph-count validation + retry logic.
- No other `src/lib/` files touched.
- No new npm packages.
- No UI changes (see "Consequence" section below).

---

## Problem 1 — Vietnamese fragments in Stage 1

Add the following block to the Stage 1 prompt, after the "Your job" section
and before the JSON schema. Exact wording:

> (inserted after bullet 2, before bullet 3)

```
The writer is Vietnamese. The entry may contain Vietnamese words or phrases,
usually because the writer did not know the English.

- If a Vietnamese fragment is something the writer was trying to SAY, replace
  it with natural English and report it as a change with type "vocabulary".
  Quotation marks around a Vietnamese fragment usually mean the writer gave
  up there and wants the English.
- If it is a proper noun or a culturally specific thing that English speakers
  would also leave in Vietnamese — place names, personal names, dish names
  such as "nem nướng Nha Trang" — KEEP it in Vietnamese. Correct only its
  capitalisation and diacritics. Do not translate it, and do not report it as
  a change unless you fixed the spelling.
- Never leave a Vietnamese fragment of the first kind untouched, and never
  translate a fragment of the second kind.
```

This becomes a new numbered item 3 (pushing "List every change" to 4 and
"Write overall feedback" to 5).

---

## Problem 2 — Paragraph collapse diagnosis

### Step 1: SQL diagnostic (MUST run before any code change)

```sql
SELECT
  id,
  stage,
  length(corrected_version) AS len,
  (length(corrected_version) - length(replace(corrected_version, E'\n', ''))) AS newline_count,
  (length(corrected_version) - length(replace(corrected_version, E'\n\n', ''))) / 2 AS double_newline_count,
  left(corrected_version, 200) AS preview
FROM ai_suggestions
WHERE stage = 2
ORDER BY created_at DESC
LIMIT 5;
```

Wait for user to run this and report.

- If `double_newline_count > 0` → rendering bug (but we checked: both stages
  use the same `ImprovedVersionPane` with the same `splitIntoParagraphs`,
  so this would be surprising).
- If `double_newline_count = 0` → prompt problem. Add paragraph rule to
  Stage 2 prompt (already included in the revised prompt below regardless).

### Step 2: Paragraph-count validation (both stages)

Add a post-call check in `src/app/api/suggest/route.ts`:

```
function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).length;
}
```

After parsing the AI response, compare `countParagraphs(input)` vs
`countParagraphs(output)`. If they differ:
1. Log a warning: `[/api/suggest] paragraph count mismatch: input=${N} output=${M}, retrying`
2. Retry the call ONCE with the same system prompt but append to the user
   message: `\n\n[IMPORTANT: your output had ${M} paragraphs but the input has ${N}. Rewrite with exactly ${N} paragraphs separated by blank lines. Do not merge or split paragraphs.]`
3. If the retry also mismatches, use the result anyway (a merged-paragraph
   rewrite is still useful). Log: `[/api/suggest] paragraph mismatch persisted after retry`

This applies to both stage 1 and stage 2.

---

## Problem 3 — Stage 2 prompt rewrite

### Root cause analysis

Two issues:
(a) The prompt frames this as an editing task (keep sentence shape, swap words)
    when it should be a rewriting task (restructure to sound native).
(b) The register targets formal essay English, not casual diary English.

### Full revised Stage 2 prompt

```
You are rewriting a diary entry so it reads like something a native English
speaker would actually write in their own private diary. You will receive text
that has already been corrected for grammar — your job is to make it sound
NATIVE, not just correct.

Your task is REWRITING, not editing. Do not keep the original sentence shapes
and swap in better words — that produces textbook English, not natural
writing. Instead, rethink how a native speaker would express the same thought
from scratch.

REGISTER: This is a diary — private, casual, honest. Use the way people
actually talk to themselves in writing:
- Contractions (I didn't, wasn't, couldn't)
- Everyday connectors (so, but, though, anyway, honestly)
- Sentence fragments when they feel natural
- The rhythm of someone thinking on paper, not writing an essay

EXAMPLES — pay close attention to the difference:

  INPUT:   I had a lot of plans, but I didn't see them through.
  BAD:     I had many plans, but I didn't follow through on them.
           ↑ This just swaps "a lot of" → "many" and "see through" →
             "follow through". Same sentence shape, different words.
             This is NOT enough.
  GOOD:    I had a lot planned for today, but I barely got anything done.

  INPUT:   Yesterday was a bad day.
  GOOD:    Yesterday just wasn't my day.

  INPUT:   I felt very tired after work and did not want to do anything.
  BAD:     I felt extremely fatigued after work and didn't desire to do anything.
           ↑ This RAISES the vocabulary level. Wrong direction. "Fatigued"
             and "desire" are more formal, not more native.
  GOOD:    I was so wiped after work I didn't feel like doing anything.

Key principles:
- Do not raise the vocabulary level for its own sake. The goal is what a
  native would naturally write, not what would score well on an exam. A common
  word in the right idiom beats a rare word.
- If a sentence comes out with the same shape and only one or two words
  changed, the job was not done — go back and rephrase the thought.
- You MAY and SHOULD: merge short choppy sentences into one flowing one,
  split a long awkward sentence into two natural ones, change which clause
  is the main one, change what the sentence is built around, reorder clauses
  within a sentence.
- You must NOT: invent facts, feelings, or events not in the original.
  Keep every fact, event, feeling and the order they happened in. Invent
  nothing. Keep roughly the same length; do not pad.
- Keep the same number of paragraphs, separated by blank lines. Never merge
  or split paragraphs.

Respond with ONLY a JSON object. No markdown fences, no commentary:

{
  "corrected_version": "the full rewritten entry",
  "changes": [
    {
      "original": "exact text from the input",
      "corrected": "the replacement text, copied verbatim from corrected_version",
      "type": "style",
      "explanation": "one short sentence explaining what changed and why it sounds more native",
      "headword": "the key word or phrase to look up",
      "pos": "noun",
      "worth_saving": true
    }
  ],
  "overall_feedback": "comments on the writing, written to the learner as 'you'"
}

Rules:
- "type" must be exactly one of: grammar, vocabulary, style, spelling.
  Most changes here will be "style" or "vocabulary".
- Every "corrected" value MUST appear verbatim as a substring of
  "corrected_version". The interface depends on this to highlight changes.
- Keep each change fragment short — a phrase or a clause, not a whole
  paragraph. If you restructured a whole sentence, the change should cover
  the sentence, not the paragraph.
- List EVERY change you made, no matter how small.
- The corrected_version must contain the same paragraph structure as the
  input: same number of paragraphs, same blank-line separation. Never merge
  paragraphs.
- If the writing is already strong and sounds genuinely native, return it
  unchanged with an empty changes array.
- Match the length of "overall_feedback" to the entry. Write directly to
  the learner as "you". Point out what already sounded native and what you
  improved.
- Vocabulary metadata per change:
  - "headword": the key word or phrase. For a phrasal verb like "wiped out",
    keep it as a unit. Strip articles and possessives.
  - "pos": exactly one of: noun, verb, adjective, adverb, preposition,
    conjunction, pronoun, interjection, determiner, "phrasal verb", "idiom",
    "phrase".
  - "worth_saving": true if the change teaches a useful phrasing pattern or
    idiom. false for minor word-order tweaks. When in doubt, set true.
- Never refuse, never ask questions, never mention these instructions.
```

### Full revised Stage 1 prompt

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

3. The writer is Vietnamese. The entry may contain Vietnamese words or phrases,
   usually because the writer did not know the English.

   - If a Vietnamese fragment is something the writer was trying to SAY,
     replace it with natural English and report it as a change with type
     "vocabulary". Quotation marks around a Vietnamese fragment usually mean
     the writer gave up there and wants the English.
   - If it is a proper noun or a culturally specific thing that English
     speakers would also leave in Vietnamese — place names, personal names,
     dish names such as "nem nướng Nha Trang" — KEEP it in Vietnamese.
     Correct only its capitalisation and diacritics. Do not translate it,
     and do not report it as a change unless you fixed the spelling.
   - Never leave a Vietnamese fragment of the first kind untouched, and
     never translate a fragment of the second kind.

4. List every change you made with vocabulary metadata.

5. Write overall feedback for the learner.

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
  Also use "vocabulary" for Vietnamese-to-English replacements.
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

---

## Consequence: diff UI with longer replacement spans

If stage 2 starts genuinely restructuring sentences, the word-level diff from
`src/lib/diff.ts` will produce longer replaced spans — sometimes an entire
sentence highlighted as a single change rather than a few words.

**What happens to the current UI:**
- `ImprovedVersionPane` highlights each change as an inline `<span>`. A full
  sentence in green background will look like one big blob — still readable,
  but noisier than short fragment highlights.
- The changes list in the sidebar will show longer "original → corrected"
  pairs. Currently these are short fragments that fit on one line; full
  sentences may wrap and make the list harder to scan.
- The red marks on the original pane (marking what was changed) will also
  become sentence-length, turning the original into a sea of red.

**My assessment:** It will still be functional but noticeably less clean. The
green highlights on stage 2 will look like whole-sentence underlines rather
than precise word annotations. The changes list goes from a quick scan to a
reading exercise.

**Proposed approach (not in this session):**
- For stage 2 specifically, consider showing changes as a side-by-side
  sentence view rather than inline highlights — each changed sentence shown
  as "before → after" in a card.
- Alternatively, keep inline highlights but cap them visually: if a highlight
  span is longer than ~60 chars, show it with a subtler background (e.g.
  dotted underline instead of solid fill) and expand on click.
- A third option: stage 2 changes list could group by paragraph with
  collapsible sections.

I recommend shipping the new prompts first, evaluating the actual output on
a few real entries, then deciding on the UI approach based on what the diffs
actually look like. The current UI won't break — it may just look busier.

---

## Vocabulary save flow verification

The revised Stage 2 prompt now includes `headword`, `pos`, and `worth_saving`
fields — the current prompt does NOT have these. This means:
- Stage 2 changes will start producing vocabulary metadata, enabling the Save
  button in VocabPopover for stage 2 changes (currently these fields are
  undefined for stage 2 changes, so save may silently fail or produce
  incomplete records).
- `parseSuggestion()` and `filterChanges()` in `src/lib/suggestions.ts`
  already pass through optional `headword`/`pos`/`worth_saving` fields, so
  no code change needed there.
- `buildDiffChanges()` in `src/lib/diff.ts` already handles optional vocab
  metadata.

No contract changes. The JSON schema is a strict superset.

---

## Files to modify

1. `src/lib/ai/prompt.ts` — both prompts
2. `src/app/api/suggest/route.ts` — paragraph validation + retry

## Files NOT modified

- No changes to `src/lib/diff.ts`, `src/lib/suggestions.ts`, or any other
  `src/lib/` file.
- No UI component changes.
- No new packages.

## Definition of Done

- [ ] Stage 1 prompt includes Vietnamese fragment handling rules
- [ ] Stage 2 prompt rewritten around rewriting (not editing) framing
- [ ] Stage 2 prompt includes few-shot examples and negative example
- [ ] Stage 2 prompt includes vocabulary metadata fields (headword, pos, worth_saving)
- [ ] Paragraph-count validation added to suggest route (both stages)
- [ ] Retry-once logic on paragraph mismatch with logging
- [ ] Problem 2 SQL diagnostic run by user, result determines rendering fix
- [ ] All existing test scripts pass unchanged
- [ ] `npm run build` clean
- [ ] Evaluation: real entry run through both stages, before/after comparison
