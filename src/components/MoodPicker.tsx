'use client'

import type { Mood } from '@/lib/streaks'

interface Props {
  value: Mood | null
  onChange: (m: Mood | null) => void
  disabled?: boolean
}

const MOODS: { key: Mood; label: string; active: string }[] = [
  { key: 'happy',  label: 'Happy',  active: 'bg-amber-400 border-amber-400' },
  { key: 'normal', label: 'Normal', active: 'bg-stone-300 border-stone-300' },
  { key: 'sad',    label: 'Sad',    active: 'bg-blue-400 border-blue-400' },
]

export default function MoodPicker({ value, onChange, disabled }: Props) {
  function handleClick(key: Mood) {
    // Clicking the selected mood deselects it
    onChange(value === key ? null : key)
  }

  return (
    <div className="flex items-center gap-1.5" aria-label="Mood">
      {MOODS.map(({ key, label, active }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={value === key}
          disabled={disabled}
          onClick={() => handleClick(key)}
          className={[
            'h-5 w-5 rounded-full border transition-colors',
            value === key
              ? active
              : 'border-stone-300 bg-transparent hover:border-stone-400',
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
