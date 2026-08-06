'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { fetchEntry, saveEntry, updateMood, ensureEntry, type Entry } from '@/lib/entries'
import { countWords, getTodayInTimezone } from '@/lib/dates'
import type { Mood } from '@/lib/streaks'
import MoodPicker from '@/components/MoodPicker'
import { filterChanges, type StoredSuggestion } from '@/lib/suggestions'
import { diffTexts, diffToSegments, diffToOriginalSegments, buildDiffChanges } from '@/lib/diff'
import ImprovedVersionPane from '@/components/ImprovedVersionPane'
import SuggestionDetails from '@/components/SuggestionDetails'
import SuggestionPanel from '@/components/SuggestionPanel'
import OriginalVersionPane from '@/components/OriginalVersionPane'
import PhotoStrip from '@/components/PhotoStrip'
import VocabPanel from '@/components/VocabPanel'
import type { SavedVocabItem } from '@/lib/vocab'

interface Props {
  date: string       // 'YYYY-MM-DD'
  timezone: string
  initialStage1: StoredSuggestion | null
  initialStage2: StoredSuggestion | null
  initialRemaining: number
  initialSavedVocab: SavedVocabItem[]
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Thin, muted scrollbar for both panes.
const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink-3/30 ' +
  '[scrollbar-width:thin]'

const PROMPTS = [
  ['What surprised me today', 'What surprised me today was '],
  ['One person I talked to', 'Today I talked to '],
  ['Something I want to fix', 'One thing I want to fix is '],
]

export default function DiaryEditor({ date, timezone, initialStage1, initialStage2, initialRemaining, initialSavedVocab }: Props) {
  // ── Entry state ──────────────────────────────────────────────────────────
  const [content, setContent] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isBackfill, setIsBackfill] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mood, setMood] = useState<Mood | null>(null)
  const [photoCount, setPhotoCount] = useState(0)

  const lastSavedContent = useRef<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moodRef = useRef<Mood | null>(null)
  const entryExistsRef = useRef<boolean>(false)

  const isBackfillDate = date < getTodayInTimezone(timezone)

  // ── Suggestion state (two stages) ───────────────────────────────────────
  const [stage1, setStage1] = useState<StoredSuggestion | null>(initialStage1)
  const [stage2, setStage2] = useState<StoredSuggestion | null>(initialStage2)
  const [activeStage, setActiveStage] = useState<1 | 2>(initialStage2 ? 2 : 1)
  const [remaining, setRemaining] = useState(initialRemaining)
  const [loadingStage, setLoadingStage] = useState<1 | 2 | null>(null)
  const [sugError, setSugError] = useState<string | null>(null)
  const [selectedChange, setSelectedChange] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // ── Vocabulary state ─────────────────────────────────────────────────────
  const [savedVocab, setSavedVocab] = useState<SavedVocabItem[]>(initialSavedVocab)

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeSuggestion = activeStage === 2 && stage2 ? stage2 : stage1
  const hasSuggestionVisible = activeSuggestion !== null && !dismissed

  // Diff source/target depend on active stage
  const diffSpans = useMemo(() => {
    if (!activeSuggestion) return []
    if (activeStage === 2 && stage2 && stage1) {
      return diffTexts(stage1.corrected_version, stage2.corrected_version)
    }
    return diffTexts(activeSuggestion.source_content, activeSuggestion.corrected_version)
  }, [activeSuggestion, activeStage, stage1, stage2])

  const safeChanges = activeSuggestion ? filterChanges(activeSuggestion.changes as unknown[]) : []
  const segments = useMemo(() => diffToSegments(diffSpans), [diffSpans])
  const originalSegments = useMemo(() => diffToOriginalSegments(diffSpans), [diffSpans])
  const diffChanges = useMemo(() => buildDiffChanges(diffSpans, safeChanges), [diffSpans, safeChanges])

  // Which change indices have been saved to vocabulary
  const savedChangeIndices = useMemo(() => {
    if (savedVocab.length === 0) return new Set<number>()
    const headwordSet = new Set(savedVocab.map(v => v.headword))
    const indices = new Set<number>()
    diffChanges.forEach((dc, idx) => {
      if (dc.headword && headwordSet.has(dc.headword)) indices.add(idx)
    })
    return indices
  }, [savedVocab, diffChanges])

  const stage1Drifted = stage1 != null && content.trim() !== stage1.source_content.trim()
  const contentDrifted = activeSuggestion != null && (
    activeStage === 1
      ? content.trim() !== activeSuggestion.source_content.trim()
      : stage1Drifted // stage 2 is stale if stage 1 is stale
  )
  const canRequestStage1 = content.trim() !== '' && remaining > 0 && loadingStage === null
  const canRequestStage2 = stage1 !== null && !stage1Drifted && remaining > 0 && loadingStage === null

  // ── Load entry ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEntry(date)
      .then((entry: Entry | null) => {
        if (entry) {
          setContent(entry.content)
          setWordCount(entry.word_count)
          setIsBackfill(entry.is_backfill)
          lastSavedContent.current = entry.content
          const initialMood = entry.mood ?? null
          setMood(initialMood)
          moodRef.current = initialMood
          entryExistsRef.current = true
        } else {
          lastSavedContent.current = ''
          setIsBackfill(isBackfillDate)
          entryExistsRef.current = false
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [date, isBackfillDate])

  // ── Save logic ───────────────────────────────────────────────────────────
  const save = useCallback(
    async (text: string) => {
      if (text === lastSavedContent.current) return
      setSaveStatus('saving')
      try {
        const moodForInsert = entryExistsRef.current ? undefined : moodRef.current
        const saved = await saveEntry(date, text, timezone, moodForInsert)
        lastSavedContent.current = saved.content
        setIsBackfill(saved.is_backfill)
        entryExistsRef.current = true
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    },
    [date, timezone]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setContent(text)
    setWordCount(countWords(text))
    setSaveStatus('idle')
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => save(text), 1500)
  }

  const handleBlur = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    save(content)
  }

  const handleRetry = () => save(content)

  const handleMoodChange = useCallback(
    async (newMood: Mood | null) => {
      setMood(newMood)
      moodRef.current = newMood
      setSaveStatus('saving')
      try {
        const result = await updateMood(date, newMood, timezone)
        entryExistsRef.current = true
        setIsBackfill(result.is_backfill)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    },
    [date, timezone]
  )

  // ── Vocabulary callbacks ─────────────────────────────────────────────────
  const handleVocabSave = useCallback(async (changeIndex: number, fragment: string) => {
    const dc = diffChanges[changeIndex]
    if (!dc) return

    try {
      // 1. Save the vocab item
      const res = await fetch('/api/vocab/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_date: date,
          display_form: fragment,
          original_form: dc.original,
          headword: dc.headword ?? fragment,
          change_type: dc.type ?? 'vocabulary',
        }),
      })
      if (!res.ok) return
      const { saved } = await res.json() as { saved: SavedVocabItem }
      setSavedVocab(prev => [...prev, saved])

      // 2. Trigger async lookup (fire-and-forget, updates definition)
      fetch('/api/vocab/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headword: dc.headword ?? fragment,
          pos: dc.pos ?? '',
        }),
      }).then(async lookupRes => {
        if (!lookupRes.ok) return
        const { definition } = await lookupRes.json()
        if (definition) {
          setSavedVocab(prev => prev.map(v =>
            v.headword === (dc.headword ?? fragment) && !v.definition
              ? { ...v, definition }
              : v
          ))
        }
      }).catch(() => {})
    } catch {
      // silently fail
    }
  }, [diffChanges, date])

  const handleVocabRemove = useCallback(async (changeIndex: number) => {
    const dc = diffChanges[changeIndex]
    if (!dc) return
    const item = savedVocab.find(v => v.headword === dc.headword)
    if (!item) return

    try {
      const res = await fetch(`/api/vocab/${item.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setSavedVocab(prev => prev.filter(v => v.id !== item.id))
    } catch {
      // silently fail
    }
  }, [diffChanges, savedVocab])

  const handleVocabPanelRemove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/vocab/${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setSavedVocab(prev => prev.filter(v => v.id !== id))
    } catch {
      // silently fail
    }
  }, [])

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
        setSavedVocab(prev => prev.map(v =>
          v.headword === headword && !v.definition
            ? { ...v, definition }
            : v
        ))
      }
    } catch {
      // silently fail
    }
  }, [])

  // ── Suggestion fetch ─────────────────────────────────────────────────────
  const handleRequestStage = useCallback(async (stage: 1 | 2) => {
    setLoadingStage(stage)
    setSugError(null)
    setSelectedChange(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, stage }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSugError(json?.error ?? 'Something went wrong.')
        return
      }
      const sug = json.suggestion as StoredSuggestion
      if (stage === 1) {
        setStage1(sug)
        setStage2(null) // invalidate stage 2 when stage 1 reruns
        setActiveStage(1)
      } else {
        setStage2(sug)
        setActiveStage(2)
      }
      setRemaining(json.remaining as number)
      setDismissed(false)
      setSelectedChange(null)
      setEditMode(false)
    } catch {
      setSugError('Could not reach the server.')
    } finally {
      setLoadingStage(null)
    }
  }, [date])

  const handleRequestStage1 = useCallback(() => handleRequestStage(1), [handleRequestStage])
  const handleRequestStage2 = useCallback(() => handleRequestStage(2), [handleRequestStage])

  const handleSelectChange = useCallback((idx: number) => {
    setSelectedChange((prev) => (prev === idx ? null : idx))
  }, [])

  const handleSetContent = useCallback((text: string) => {
    setContent(text)
    setWordCount(countWords(text))
  }, [])

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-serif italic text-ink-3 text-[15px]">Loading…</p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const blank = content.trim().length === 0
  const showStageTabs = stage1 !== null && stage2 !== null && !dismissed

  return (
    <main className="min-h-screen">
      <div className="mx-auto px-4 xl:px-8 py-10">
        {/* Header — full width */}
        <div className="mb-5 flex items-start justify-between gap-4 max-w-5xl xl:mx-auto flex-wrap">
          <div className="flex flex-col gap-[11px]">
            <h1 className="m-0 font-serif text-[24px] sm:text-[31px] font-medium tracking-tight">
              {formatDate(date)}
            </h1>
            <div className="flex items-center gap-2.5 flex-wrap">
              {(isBackfill || isBackfillDate) && (
                <span className="text-[11px] font-medium tracking-[.1em] text-wax bg-wax-soft border border-wax rounded-full px-2.5 py-[3px] uppercase">
                  BACKFILLED
                </span>
              )}
              <MoodPicker value={mood} onChange={handleMoodChange} />
              {photoCount > 0 && (
                <span className="text-[12.5px] text-ink-3">
                  {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0 mt-1">
            <SaveIndicator status={saveStatus} onRetry={handleRetry} />
            <a href="/" className="text-[14px] text-ink-3">← Home</a>
          </div>
        </div>

        {/* PhotoStrip provides 3-column scatter on xl+ */}
        <PhotoStrip
          entryDate={date}
          timezone={timezone}
          onPhotoCountChange={setPhotoCount}
        >
          {/* ── Vocabulary panel ─────────────────────────────────────── */}
          {savedVocab.length > 0 && (
            <VocabPanel
              items={savedVocab}
              onRemove={handleVocabPanelRemove}
              onRetryLookup={handleRetryLookup}
            />
          )}

          {/* ── Stage tabs ─────────────────────────────────────────── */}
          {showStageTabs && (
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => { setActiveStage(1); setSelectedChange(null) }}
                className={`text-[12px] font-medium tracking-[.05em] px-3.5 py-[7px] rounded-lg border cursor-pointer transition-colors duration-[160ms] ${
                  activeStage === 1
                    ? 'bg-wax-soft border-wax text-wax'
                    : 'bg-transparent border-line text-ink-3 hover:text-ink'
                }`}
              >
                Corrections
              </button>
              <button
                onClick={() => { setActiveStage(2); setSelectedChange(null) }}
                className={`text-[12px] font-medium tracking-[.05em] px-3.5 py-[7px] rounded-lg border cursor-pointer transition-colors duration-[160ms] ${
                  activeStage === 2
                    ? 'bg-leaf-soft border-leaf text-leaf'
                    : 'bg-transparent border-line text-ink-3 hover:text-ink'
                }`}
              >
                Style improvements
              </button>
            </div>
          )}

          {/* ── Editor area ───────────────────────────────────────── */}
          {hasSuggestionVisible ? (
            <div className="an-rise grid md:grid-cols-2 gap-[18px] md:h-[60vh] md:min-h-[400px] overflow-hidden">
              {/* Left column — read-only with red marks, or textarea in edit mode */}
              {editMode || activeStage === 2 ? (
                <div className="flex flex-col h-[45vh] md:h-full min-h-0">
                  <div className="flex items-baseline justify-between mb-2 shrink-0">
                    <span className="text-[10.5px] font-medium tracking-[.15em] text-ink-3 uppercase">
                      {activeStage === 2 ? 'CORRECTED VERSION' : 'YOUR ENTRY'}
                    </span>
                    <span className="font-mono text-[12px] text-ink-3">
                      {wordCount} words
                    </span>
                  </div>
                  <PaperSurface spine="wax" className="flex-1 min-h-0 flex flex-col">
                    <textarea
                      value={activeStage === 2 && stage1 ? stage1.corrected_version : content}
                      onChange={activeStage === 1 ? handleChange : undefined}
                      onBlur={activeStage === 1 ? handleBlur : undefined}
                      readOnly={activeStage === 2}
                      placeholder="Write your diary entry here…"
                      spellCheck={activeStage === 1}
                      className={`flex-1 min-h-0 w-full resize-none bg-transparent border-0 outline-none
                        pl-[44px] sm:pl-[44px] pr-[26px] py-[26px]
                        font-serif text-[16.5px] sm:text-[17.5px] leading-[1.78] text-ink
                        caret-wax overflow-y-auto ${SCROLLBAR}
                        ${activeStage === 2 ? 'cursor-default' : ''}`}
                    />
                  </PaperSurface>
                </div>
              ) : (
                <OriginalVersionPane
                  segments={originalSegments}
                  selectedChange={selectedChange}
                  onSelectChange={handleSelectChange}
                  onEdit={() => setEditMode(true)}
                  wordCount={wordCount}
                  stageLabel="YOUR ENTRY"
                />
              )}

              {/* Right column */}
              <ImprovedVersionPane
                key={activeSuggestion!.id}
                segments={segments}
                changesCount={diffChanges.length}
                correctedVersion={activeSuggestion!.corrected_version}
                selectedChange={selectedChange}
                onSelectChange={handleSelectChange}
                onDismiss={() => setDismissed(true)}
                savedChangeIndices={savedChangeIndices}
                onVocabSave={handleVocabSave}
                onVocabRemove={handleVocabRemove}
              />
            </div>
          ) : (
            <div className="an-rise">
              <PaperSurface spine="wax" className="relative" showEmptyState={blank} onPromptClick={handleSetContent}>
                <textarea
                  value={content}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Write your diary entry here…"
                  spellCheck
                  className={`relative w-full h-[60vh] min-h-[400px] resize-none bg-transparent border-0 outline-none
                    pl-[26px] sm:pl-[44px] pr-[34px] py-[34px]
                    font-serif text-[16.5px] sm:text-[17.5px] leading-[1.78] text-ink
                    caret-wax overflow-y-auto ${SCROLLBAR}`}
                />
              </PaperSurface>
            </div>
          )}

          {/* Suggest buttons + counter */}
          <SuggestionPanel
            loadingStage={loadingStage}
            error={sugError}
            remaining={remaining}
            canRequestStage1={canRequestStage1}
            canRequestStage2={canRequestStage2}
            hasStage1={stage1 !== null}
            stage1Drifted={stage1Drifted}
            onRequestStage1={handleRequestStage1}
            onRequestStage2={handleRequestStage2}
          />

          {/* Changes list + feedback */}
          {hasSuggestionVisible && (
            <SuggestionDetails
              changes={diffChanges}
              feedback={activeSuggestion!.overall_feedback}
              contentDrifted={contentDrifted}
              selectedChange={selectedChange}
              onSelectChange={handleSelectChange}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 px-1">
            {hasSuggestionVisible ? (
              <span />
            ) : (
              <span className="font-mono text-[12.5px] text-ink-3">
                {wordCount} words
              </span>
            )}
            {!hasSuggestionVisible && (
              <SaveIndicator status={saveStatus} onRetry={handleRetry} />
            )}
          </div>
        </PhotoStrip>
      </div>
    </main>
  )
}

// ── Paper surface card ──────────────────────────────────────────────────────

function PaperSurface({
  spine,
  className = '',
  children,
  showEmptyState,
  onPromptClick,
}: {
  spine: 'wax' | 'leaf'
  className?: string
  children: React.ReactNode
  showEmptyState?: boolean
  onPromptClick?: (text: string) => void
}) {
  const spineColor = spine === 'wax' ? 'bg-wax' : 'bg-leaf'
  const ruleColor = spine === 'wax' ? 'bg-wax' : 'bg-leaf'

  return (
    <div
      className={`relative rounded-[4px] bg-card border border-line shadow-[var(--shadow-2)] overflow-hidden ${className}`}
      style={{ backgroundImage: 'var(--grain)' }}
    >
      {/* Spine */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${spineColor}`} />
      {/* Margin rule */}
      <span
        className={`absolute top-0 bottom-0 w-px ${ruleColor} opacity-[.22]`}
        style={{ left: '30px' }}
      />
      {children}
      {/* Empty state overlay */}
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[18px] pointer-events-none p-10 text-center">
          <span className="font-serif italic text-[21px] text-ink-3 max-w-[34ch] leading-[1.5]" style={{ textWrap: 'pretty' as string }}>
            The page is waiting. Three sentences count as a day.
          </span>
          <div className="flex gap-2 flex-wrap justify-center pointer-events-auto">
            {PROMPTS.map(([label, seed]) => (
              <button
                key={label}
                onClick={() => onPromptClick?.(seed)}
                className="border border-dashed border-line-2 bg-transparent text-ink-2
                  font-serif italic text-[14px] px-[15px] py-[9px] rounded-full cursor-pointer
                  transition-all duration-[180ms] hover:border-ink hover:text-ink"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Save status indicator ───────────────────────────────────────────────────

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className="flex items-center gap-[7px] text-[12.5px] text-ink-3">
      {status === 'saving' && (
        <>
          <span className="an-pulse w-[7px] h-[7px] rounded-full bg-leaf" />
          Saving…
        </>
      )}
      {status === 'saved' && (
        <>
          <span className="an-pulse w-[7px] h-[7px] rounded-full bg-leaf" />
          Saved · just now
        </>
      )}
      {status === 'error' && (
        <button onClick={onRetry} className="text-wax hover:underline cursor-pointer bg-transparent border-0 font-sans text-[12.5px]">
          Error — retry
        </button>
      )}
    </span>
  )
}
