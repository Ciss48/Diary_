// ── Vocabulary library — pure functions for filtering, sorting, grouping, stats ──

import type { SavedVocabItem } from './vocab'

// ── Types ──────────────────────────────────────────────────────────────────────

export type LibraryVocabItem = SavedVocabItem & { entry_date: string; entry_id: string }

export type TimeRange = 'all' | '365' | '30' | '7'
export type KindFilter = 'all' | 'grammar' | 'vocabulary' | 'style' | 'spelling'
export type SortOrder = 'date' | 'az'

export type VocabGroup = {
  label: string
  count: string
  items: LibraryVocabItem[]
}

export type LibraryStats = {
  total: number
  last30: number
  thisWeek: number
  thisWeekEntries: number
  knownCount: number
  mostCommonKind: string | null
  mostCommonKindCount: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a YYYY-MM-DD string to a Date at UTC noon (safe for date arithmetic). */
function dateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/** Get the local date string (YYYY-MM-DD) from a timestamptz string in a given timezone. */
function localDate(timestamptz: string, tz: string): string {
  const d = new Date(timestamptz)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
}

/** Get the Monday of the week containing `dateStr` (YYYY-MM-DD). */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  dt.setUTCDate(dt.getUTCDate() + mondayOffset)
  return dt.toISOString().slice(0, 10)
}

/** Subtract N days from a YYYY-MM-DD date string, return YYYY-MM-DD. */
function subtractDays(dateStr: string, n: number): string {
  const ms = dateToMs(dateStr) - n * 86400000
  const dt = new Date(ms)
  return dt.toISOString().slice(0, 10)
}

/** Strip diacritics for accent-tolerant search. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Filtering ──────────────────────────────────────────────────────────────────

export function filterByRange(
  items: LibraryVocabItem[],
  range: TimeRange,
  today: string,
  tz: string,
): LibraryVocabItem[] {
  if (range === 'all') return items

  if (range === '365') {
    const year = today.slice(0, 4)
    return items.filter(item => {
      const itemDate = localDate(item.created_at, tz)
      return itemDate.slice(0, 4) === year
    })
  }

  const days = range === '30' ? 30 : 7
  const cutoff = subtractDays(today, days - 1) // inclusive: today minus (N-1) days
  return items.filter(item => {
    const itemDate = localDate(item.created_at, tz)
    return itemDate >= cutoff
  })
}

export function filterByKind(
  items: LibraryVocabItem[],
  kind: KindFilter,
): LibraryVocabItem[] {
  if (kind === 'all') return items
  return items.filter(item => item.change_type === kind)
}

// ── Search ─────────────────────────────────────────────────────────────────────

export function searchItems(
  items: LibraryVocabItem[],
  query: string,
): LibraryVocabItem[] {
  const q = stripAccents(query.trim().toLowerCase())
  if (!q) return items
  return items.filter(item => {
    const haystack = stripAccents(
      [item.display_form, item.headword, item.definition?.definition ?? '', item.vi_meaning ?? '']
        .join(' ')
        .toLowerCase()
    )
    return haystack.includes(q)
  })
}

// ── Sorting ────────────────────────────────────────────────────────────────────

export function sortItems(
  items: LibraryVocabItem[],
  order: SortOrder,
): LibraryVocabItem[] {
  const sorted = [...items]
  if (order === 'az') {
    sorted.sort((a, b) => a.display_form.toLowerCase().localeCompare(b.display_form.toLowerCase()))
  } else {
    // newest first
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return sorted
}

// ── Grouping ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDateHeading(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'

  const todayMs = dateToMs(today)
  const yesterday = new Date(todayMs - 86400000).toISOString().slice(0, 10)
  if (dateStr === yesterday) return 'Yesterday'

  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayName = WEEKDAYS[dt.getUTCDay()]
  const monthName = SHORT_MONTHS[m - 1]
  const todayYear = today.slice(0, 4)

  if (String(y) !== todayYear) {
    return `${dayName}, ${monthName} ${d}, ${y}`
  }
  return `${dayName}, ${monthName} ${d}`
}

export function groupItems(
  items: LibraryVocabItem[],
  order: SortOrder,
  today: string,
  tz: string,
): VocabGroup[] {
  if (order === 'az') {
    return [{
      label: 'All words, A – Z',
      count: items.length + (items.length === 1 ? ' word' : ' words'),
      items,
    }]
  }

  const groups: VocabGroup[] = []
  for (const item of items) {
    const itemDate = localDate(item.created_at, tz)
    const label = formatDateHeading(itemDate, today)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      groups.push({ label, count: '', items: [item] })
    }
  }

  for (const g of groups) {
    g.count = g.items.length + (g.items.length === 1 ? ' word' : ' words')
  }

  return groups
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function computeLibraryStats(
  items: LibraryVocabItem[],
  today: string,
  tz: string,
): LibraryStats {
  if (items.length === 0) {
    return { total: 0, last30: 0, thisWeek: 0, thisWeekEntries: 0, knownCount: 0, mostCommonKind: null, mostCommonKindCount: 0 }
  }

  const cutoff30 = subtractDays(today, 29) // 30 days inclusive
  const monday = mondayOf(today)

  let last30 = 0
  let thisWeek = 0
  const weekEntryIds = new Set<string>()
  let knownCount = 0
  const kindCounts = new Map<string, number>()

  for (const item of items) {
    const itemDate = localDate(item.created_at, tz)

    if (itemDate >= cutoff30) last30++
    if (itemDate >= monday) {
      thisWeek++
      weekEntryIds.add(item.entry_id ?? '')
    }
    if (item.status === 'known') knownCount++
    if (item.change_type) {
      kindCounts.set(item.change_type, (kindCounts.get(item.change_type) ?? 0) + 1)
    }
  }

  let mostCommonKind: string | null = null
  let mostCommonKindCount = 0
  for (const [kind, count] of kindCounts) {
    if (count > mostCommonKindCount || (count === mostCommonKindCount && kind < (mostCommonKind ?? ''))) {
      mostCommonKind = kind
      mostCommonKindCount = count
    }
  }

  // Remove empty entry_id if any
  weekEntryIds.delete('')

  return {
    total: items.length,
    last30,
    thisWeek,
    thisWeekEntries: weekEntryIds.size,
    knownCount,
    mostCommonKind,
    mostCommonKindCount,
  }
}
