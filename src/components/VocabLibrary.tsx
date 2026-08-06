'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { LibraryVocabItem, TimeRange, KindFilter, SortOrder } from '@/lib/vocabLibrary'
import {
  filterByRange,
  filterByKind,
  searchItems,
  sortItems,
  groupItems,
  computeLibraryStats,
} from '@/lib/vocabLibrary'

const TYPE_CHIPS: Record<string, { bg: string; fg: string }> = {
  grammar:    { bg: 'var(--wax-soft)',   fg: 'var(--wax)' },
  vocabulary: { bg: 'var(--brass-soft)', fg: 'var(--brass)' },
  style:      { bg: 'var(--leaf-soft)',  fg: 'var(--leaf)' },
  spelling:   { bg: 'var(--paper-2)',    fg: 'var(--ink-2)' },
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  items: LibraryVocabItem[]
  timezone: string
  today: string
}

export default function VocabLibrary({ items: initialItems, timezone, today }: Props) {
  const [items, setItems] = useState(initialItems)
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<TimeRange>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [sort, setSort] = useState<SortOrder>('date')

  // Check for English voice
  const [hasEnglishVoice] = useState(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false
    const voices = window.speechSynthesis.getVoices()
    return voices.length === 0 || voices.some(v => v.lang.startsWith('en-'))
  })

  // Stats from ALL items (unfiltered)
  const stats = useMemo(() => computeLibraryStats(items, today, timezone), [items, today, timezone])

  // Pipeline: filter → search → sort → group
  const filtered = useMemo(() => {
    let result = filterByRange(items, range, today, timezone)
    result = filterByKind(result, kind)
    result = searchItems(result, query)
    result = sortItems(result, sort)
    return result
  }, [items, range, kind, query, sort, today, timezone])

  const groups = useMemo(() => groupItems(filtered, sort, today, timezone), [filtered, sort, today, timezone])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSpeak = useCallback((text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const englishVoice = voices.find(v => v.lang.startsWith('en-'))
    if (englishVoice) utterance.voice = englishVoice
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }, [])

  const handleToggleStatus = useCallback(async (id: string, currentStatus: 'learning' | 'known') => {
    const newStatus = currentStatus === 'learning' ? 'known' : 'learning'
    // Optimistic update
    setItems(prev => prev.map(v => v.id === id ? { ...v, status: newStatus } : v))
    try {
      const res = await fetch(`/api/vocab/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        // Revert
        setItems(prev => prev.map(v => v.id === id ? { ...v, status: currentStatus } : v))
      }
    } catch {
      setItems(prev => prev.map(v => v.id === id ? { ...v, status: currentStatus } : v))
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const backup = items
    setItems(prev => prev.filter(v => v.id !== id))
    try {
      const res = await fetch(`/api/vocab/${id}`, { method: 'DELETE' })
      if (!res.ok) setItems(backup)
    } catch {
      setItems(backup)
    }
  }, [items])

  const handleRetryLookup = useCallback(async (headword: string, pos: string) => {
    try {
      const res = await fetch('/api/vocab/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headword, pos }),
      })
      if (!res.ok) return
      const { definition } = await res.json()
      if (definition) {
        setItems(prev => prev.map(v =>
          v.headword === headword && !v.definition ? { ...v, definition } : v
        ))
      }
    } catch { /* silently fail */ }
  }, [])

  const clearFilters = useCallback(() => {
    setQuery('')
    setRange('all')
    setKind('all')
  }, [])

  const formatEntryDate = useCallback((dateStr: string) => {
    if (!dateStr) return ''
    const [, m, d] = dateStr.split('-').map(Number)
    return `${SHORT_MONTHS[m - 1]} ${d}`
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <div className="an-rise max-w-[1500px] mx-auto px-[18px] sm:px-10 py-[22px] sm:py-[34px] pb-[60px] sm:pb-[72px] flex flex-col gap-[22px]">
        {/* Header */}
        <div className="flex items-end justify-between gap-[18px] flex-wrap">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[11px] tracking-[.16em] text-ink-3">EVERY WORD YOU KEPT</span>
            <h1 className="m-0 font-serif text-[24px] sm:text-[31px] font-medium tracking-tight">
              Vocabulary library
            </h1>
          </div>
          <Link href="/" className="text-[14px] text-ink-3">← Home</Link>
        </div>

        {/* Stats bar */}
        <div className="relative rounded-2xl overflow-hidden bg-card border border-line shadow-[var(--shadow-2)]">
          <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-brass" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line">
            <StatCell label="WORDS KEPT" accent>
              <span className="font-mono text-[34px] sm:text-[44px] font-bold leading-none tracking-tight text-brass">
                {stats.total}
              </span>
              <span className="font-serif italic text-[11.5px] text-ink-3">
                {stats.last30} added in the last 30 days
              </span>
            </StatCell>
            <StatCell label="THIS WEEK">
              <span className="font-mono text-[34px] sm:text-[44px] font-bold leading-none tracking-tight">
                {stats.thisWeek}
              </span>
              <span className="font-serif italic text-[11.5px] text-ink-3">
                from {stats.thisWeekEntries} {stats.thisWeekEntries === 1 ? 'entry' : 'entries'}
              </span>
            </StatCell>
            <StatCell label="MARKED KNOWN">
              <span className="font-mono text-[34px] sm:text-[44px] font-bold leading-none tracking-tight">
                {stats.knownCount}
              </span>
              <span className="font-serif italic text-[11.5px] text-ink-3">
                tap ☆ to promote a word
              </span>
            </StatCell>
            <StatCell label="MOST COMMON KIND">
              <span className="font-serif text-[24px] font-medium leading-[1.1] capitalize">
                {stats.mostCommonKind ?? '—'}
              </span>
              {stats.mostCommonKind && (
                <span className="font-serif italic text-[11.5px] text-ink-3">
                  {stats.mostCommonKindCount} of your notes
                </span>
              )}
            </StatCell>
          </div>
        </div>

        {/* Controls */}
        <section className="relative bg-card border border-line rounded-[14px] shadow-[var(--shadow-1)] px-[18px] py-4 flex flex-col gap-[13px]">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[190px]">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search a word or meaning…"
                className="w-full border border-line-2 bg-paper-2 rounded-[9px] px-[13px] py-[10px] font-sans text-[13.5px] text-ink outline-none transition-colors duration-[160ms] focus:border-brass"
              />
            </div>
            <div className="flex gap-[2px] bg-paper-2 rounded-[9px] p-[3px]">
              <SortButton active={sort === 'date'} onClick={() => setSort('date')}>By date</SortButton>
              <SortButton active={sort === 'az'} onClick={() => setSort('az')}>A – Z</SortButton>
            </div>
          </div>
          <div className="flex items-center gap-[14px] flex-wrap border-t border-line pt-[13px]">
            <div className="flex gap-[6px] flex-wrap">
              <FilterChip active={range === 'all'} onClick={() => setRange('all')}>All time</FilterChip>
              <FilterChip active={range === '365'} onClick={() => setRange('365')}>This year</FilterChip>
              <FilterChip active={range === '30'} onClick={() => setRange('30')}>Last 30 days</FilterChip>
              <FilterChip active={range === '7'} onClick={() => setRange('7')}>Last 7 days</FilterChip>
            </div>
            <span className="w-px h-[22px] bg-line" />
            <div className="flex gap-[6px] flex-wrap">
              <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>All kinds</FilterChip>
              <FilterChip active={kind === 'vocabulary'} onClick={() => setKind('vocabulary')}>Vocabulary</FilterChip>
              <FilterChip active={kind === 'grammar'} onClick={() => setKind('grammar')}>Grammar</FilterChip>
              <FilterChip active={kind === 'style'} onClick={() => setKind('style')}>Style</FilterChip>
              <FilterChip active={kind === 'spelling'} onClick={() => setKind('spelling')}>Spelling</FilterChip>
            </div>
            <span className="ml-auto font-mono text-[12.5px] text-ink-3">
              {filtered.length} shown
            </span>
          </div>
        </section>

        {/* Empty: no items at all */}
        {items.length === 0 && (
          <div
            className="bg-card border border-dashed border-line-2 rounded-[14px] px-[30px] py-14 flex flex-col items-center gap-[14px] text-center"
            style={{ backgroundImage: 'var(--grain)' }}
          >
            <span className="font-serif italic text-[20px] text-ink-3 max-w-[32ch] leading-[1.5]" style={{ textWrap: 'pretty' as string }}>
              Your vocabulary library will grow here.
            </span>
            <span className="text-[13.5px] text-ink-3 max-w-[38ch] leading-[1.6]" style={{ textWrap: 'pretty' as string }}>
              When you read your tutor&apos;s notes, tap ✎ Note on any correction to save it.
            </span>
          </div>
        )}

        {/* Empty: filters match nothing */}
        {items.length > 0 && filtered.length === 0 && (
          <div
            className="bg-card border border-dashed border-line-2 rounded-[14px] px-[30px] py-14 flex flex-col items-center gap-[14px] text-center"
            style={{ backgroundImage: 'var(--grain)' }}
          >
            <span className="font-serif italic text-[20px] text-ink-3 max-w-[32ch] leading-[1.5]" style={{ textWrap: 'pretty' as string }}>
              Nothing here yet — no word matches that filter.
            </span>
            <button
              onClick={clearFilters}
              className="border border-line-2 bg-transparent text-ink-2 cursor-pointer font-sans text-[13.5px] px-[18px] py-[10px] rounded-[9px] transition-all duration-[160ms] hover:border-ink hover:text-ink"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Groups */}
        {filtered.length > 0 && (
          <div className="flex flex-col gap-6">
            {groups.map(group => (
              <section key={group.label} className="flex flex-col gap-[11px]">
                <div className="flex items-center gap-3">
                  <span className="font-serif text-[16px] font-medium text-ink">{group.label}</span>
                  <span className="font-mono text-[11.5px] text-ink-3">{group.count}</span>
                  <span className="flex-1 h-px bg-line" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-3">
                  {group.items.map(item => (
                    <VocabCard
                      key={item.id}
                      item={item}
                      hasVoice={hasEnglishVoice}
                      onSpeak={() => handleSpeak(item.display_form)}
                      onToggle={() => handleToggleStatus(item.id, item.status)}
                      onDelete={() => handleDelete(item.id)}
                      onRetry={() => handleRetryLookup(item.headword, item.definition?.part_of_speech ?? '')}
                      entryDateLabel={formatEntryDate(item.entry_date)}
                      entryHref={item.entry_date ? `/diary/${item.entry_date}` : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────────────

function StatCell({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-card px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-2">
      <span className="text-[10.5px] tracking-[.15em] text-ink-3">{label}</span>
      {children}
    </div>
  )
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border-0 cursor-pointer font-sans text-[12.5px] font-medium px-[14px] py-[7px] rounded-[7px] transition-all duration-[180ms] ${
        active
          ? 'bg-card text-ink shadow-[var(--shadow-1)]'
          : 'bg-transparent text-ink-3'
      }`}
    >
      {children}
    </button>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer font-sans text-[12.5px] px-[13px] py-[6px] rounded-full transition-all duration-[160ms] ${
        active
          ? 'border border-ink bg-ink text-paper'
          : 'border border-line-2 bg-transparent text-ink-2 hover:border-ink'
      }`}
    >
      {children}
    </button>
  )
}

function VocabCard({
  item,
  hasVoice,
  onSpeak,
  onToggle,
  onDelete,
  onRetry,
  entryDateLabel,
  entryHref,
}: {
  item: LibraryVocabItem
  hasVoice: boolean
  onSpeak: () => void
  onToggle: () => void
  onDelete: () => void
  onRetry: () => void
  entryDateLabel: string
  entryHref?: string
}) {
  const def = item.definition
  const chip = item.change_type ? TYPE_CHIPS[item.change_type] : null
  const isKnown = item.status === 'known'

  return (
    <div
      className="hv-lift relative bg-card border rounded-[12px] shadow-[var(--shadow-1)] px-[17px] py-[15px] flex flex-col gap-[7px] transition-all duration-[180ms]"
      style={{
        backgroundImage: 'var(--grain)',
        borderColor: isKnown ? 'var(--brass)' : 'var(--line)',
      }}
    >
      {/* Row 1: term + sound + remove */}
      <div className="flex items-baseline gap-[9px] min-w-0">
        <span className="font-serif text-[18px] font-semibold text-ink flex-1 min-w-0">
          {item.display_form}
        </span>
        {hasVoice && (
          <button
            onClick={onSpeak}
            title="Hear it"
            className="flex-none border border-line-2 bg-transparent text-ink-3 cursor-pointer w-6 h-6 rounded-full text-[12px] leading-none transition-all duration-[160ms] hover:border-leaf hover:text-leaf"
          >
            ♪
          </button>
        )}
        <button
          onClick={onDelete}
          title="Remove"
          className="flex-none border-0 bg-transparent text-ink-3 cursor-pointer text-[15px] leading-none px-1 py-[2px] transition-colors duration-[160ms] hover:text-wax"
        >
          ×
        </button>
      </div>

      {/* Row 2: IPA + POS */}
      {def && (
        <div className="flex items-baseline gap-[9px]">
          {def.ipa && <span className="font-mono text-[12px] text-ink-3">{def.ipa}</span>}
          {def.part_of_speech && <span className="font-serif italic text-[13px] text-ink-3">{def.part_of_speech}</span>}
        </div>
      )}

      {/* Row 3–4: definition + example */}
      {def && def.definition ? (
        <>
          <p className="m-0 text-[13.5px] leading-[1.6] text-ink-2" style={{ textWrap: 'pretty' as string }}>
            {def.definition}
          </p>
          {def.example && (
            <p className="m-0 mt-[2px] font-serif italic text-[13.5px] leading-[1.55] text-ink-3" style={{ textWrap: 'pretty' as string }}>
              &ldquo;{def.example}&rdquo;
            </p>
          )}
        </>
      ) : !def ? (
        <button
          onClick={onRetry}
          className="text-[12.5px] text-wax hover:underline cursor-pointer bg-transparent border-0 font-sans self-start"
        >
          Retry lookup
        </button>
      ) : null}

      {/* Footer */}
      <div className="flex items-center gap-[9px] mt-1 pt-[10px] border-t border-line flex-wrap">
        {chip && (
          <span
            className="text-[10.5px] font-medium tracking-[.06em] uppercase px-2 py-[2.5px] rounded-full"
            style={{ color: chip.fg, background: chip.bg }}
          >
            {item.change_type}
          </span>
        )}
        {item.original_form && (
          <span className="text-[12px] text-ink-3">
            you wrote &ldquo;{item.original_form}&rdquo;
          </span>
        )}
        {entryHref && entryDateLabel && (
          <Link href={entryHref} className="text-[12px] text-ink-3 hover:text-ink">
            {entryDateLabel} entry →
          </Link>
        )}
        <button
          onClick={onToggle}
          title={isKnown ? 'Known' : 'Learning'}
          className={`ml-auto flex-none cursor-pointer font-sans text-[12px] px-[10px] py-1 rounded-full flex items-center gap-[5px] transition-all duration-[160ms] ${
            isKnown
              ? 'border border-brass bg-brass-soft text-brass hover:border-brass'
              : 'border border-line-2 bg-transparent text-ink-3 hover:border-brass hover:text-brass'
          }`}
        >
          <span className="text-[12px]">{isKnown ? '★' : '☆'}</span>
          {isKnown ? 'Known' : 'Learning'}
        </button>
      </div>
    </div>
  )
}
