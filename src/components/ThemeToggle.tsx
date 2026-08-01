'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = localStorage.getItem('diary-theme')
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved)
      document.documentElement.dataset.theme = saved
    }
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('diary-theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="hv-out border border-line-2 bg-transparent text-ink-2 cursor-pointer font-sans text-[12.5px] px-[13px] py-[6px] rounded-lg"
    >
      {theme === 'light' ? '☾ Dark' : '☀ Light'}
    </button>
  )
}
