'use client'

import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { useEffect, useLayoutEffect, useRef } from 'react'

/** Radix hands focus to its own Dialog.Trigger when a modal closes, and the
 * search dialog opens from plain buttons and the hotkey, so focus falls to
 * body. Note who had focus as search opened and give it back on close. The
 * phone menu sits over the dialog in the top layer, so it closes first, and the
 * browser hands focus back to its trigger. */
export function SearchFocusReturn() {
  const { open } = useSearchContext()
  const opener = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    // The selector throws where the Popover API is missing; the header has no
    // menu there.
    if (CSS.supports('selector(:popover-open)')) {
      document.querySelector<HTMLElement>(':popover-open')?.hidePopover()
    }
    const active = document.activeElement
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])

  useEffect(() => {
    if (open) {
      return
    }
    const target = opener.current
    opener.current = null
    if (target?.isConnected) {
      target.focus({ preventScroll: true })
    }
  }, [open])

  return null
}
