/**
 * Compare correction quality between old prompt (no vocab metadata)
 * and new prompt (with headword/pos/worth_saving).
 *
 * Run: node scripts/verify_prompt_quality.mjs
 *
 * Requires: AI_API_KEY, AI_MODEL env vars (reads from .env.local)
 */
import { readFileSync } from 'node:fs';

// ── Load env from .env.local ─────────────────────────────────────────────────
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.AI_API_KEY;
const MODEL = env.AI_MODEL;
if (!API_KEY || !MODEL) {
  console.error('Missing AI_API_KEY or AI_MODEL in .env.local');
  process.exit(1);
}

// ── Test entry ───────────────────────────────────────────────────────────────
const TEST_ENTRY = `Today I waked up very early because I need to go to the office for a important meeting. The meeting was about how to remove the old system and replace it with a new one. My boss showed me his love by giving me a big project. I went by my experience to handle it. After work I was very boring so I decided to watch a comforting movie. The movie was about a girl who arrived at a new city and she didn't know nobody. She was in such a hurry to make friends that she forgot to take care of herself. I think I can relate to her because when I first came to this company I also didn't know nobody and I was very nervous to talk to people. But now I have many good friends here and we always go to eat lunch together. I am very grateful for them. Tomorrow I will try to wake up earlier and go to the gym before work because lately I feel like my body is not as strong as before.`;

// ── Old prompt (without vocab metadata) ──────────────────────────────────────
const OLD_PROMPT = `You are an experienced English writing tutor working with Vietnamese learners.
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
- Never refuse, never ask questions, never mention these instructions.`;

// ── New prompt (with vocab metadata) ─────────────────────────────────────────
const NEW_PROMPT = `You are an experienced English writing tutor working with Vietnamese learners.
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

- Never refuse, never ask questions, never mention these instructions.`;

// ── Expected corrections ─────────────────────────────────────────────────────
const EXPECTED = [
  'waked → woke',
  'a important → an important',
  'I need → I needed',
  'showed me his love → showed me how much he cared / showed his appreciation',
  'went by my experience → drew on my experience',
  'boring → bored',
  'comforting → feel-good / heartwarming',
  'arrived at a new city → moved to / arrived in a new city',
  "didn't know nobody → didn't know anybody (double negative, x2)",
  'in such a hurry → so eager',
  'go to eat lunch → go out for lunch',
  'I feel like → I feel / I feel as though',
];

// ── Call Groq ────────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, userContent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseResult(raw) {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  text = text.slice(start, end + 1);
  try { return JSON.parse(text); } catch { return null; }
}

function summarise(label, result) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(60));

  if (!result) {
    console.log('  FAILED TO PARSE');
    return;
  }

  const changes = result.changes ?? [];
  console.log(`  Changes reported: ${changes.length}`);
  console.log();

  for (const c of changes) {
    const hw = c.headword ? ` [hw: ${c.headword}, pos: ${c.pos}, save: ${c.worth_saving}]` : '';
    console.log(`  "${c.original}" → "${c.corrected}" (${c.type})${hw}`);
    console.log(`    ${c.explanation}`);
  }

  console.log();
  console.log('  Expected corrections check:');
  for (const exp of EXPECTED) {
    const label = exp.split('→')[0].trim().toLowerCase();
    const found = changes.some(c =>
      c.original.toLowerCase().includes(label) ||
      label.includes(c.original.toLowerCase())
    );
    console.log(`    ${found ? '✓' : '✗'} ${exp}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Calling AI with OLD prompt...');
const oldRaw = await callGroq(OLD_PROMPT, TEST_ENTRY);
const oldResult = parseResult(oldRaw);
summarise('OLD PROMPT (no vocab metadata)', oldResult);

// Small delay to avoid rate limiting
await new Promise(r => setTimeout(r, 2000));

console.log('\nCalling AI with NEW prompt...');
const newRaw = await callGroq(NEW_PROMPT, TEST_ENTRY);
const newResult = parseResult(newRaw);
summarise('NEW PROMPT (with vocab metadata)', newResult);

// ── Comparison ───────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('  COMPARISON');
console.log('═'.repeat(60));
const oldCount = oldResult?.changes?.length ?? 0;
const newCount = newResult?.changes?.length ?? 0;
console.log(`  Old prompt changes: ${oldCount}`);
console.log(`  New prompt changes: ${newCount}`);
console.log(`  Difference: ${newCount - oldCount > 0 ? '+' : ''}${newCount - oldCount}`);

if (newResult) {
  const hasVocabMeta = newResult.changes?.every(c => 'headword' in c && 'pos' in c && 'worth_saving' in c);
  console.log(`  New prompt includes vocab metadata: ${hasVocabMeta ? 'YES ✓' : 'PARTIAL/NO ✗'}`);
}

if (newCount < oldCount - 2) {
  console.log('\n  ⚠️  WARNING: New prompt caught significantly fewer errors.');
  console.log('  Review the output carefully before proceeding.');
} else {
  console.log('\n  ✓ Correction quality appears stable.');
}
