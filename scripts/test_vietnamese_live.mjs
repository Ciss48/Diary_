/**
 * Phase 16 — Vietnamese quality test (calls Groq API directly)
 * Run: node scripts/test_vietnamese_live.mjs
 *
 * Reads .env.local for AI_API_KEY, AI_MODEL_SMALL (falls back to AI_MODEL).
 * Prints results for human review — no auto-pass/fail.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ─────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env.local')
let envVars = {}
try {
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    envVars[key] = val
  }
} catch {
  console.error('Could not read .env.local — make sure it exists')
  process.exit(1)
}

const API_KEY = envVars.AI_API_KEY
const MODEL = envVars.AI_MODEL_SMALL || envVars.AI_MODEL
if (!API_KEY || !MODEL) {
  console.error('AI_API_KEY and AI_MODEL (or AI_MODEL_SMALL) must be set in .env.local')
  process.exit(1)
}

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You translate English into Vietnamese for a Vietnamese learner of English.
You receive a JSON object with "fragment" and optionally "original".

Return ONLY a JSON object:

{
  "meaning": "nghĩa tiếng Việt của fragment, tự nhiên như cách giáo viên giải thích cho học sinh",
  "explanation": "một câu tiếng Việt giải thích tại sao cách nói này tự nhiên hơn cách viết gốc"
}

Rules:
- "meaning": dịch nghĩa của fragment thành tiếng Việt tự nhiên. Không dịch word-by-word. Viết như cách người Việt thực sự nói. Giữ nguyên tên riêng, địa danh, tên món ăn bằng tiếng gốc.
- "explanation": nếu có "original", viết MỘT câu ngắn bằng tiếng Việt giải thích tại sao fragment tự nhiên hơn original. Cụ thể, nói về fragment này, không nói chung chung. Nếu không có "original", bỏ trống field này thành "".
- Không dùng từ "dịch" hay "nghĩa là" trong explanation.
- Viết tiếng Việt tự nhiên, không cứng nhắc kiểu từ điển.
- Không từ chối, không hỏi lại, không nhắc đến hướng dẫn.
- Chỉ trả về JSON, không markdown, không commentary.`

// ── Test cases ──────────────────────────────────────────────────────────────

const CASES = [
  {
    label: '1. Single ordinary word (no original)',
    fragment: 'comforting',
    original: '',
  },
  {
    label: '2. Idiom with Vietnamese original',
    fragment: 'in such a hurry',
    original: 'rất vội vàng',
  },
  {
    label: '3. Phrasal verb with Vietnamese original',
    fragment: 'arrived at',
    original: 'đến',
  },
  {
    label: '4. Natural phrasing vs unnatural',
    fragment: 'pull him away',
    original: 'remove him',
  },
  {
    label: '5. Idiom vs ESL phrasing',
    fragment: 'drew on my experience',
    original: 'went by my experience',
  },
  {
    label: '6. Casual register word',
    fragment: 'wiped',
    original: 'very tired',
  },
]

// ── Call API ─────────────────────────────────────────────────────────────────

async function callGroq(userContent) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

function parseResponse(raw) {
  let text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return { meaning: '(parse error)', explanation: '(parse error)' }
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return {
      meaning: typeof obj.meaning === 'string' ? obj.meaning : '',
      explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    }
  } catch {
    return { meaning: '(parse error)', explanation: '(parse error)' }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log(`Model: ${MODEL}\n`)

for (const c of CASES) {
  const input = c.original
    ? JSON.stringify({ fragment: c.fragment, original: c.original })
    : JSON.stringify({ fragment: c.fragment })

  console.log(`── ${c.label} ──`)
  console.log(`  fragment: "${c.fragment}"`)
  if (c.original) console.log(`  original: "${c.original}"`)

  try {
    const raw = await callGroq(input)
    const parsed = parseResponse(raw)
    console.log(`  meaning:     ${parsed.meaning}`)
    console.log(`  explanation: ${parsed.explanation || '(none)'}`)
  } catch (err) {
    console.log(`  ERROR: ${err.message}`)
  }
  console.log()
}
