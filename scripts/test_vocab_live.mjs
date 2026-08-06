/**
 * Live test: verify real dictionary + LLM lookups produce good definitions.
 * Run: node scripts/test_vocab_live.mjs
 *
 * Tests 4 terms:
 * 1. "comforting" (adjective) — dictionary path
 * 2. "ring" (verb, polysemous) — dictionary path, should pick verb sense
 * 3. "arrived at" (phrasal verb) — LLM path
 * 4. "in such a hurry" (phrase) — LLM path
 */
import { readFileSync } from 'node:fs';

// ── Load env ─────────────────────────────────────────────────────────────────
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.AI_API_KEY;
const MODEL = env.AI_MODEL;

// ── Inline functions ─────────────────────────────────────────────────────────

function normaliseHeadword(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '').replace(/[^a-z0-9]+$/i, '');
}

const LLM_POS = new Set(['phrasal verb', 'idiom', 'phrase']);
function routeLookup(headword, pos) {
  if (LLM_POS.has(pos.toLowerCase())) return 'llm';
  return headword.trim().split(/\s+/).length === 1 ? 'dictionary' : 'llm';
}

function selectSense(entries, pos) {
  if (!entries || entries.length === 0) return { ipa: '', part_of_speech: pos, definition: '', example: '' };
  const allMeanings = entries.flatMap(e => e.meanings ?? []);
  const ipa = entries.flatMap(e => e.phonetics ?? []).find(p => p.text)?.text
    ?? entries.find(e => e.phonetic)?.phonetic ?? '';
  if (allMeanings.length === 0) return { ipa, part_of_speech: pos, definition: '', example: '' };
  const matched = allMeanings.find(m => m.partOfSpeech?.toLowerCase() === pos.toLowerCase());
  const meaning = matched ?? allMeanings[0];
  if (!meaning.definitions?.length) return { ipa, part_of_speech: meaning.partOfSpeech ?? pos, definition: '', example: '' };
  const def = meaning.definitions[0];
  return { ipa, part_of_speech: meaning.partOfSpeech ?? pos, definition: def.definition ?? '', example: def.example ?? '' };
}

function parseLookupResponse(raw) {
  let text = raw.trim();
  const fm = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fm) text = fm[1].trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) return null;
  text = text.slice(s, e + 1);
  let obj; try { obj = JSON.parse(text); } catch { return null; }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  return {
    ipa: typeof obj.ipa === 'string' ? obj.ipa : '',
    part_of_speech: typeof obj.part_of_speech === 'string' ? obj.part_of_speech : '',
    definition: typeof obj.definition === 'string' ? obj.definition : '',
    example: typeof obj.example === 'string' ? obj.example : '',
  };
}

const DEFINITION_PROMPT = `You are a concise English dictionary.
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
- No markdown, no commentary, just the JSON object.`;

async function lookupDictionary(headword) {
  const encoded = encodeURIComponent(headword);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch { return null; } finally { clearTimeout(timeout); }
}

async function callLLM(word) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DEFINITION_PROMPT },
          { role: 'user', content: word },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally { clearTimeout(timeout); }
}

// ── Test cases ───────────────────────────────────────────────────────────────
const TESTS = [
  { headword: 'comforting', pos: 'adjective', expectRoute: 'dictionary' },
  { headword: 'ring', pos: 'verb', expectRoute: 'dictionary' },
  { headword: 'arrived at', pos: 'phrasal verb', expectRoute: 'llm' },
  { headword: 'in such a hurry', pos: 'phrase', expectRoute: 'llm' },
];

console.log('═══════════════════════════════════════════════════');
console.log('  Live Vocabulary Lookup Test');
console.log('═══════════════════════════════════════════════════\n');

for (const t of TESTS) {
  const norm = normaliseHeadword(t.headword);
  const route = routeLookup(norm, t.pos);

  console.log(`── "${t.headword}" (${t.pos}) ──`);
  console.log(`   Route: ${route} (expected: ${t.expectRoute})`);

  let result = null;

  if (route === 'dictionary') {
    const entries = await lookupDictionary(norm);
    if (entries) {
      result = selectSense(entries, t.pos);
      console.log('   Source: dictionary API ✓');
    } else {
      console.log('   Source: dictionary API failed, falling back to LLM...');
    }
  }

  if (!result) {
    try {
      const raw = await callLLM(norm);
      result = parseLookupResponse(raw);
      console.log('   Source: LLM');
    } catch (e) {
      console.log(`   LLM failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500)); // rate limit courtesy
  }

  if (result) {
    console.log(`   IPA: ${result.ipa || '(none)'}`);
    console.log(`   POS: ${result.part_of_speech}`);
    console.log(`   Def: ${result.definition}`);
    console.log(`   Ex:  ${result.example || '(none)'}`);

    const ok = result.definition.length > 0;
    console.log(`   ${ok ? '✓ GOOD' : '✗ EMPTY DEFINITION'}`);
  } else {
    console.log('   ✗ NO RESULT');
  }
  console.log();
}
