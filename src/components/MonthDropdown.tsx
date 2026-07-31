'use client'

import { useRouter } from 'next/navigation'

type Props = {
  currentMonthStr: string
  options: { value: string; label: string; disabled: boolean }[]
}

export default function MonthDropdown({ currentMonthStr, options }: Props) {
  const router = useRouter()

  return (
    <div className="relative flex items-center">
      <select
        value={currentMonthStr}
        onChange={(e) => router.push(`/?hview=month&hm=${e.target.value}`)}
        className="appearance-none border border-stone-200 bg-white rounded-lg text-[13.5px] font-medium text-stone-800 pl-3 pr-8 h-[34px] cursor-pointer hover:border-stone-800 transition-colors min-w-[152px]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="absolute right-3 w-2 h-2 border-r-[1.6px] border-b-[1.6px] border-stone-500 -translate-y-[2px] rotate-45 pointer-events-none" />
    </div>
  )
}
