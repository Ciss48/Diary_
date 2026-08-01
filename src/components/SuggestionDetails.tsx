'use client'

import type { DiffChange } from '@/lib/diff'

const TYPE_CHIPS: Record<string, { bg: string; fg: string }> = {
  grammar:    { bg: 'var(--wax-soft)',   fg: 'var(--wax)' },
  vocabulary: { bg: 'var(--brass-soft)', fg: 'var(--brass)' },
  style:      { bg: 'var(--leaf-soft)',  fg: 'var(--leaf)' },
  spelling:   { bg: 'var(--paper-2)',    fg: 'var(--ink-2)' },
}

interface Props {
  changes: DiffChange[]
  feedback: string
  contentDrifted: boolean
  selectedChange: number | null
  onSelectChange: (idx: number) => void
}

export default function SuggestionDetails({
  changes,
  feedback,
  contentDrifted,
  selectedChange,
  onSelectChange,
}: Props) {
  return (
    <div className="flex flex-col gap-[11px] mt-5">
      {contentDrifted && (
        <p className="text-[12px] text-brass bg-brass-soft border border-brass px-3 py-2 rounded-lg">
          Your entry has changed since this suggestion.
        </p>
      )}

      {changes.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2.5 mb-[11px]">
            <span className="text-[10.5px] font-medium tracking-[.15em] text-ink-3 uppercase">
              MARGIN NOTES
            </span>
            <span className="font-serif italic text-[13px] text-ink-3">
              tap a highlight above to jump here
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-2.5">
            {changes.map((change, idx) => {
              const on = selectedChange === idx
              const chip = change.type ? TYPE_CHIPS[change.type] : null
              return (
                <div
                  key={idx}
                  onClick={() => onSelectChange(idx)}
                  className={[
                    'relative rounded-[11px] px-[15px] py-[13px] pl-[17px] cursor-pointer overflow-hidden',
                    'transition-all duration-[180ms] ease-[cubic-bezier(.2,.7,.3,1)]',
                    on
                      ? 'bg-brass-soft border border-brass shadow-[var(--shadow-2)]'
                      : 'bg-card border border-line shadow-[var(--shadow-1)]',
                  ].join(' ')}
                >
                  {/* Left accent spine */}
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-[180ms] ${
                      on ? 'bg-brass' : 'bg-transparent'
                    }`}
                  />
                  <div className="flex items-baseline gap-[9px] flex-wrap">
                    {change.original && (
                      <span
                        className="font-serif text-[15px] text-ink-3"
                        style={{ textDecoration: 'line-through', textDecorationColor: 'var(--wax)' }}
                      >
                        {change.original}
                      </span>
                    )}
                    <span className="text-ink-3 text-[13px]">→</span>
                    <span className="font-serif text-[15px] font-medium text-ink">
                      {change.corrected}
                    </span>
                    {chip && (
                      <span
                        className="ml-auto text-[10.5px] font-medium tracking-[.06em] uppercase px-2 py-[2.5px] rounded-full shrink-0"
                        style={{ color: chip.fg, background: chip.bg }}
                      >
                        {change.type}
                      </span>
                    )}
                  </div>
                  {change.explanation && (
                    <p className="mt-[7px] text-[13px] leading-[1.55] text-ink-2" style={{ textWrap: 'pretty' as string }}>
                      {change.explanation}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {feedback && (
        <section
          className="relative rounded-[14px] bg-card border border-line shadow-[var(--shadow-2)]
            px-[26px] py-[22px] pl-[30px] overflow-hidden mt-2"
          style={{ backgroundImage: 'var(--grain)' }}
        >
          {/* Brass spine */}
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-brass" />
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="text-[10.5px] font-medium tracking-[.15em] text-ink-3 uppercase">
              A NOTE FROM YOUR TUTOR
            </span>
            <span className="flex-1 h-px bg-line" />
          </div>
          <p className="m-0 font-serif text-[16px] leading-[1.72] text-ink max-w-[78ch]" style={{ textWrap: 'pretty' as string }}>
            {feedback}
          </p>
          <p className="mt-[14px] m-0 font-serif italic text-[14px] text-ink-3">
            — see you tomorrow, same page
          </p>
        </section>
      )}
    </div>
  )
}
