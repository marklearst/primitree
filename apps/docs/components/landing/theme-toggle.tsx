'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const target = mounted && resolvedTheme === 'light' ? 'dark' : 'light'

  return (
    <button
      type='button'
      className='site-theme-toggle'
      aria-label={`Switch to the ${target} theme`}
      onClick={() => setTheme(target)}>
      {target}
    </button>
  )
}
