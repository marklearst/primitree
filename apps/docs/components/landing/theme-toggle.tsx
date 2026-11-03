'use client'

import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from '@/components/icons'

/** The button shows the theme it switches to, as an icon with a matching
 * accessible name. CSS keys both off the root data-theme attribute, so they
 * are correct from the first paint with no mounted-state flash; the click
 * handler reads the live attribute for the same reason. In the header it is
 * one of the ghost icon controls; in the phone menu it is a labeled row. */
export function ThemeToggle({
  variant = 'icon',
}: {
  variant?: 'icon' | 'menu'
}) {
  const { setTheme } = useTheme()
  const label = variant === 'menu' ? undefined : 'sr-only'

  return (
    <button
      type='button'
      className={variant === 'menu' ? 'site-menu-toggle' : 'site-icon-control'}
      title={variant === 'menu' ? undefined : 'Switch the color theme'}
      onClick={() =>
        setTheme(
          document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
        )
      }>
      <span className='site-theme-toggle-to-light'>
        <SunIcon size={18} />
        <span className={label}>Switch to the light theme</span>
      </span>
      <span className='site-theme-toggle-to-dark'>
        <MoonIcon size={18} />
        <span className={label}>Switch to the dark theme</span>
      </span>
    </button>
  )
}
