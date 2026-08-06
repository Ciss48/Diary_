'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { SavedVocabItem } from '@/lib/vocab'

const TYPE_CHIPS: Record<string, { bg: string; fg: string }> = {
  grammar:    { bg: 'var(--wax-soft)',   fg: 'var(--wax)' },
  vocabulary: { bg: 'var(--brass-soft)', fg: 'var(--brass)' },
  style:      { bg: 'var(--leaf-soft)',  fg: 'var(--leaf)' },
  spelling:   { bg: 'var(--paper-2)',    fg: 'var(--ink-2)' },
}

interface Props {
  items: SavedVocabItem[]
  onRemove: (id: string) => void
  onRetryLookup: (headword: string, pos: string) => void
}

export default function VocabPanel({ items, onRemove, onRetryLookup }: Props) {
  const [collapsed, setCollapsed] = useState(false)

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

  if (items.length === 0) return null

  return (
    <section
      className="an-rise relative bg-card border border-line rounded-[14px] shadow-[var(--shadow-2)]
        px-[22px] py-[18px] pl-[26px] pb-[20px] overflow-hidden"
      style={{ backgroundImage: 'var(--grain)' }}
    >
      {/* Brass spine */}
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-brass" />

      {/* Header */}
      <div className="relative flex items-center gap-[11px] flex-wrap">
        <span className="text-[10.5px] font-medium tracking-[.15em] text-ink-3">
          VOCABULARY FROM THIS ENTRY
        </span>
        <span className="font-mono text-[11px] font-medium text-brass bg-brass-soft px-2 py-[2px] rounded-full">
          {items.length} saved
        </span>
        <span className="flex-1 h-px bg-line min-w-[20px]" />
        <Link href="/vocabulary" className="text-[12.5px] text-ink-3 hover:text-ink transition-colors duration-[160ms]">
          Open library →
        </Link>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="border border-line-2 bg-transparent text-ink-2 cursor-pointer font-sans text-[12px]
            px-3 py-[5px] rounded-[7px] transition-all duration-[160ms]
            hover:border-ink hover:text-ink"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* Cards grid */}
      {!collapsed && (
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {items.map(item => (
            <VocabCard
              key={item.id}
              item={item}
              onRemove={() => onRemove(item.id)}
              onSpeak={() => handleSpeak(item.display_form)}
              onRetry={() => onRetryLookup(item.headword, item.definition?.part_of_speech ?? '')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function VocabCard({
  item,
  onRemove,
  onSpeak,
  onRetry,
}: {
  item: SavedVocabItem
  onRemove: () => void
  onSpeak: () => void
  onRetry: () => void
}) {
  const def = item.definition
  const chip = item.change_type ? TYPE_CHIPS[item.change_type] : null
  const isLoading = !def
  const hasDef = def && def.definition

  // Check for English voice availability
  const hasVoice = typeof window !== 'undefined' &&
    window.speechSynthesis &&
    window.speechSynthesis.getVoices().some(v => v.lang.startsWith('en-'))

  return (
    <div className="relative bg-paper-2 border border-line rounded-[11px] px-4 py-[14px] flex flex-col gap-[7px] transition-colors duration-[180ms] hover:border-brass">
      {/* Row 1: headword + sound + IPA + remove */}
      <div className="flex items-baseline gap-[9px] flex-wrap">
        <span className="font-serif text-[17px] font-semibold text-ink">
          {item.display_form}
        </span>
        {hasVoice && (
          <button
            onClick={onSpeak}
            title="Hear it"
            className="border border-line-2 bg-transparent text-ink-2 cursor-pointer
              w-6 h-6 rounded-full text-[12px] leading-none transition-all duration-[160ms]
              hover:border-leaf hover:text-leaf"
          >
            ♪
          </button>
        )}
        {def?.ipa && (
          <span className="font-mono text-[12px] text-ink-3">{def.ipa}</span>
        )}
        <button
          onClick={onRemove}
          title="Remove"
          className="ml-auto border-0 bg-transparent text-ink-3 cursor-pointer
            text-[15px] leading-none px-1 py-[2px] transition-colors duration-[160ms]
            hover:text-wax"
        >
          ×
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <div className="h-3 w-16 rounded bg-line an-pulse" />
          <div className="h-3 w-48 rounded bg-line an-pulse" />
          <div className="h-3 w-40 rounded bg-line an-pulse" />
        </div>
      )}

      {/* Definition content */}
      {def && (
        <>
          {def.part_of_speech && (
            <span className="font-serif italic text-[13px] text-ink-3">
              {def.part_of_speech}
            </span>
          )}
          {hasDef ? (
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
          ) : (
            <button
              onClick={onRetry}
              className="text-[12.5px] text-wax hover:underline cursor-pointer bg-transparent border-0 font-sans self-start"
            >
              Retry lookup
            </button>
          )}
        </>
      )}

      {/* Footer: change type + "you wrote" */}
      <div className="flex items-center gap-2 mt-[3px] pt-[9px] border-t border-line">
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
      </div>
    </div>
  )
}
