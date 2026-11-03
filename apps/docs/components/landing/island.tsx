'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { bind } from '@/lib/tokens/bind'
import { SETTLE_MS, usePageState } from '@/lib/tokens/page-store'
import type { TokenPath } from '@/tokens/generated/token-path'

/** A failing check or a warning fills the capsule and its edge with a wash, so
 * the verdict reads before the words. A pass and a narration stay plain ink. */
const wash: Partial<Record<string, TokenPath>> = {
  fail: 'component.island.fail.background',
  warn: 'component.island.warn.background',
}

/** A label flip speaks at once; every other readout waits for rest. */
const urgent = (text: string) => text.startsWith('Label switched')

/** The one capsule on the page. It narrates what the page is doing and states
 * the real result of the last check. The visible text follows every frame; a
 * hidden status region carries it to screen readers at rest and on a label
 * flip, so a drag never floods the reader. New words mount as a new node, so
 * they fade in with the capsule; the words the page loads with carry a mark
 * and sit still. */
export function Island() {
  const { text, tone } = usePageState(state => state.island)
  const shell = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [spoken, setSpoken] = useState(text)
  const [loaded] = useState(text)

  useLayoutEffect(() => {
    const capsule = shell.current
    const box = inner.current
    if (capsule === null || box === null) {
      return
    }
    const observer = new ResizeObserver(() => {
      capsule.style.width = `${Math.ceil(box.offsetWidth + 2)}px`
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (urgent(text)) {
      setSpoken(text)
      return
    }
    const timer = setTimeout(() => setSpoken(text), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <div
      ref={shell}
      className='island'
      {...bind({
        backgroundColor: wash[tone] ?? 'component.island.background',
        borderColor: wash[tone] ?? 'component.island.border',
        color: 'component.island.text',
      })}>
      <div
        ref={inner}
        className='island-inner'>
        <span
          key={text}
          className='island-text'
          data-loaded={text === loaded ? '' : undefined}
          aria-hidden='true'>
          {text}
        </span>
        <span
          className='sr-only'
          role='status'>
          {spoken}
        </span>
      </div>
    </div>
  )
}
