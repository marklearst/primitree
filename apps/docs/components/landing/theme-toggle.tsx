'use client'

import { useTheme } from 'next-themes'

/** CSS keys the visible label off the root data-theme attribute, so the
 * label is correct from the first paint with no mounted-state flash; the
 * click handler reads the live attribute for the same reason. */
export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <button
      type='button'
      className='site-theme-toggle'
      aria-label='Toggle the color theme'
      onClick={() =>
        setTheme(
          document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
        )
      }>
      <span className='site-theme-toggle-to-light'>light</span>
      <span className='site-theme-toggle-to-dark'>dark</span>
    </button>
  )
}
