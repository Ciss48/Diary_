// ── Vocabulary lookup utilities (server + shared pure functions) ──────────────

// ── Headword normalisation ───────────────────────────────────────────────────

export function normaliseHeadword(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '')
}

// ── Routing ──────────────────────────────────────────────────────────────────

export type LookupRoute = 'dictionary' | 'llm'

const LLM_POS = new Set(['phrasal verb', 'idiom', 'phrase'])

export function routeLookup(headword: string, pos: string): LookupRoute {
  if (LLM_POS.has(pos.toLowerCase())) return 'llm'
  const tokens = headword.trim().split(/\s+/)
  if (tokens.length === 1) return 'dictionary'
  return 'llm'
}

// ── Dictionary API types ─────────────────────────────────────────────────────

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

// ── Sense selection (Decision 3) ─────────────────────────────────────────────

export function selectSense(entries: DictEntry[], pos: string): LookupResult {
  if (!entries || entries.length === 0) {
    return { ipa: '', part_of_speech: pos || '', definition: '', example: '' }
  }

  const allMeanings: DictMeaning[] = entries.flatMap(e => e.meanings ?? [])

  // Find IPA from phonetics array first, fall back to phonetic field
  const ipa = entries
    .flatMap(e => e.phonetics ?? [])
    .find(p => p.text)?.text
    ?? entries.find(e => e.phonetic)?.phonetic
    ?? ''

  if (allMeanings.length === 0) {
    return { ipa, part_of_speech: pos || '', definition: '', example: '' }
  }

  // Try to match by pos
  const posLower = pos.toLowerCase()
  const matched = allMeanings.find(
    m => m.partOfSpeech?.toLowerCase() === posLower
  )
  const meaning = matched ?? allMeanings[0]

  if (!meaning.definitions || meaning.definitions.length === 0) {
    return { ipa, part_of_speech: meaning.partOfSpeech ?? pos, definition: '', example: '' }
  }

  const def = meaning.definitions[0]
  return {
    ipa,
    part_of_speech: meaning.partOfSpeech ?? pos,
    definition: def.definition ?? '',
    example: def.example ?? '',
  }
}

// ── Dictionary API client (server-side) ──────────────────────────────────────

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

// ── LLM definition prompt ────────────────────────────────────────────────────

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

// ── LLM definition parser (defensive) ────────────────────────────────────────

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

// ── Popover coordinate maths ─────────────────────────────────────────────────

export type PopoverPosition = {
  top: number
  left: number
  above: boolean
}

export function computePopoverPosition(
  anchorRect: { top: number; bottom: number; left: number; width: number },
  popoverWidth: number,
  popoverHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): PopoverPosition {
  const GAP = 8
  const MARGIN = 8

  // Prefer below the anchor, never overlapping it
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

// ── Saved vocab types (shared between server and client) ─────────────────────

export type SavedVocabItem = {
  id: string
  display_form: string
  original_form: string
  headword: string
  change_type: string
  status: 'learning' | 'known'
  created_at: string
  definition: {
    id: string
    ipa: string
    part_of_speech: string
    definition: string
    example: string
    source: string
  } | null
}
