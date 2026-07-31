'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchEntry, saveEntry, updateMood, ensureEntry, type Entry } from '@/lib/entries'
import { countWords, getTodayInTimezone } from '@/lib/dates'
import type { Mood } from '@/lib/streaks'
import MoodPicker from '@/components/MoodPicker'
import { filterChanges, type StoredSuggestion } from '@/lib/suggestions'
import { diffTexts, diffToSegments, buildDiffChanges } from '@/lib/diff'
import ImprovedVersionPane from '@/components/ImprovedVersionPane'
import SuggestionDetails from '@/components/SuggestionDetails'
import SuggestionPanel from '@/components/SuggestionPanel'
import PhotoStrip from '@/components/PhotoStrip'

interface Props {
  date: string       // 'YYYY-MM-DD'
  timezone: string
  initialSuggestion: StoredSuggestion | null
  initialRemaining: number
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

// Thin, muted scrollbar — matches ImprovedVersionPane so both panes look identical.
const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 ' +
  '[scrollbar-width:thin]'

// Shared textarea base (no sizing).
const TEXTAREA_BASE =
  'resize-none rounded-lg border border-gray-200 bg-white px-5 py-4 ' +
  'text-gray-800 text-base leading-relaxed placeholder:text-gray-300 ' +
  `focus:outline-none focus:ring-2 focus:ring-gray-300 overflow-y-auto ${SCROLLBAR}`

// Single-column: fixed height matching two-column mode so layout never jumps.
const TEXTAREA_SINGLE = `w-full h-[60vh] min-h-[400px] ${TEXTAREA_BASE}`

// Two-column left pane: fills the flex container (flex-1 + min-h-0 prevents overflow).
const TEXTAREA_COLUMN = `flex-1 min-h-0 ${TEXTAREA_BASE}`

export default function DiaryEditor({ date, timezone, initialSuggestion, initialRemaining }: Props) {
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

  // ── Suggestion state ─────────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState<StoredSuggestion | null>(initialSuggestion)
  const [remaining, setRemaining] = useState(initialRemaining)
  const [sugLoading, setSugLoading] = useState(false)
  const [sugError, setSugError] = useState<string | null>(null)
  const [selectedChange, setSelectedChange] = useState<number | null>(null)
  // dismissed = true hides the two-column view without deleting the suggestion.
  // Refreshing resets this to false so the persisted suggestion reappears.
  const [dismissed, setDismissed] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────────────
  const safeChanges = suggestion ? filterChanges(suggestion.changes as unknown[]) : []
  const diffSpans = suggestion ? diffTexts(suggestion.source_content, suggestion.corrected_version) : []
  const segments = suggestion ? diffToSegments(diffSpans) : []
  const diffChanges = suggestion ? buildDiffChanges(diffSpans, safeChanges) : []
  const hasSuggestionVisible = suggestion !== null && !dismissed
  const contentDrifted =
    suggestion != null && content.trim() !== suggestion.source_content.trim()
  const canRequest = content.trim() !== '' && remaining > 0 && !sugLoading

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

  // ── Suggestion fetch ─────────────────────────────────────────────────────
  const handleSuggestRequest = useCallback(async () => {
    setSugLoading(true)
    setSugError(null)
    setSelectedChange(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSugError(json?.error ?? 'Something went wrong.')
        return
      }
      setSuggestion(json.suggestion as StoredSuggestion)
      setRemaining(json.remaining as number)
      setDismissed(false)
      setSelectedChange(null)
    } catch {
      setSugError('Could not reach the server.')
    } finally {
      setSugLoading(false)
    }
  }, [date])

  // Toggle: clicking the same index deselects; clicking a new one selects it.
  const handleSelectChange = useCallback((idx: number) => {
    setSelectedChange((prev) => (prev === idx ? null : idx))
  }, [])

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto px-4 xl:px-8 py-10">
        {/* Header — full width, above the photo scatter layout */}
        <div className="mb-6 flex items-start justify-between gap-4 max-w-5xl xl:mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{formatDate(date)}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(isBackfill || isBackfillDate) && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  backfilled
                </span>
              )}
              <MoodPicker value={mood} onChange={handleMoodChange} />
              {photoCount > 0 && (
                <span className="text-sm text-gray-500">
                  {photoCount} {photoCount === 1 ? 'photo' : 'photos'} · {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </span>
              )}
            </div>
          </div>
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 shrink-0 mt-1"
          >
            ← Home
          </a>
        </div>

        {/* PhotoStrip provides the 3-column scatter layout on xl+
            and a horizontal scroll strip on smaller screens.
            All editor content is passed as children → center column. */}
        <PhotoStrip
          entryDate={date}
          timezone={timezone}
          onPhotoCountChange={setPhotoCount}
        >
          {/* ── Editor area ───────────────────────────────────────── */}
          {hasSuggestionVisible ? (
            // Two-column: fixed height on desktop, children fill it.
            // Mobile: single-column stack; each child owns its own height (h-[45vh]).
            <div className="grid md:grid-cols-2 gap-4 md:h-[60vh] md:min-h-[400px] overflow-hidden">
              {/* Left column: flex column so header + textarea fill the space */}
              <div className="flex flex-col h-[45vh] md:h-full min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Your Entry
                  </span>
                  <span className="text-xs text-gray-400">
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Write your diary entry here…"
                  className={TEXTAREA_COLUMN}
                  spellCheck
                />
              </div>

              {/* Right column: key forces remount on new suggestion → scrolls to top */}
              <ImprovedVersionPane
                key={suggestion.id}
                segments={segments}
                changesCount={diffChanges.length}
                correctedVersion={suggestion.corrected_version}
                selectedChange={selectedChange}
                onSelectChange={handleSelectChange}
                onDismiss={() => setDismissed(true)}
              />
            </div>
          ) : (
            // Single column: same fixed height as two-column mode → no layout jump.
            <textarea
              value={content}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Write your diary entry here…"
              className={TEXTAREA_SINGLE}
              spellCheck
            />
          )}

          {/* Suggest button + counter + error/loading state */}
          <SuggestionPanel
            loading={sugLoading}
            error={sugError}
            remaining={remaining}
            canRequest={canRequest}
            onRequest={handleSuggestRequest}
          />

          {/* Changes list + feedback — full width, only when two-column view is active */}
          {hasSuggestionVisible && (
            <SuggestionDetails
              changes={diffChanges}
              feedback={suggestion!.overall_feedback}
              contentDrifted={contentDrifted}
              selectedChange={selectedChange}
              onSelectChange={handleSelectChange}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 px-1">
            {/* Word count lives in the left column header when two columns are showing */}
            {hasSuggestionVisible ? (
              <span />
            ) : (
              <span className="text-xs text-gray-400">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
            )}
            <span className="text-xs">
              {saveStatus === 'saving' && (
                <span className="text-gray-400">Saving…</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-green-600">Saved</span>
              )}
              {saveStatus === 'error' && (
                <button onClick={handleRetry} className="text-red-500 hover:underline">
                  Error — retry
                </button>
              )}
            </span>
          </div>
        </PhotoStrip>
      </div>
    </main>
  )
}
