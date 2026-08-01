'use client'

import type { Mood } from '@/lib/streaks'

interface Props {
  value: Mood | null
  onChange: (m: Mood | null) => void
  disabled?: boolean
}

const MOODS: { key: Mood; glyph: string }[] = [
  { key: 'happy',  glyph: '☀' },
  { key: 'normal', glyph: '◐' },
  { key: 'sad',    glyph: '☂' },
]

export default function MoodPicker({ value, onChange, disabled }: Props) {
  function handleClick(key: Mood) {
    onChange(value === key ? null : key)
  }

  return (
    <div className="flex items-center gap-1.5 pl-1.5" aria-label="Mood">
      {MOODS.map(({ key, glyph }) => {
        const on = value === key
        return (
          <button
            key={key}
            type="button"
            title={key}
            aria-label={key}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => handleClick(key)}
            className={[
              'w-[34px] h-[34px] rounded-full flex items-center justify-center',
              'text-[15px] leading-none cursor-pointer',
              'transition-all duration-[180ms] ease-[cubic-bezier(.2,.7,.3,1)]',
              on
                ? 'bg-brass-soft border-[1.5px] border-brass scale-[1.06]'
                : 'bg-transparent border-[1.5px] border-line-2 text-ink-3',
              disabled ? 'opacity-40 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {glyph}
          </button>
        )
      })}
    </div>
  )
}
