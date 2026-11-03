'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

/** The sticky header frame. At the top of the page the header shares the
 * page ground and draws no edge. Once content scrolls beneath it, the header
 * steps up one tone. A sentinel pinned to the top of the document reports the
 * scroll through an IntersectionObserver, so no scroll handler runs. */
export function SiteHeaderFrame({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const target = sentinel.current
    if (target === null) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(entry !== undefined && !entry.isIntersecting)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div
        ref={sentinel}
        className='site-scroll-sentinel'
        aria-hidden='true'
      />
      <header
        className='site-header'
        data-scrolled={scrolled ? '' : undefined}>
        {children}
      </header>
    </>
  )
}
