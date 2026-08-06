export type ChangeType = 'grammar' | 'vocabulary' | 'style' | 'spelling';

export type Change = {
  original: string;
  corrected: string;
  type: ChangeType;
  explanation: string;
  headword?: string;
  pos?: string;
  worth_saving?: boolean;
};

export type SuggestionPayload = {
  corrected_version: string;
  changes: Change[];
  overall_feedback: string;
};

export type StoredSuggestion = {
  id: string;
  source_content: string;
  corrected_version: string;
  changes: Change[];
  overall_feedback: string;
  created_at: string;
  stage: 1 | 2;
  parent_id: string | null;
};

export type Segment = {
  text: string;
  changeIndex: number | null;
};

const VALID_TYPES = new Set<string>(['grammar', 'vocabulary', 'style', 'spelling']);

/**
 * Validate and filter a raw (unknown[]) changes array from DB or model output.
 * Used both inside parseSuggestion and when re-validating JSONB data from the DB.
 */
export function filterChanges(items: unknown[]): Change[] {
  return items
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
      const r = item as Record<string, unknown>;
      return (
        typeof r.original === 'string' &&
        typeof r.corrected === 'string' &&
        typeof r.type === 'string' &&
        VALID_TYPES.has(r.type) &&
        typeof r.explanation === 'string'
      );
    })
    .map((item) => {
      const change: Change = {
        original: item.original as string,
        corrected: item.corrected as string,
        type: item.type as ChangeType,
        explanation: item.explanation as string,
      };
      if (typeof item.headword === 'string' && item.headword) {
        change.headword = item.headword;
      }
      if (typeof item.pos === 'string' && item.pos) {
        change.pos = item.pos;
      }
      if (typeof item.worth_saving === 'boolean') {
        change.worth_saving = item.worth_saving;
      }
      return change;
    });
}

/**
 * Parse raw model output into a validated SuggestionPayload.
 * Returns null ONLY when corrected_version is missing/empty or JSON cannot be parsed.
 * Malformed individual change items are filtered out, not fatal.
 */
export function parseSuggestion(raw: string): SuggestionPayload | null {
  let text = raw.trim();

  // Strip markdown fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Trim to outermost { ... } to handle prose preamble or trailing text
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;

  const record = obj as Record<string, unknown>;

  // corrected_version: required non-empty string
  const cv = record.corrected_version;
  if (typeof cv !== 'string' || cv.trim() === '') return null;

  // changes: must be array; non-array treated as []
  const rawChanges: unknown[] = Array.isArray(record.changes) ? record.changes : [];
  const changes = filterChanges(rawChanges);

  // overall_feedback: string or default ''
  const overall_feedback =
    typeof record.overall_feedback === 'string' ? record.overall_feedback : '';

  return {
    corrected_version: cv,
    changes,
    overall_feedback,
  };
}

/**
 * Split corrected_version into segments for highlighting.
 *
 * Algorithm:
 *   cursor = 0; iterate changes in order;
 *   skip change if corrected is empty;
 *   idx = corrected.indexOf(change.corrected, cursor);
 *   idx === -1 → skip (no highlight, no error);
 *   idx > cursor → push gap segment [cursor, idx) with changeIndex null;
 *   push matched segment with changeIndex = i;
 *   cursor = idx + change.corrected.length;
 *   after loop, push remaining tail if any.
 *
 * INVARIANT: segments.map(s => s.text).join('') === corrected, for ANY input.
 * No empty segments are produced.
 */
export function segmentCorrected(corrected: string, changes: Change[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (change.corrected === '') continue;

    const idx = corrected.indexOf(change.corrected, cursor);
    if (idx === -1) continue;

    if (idx > cursor) {
      segments.push({ text: corrected.slice(cursor, idx), changeIndex: null });
    }
    segments.push({ text: change.corrected, changeIndex: i });
    cursor = idx + change.corrected.length;
  }

  if (cursor < corrected.length) {
    segments.push({ text: corrected.slice(cursor), changeIndex: null });
  }

  return segments;
}
