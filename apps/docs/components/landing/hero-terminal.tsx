'use client'

import { useEffect, useState } from 'react'

const LINES = [
  { kind: 'cmd' as const, text: 'npx @figmavars/cli build variables.json' },
  { kind: 'ok' as const, text: 'Built tokens into design-tokens/' },
  { kind: 'out' as const, text: 'tokens/ · css/ · ts/' },
  { kind: 'out' as const, text: 'Resolver · Tailwind v4 · workflow' },
]

export function HeroTerminal() {
  const [visible, setVisible] = useState(0)
  const [chars, setChars] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reduced) {
      setVisible(LINES.length)
      setChars(LINES[LINES.length - 1].text.length)
      return
    }

    if (visible >= LINES.length) {
      return
    }

    const line = LINES[visible]
    if (chars < line.text.length) {
      const t = setTimeout(() => setChars(c => c + 1), 22)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => {
      setVisible(v => v + 1)
      setChars(0)
    }, 280)
    return () => clearTimeout(t)
  }, [visible, chars, reduced])

  return (
    <div className='hero-terminal'>
      <div className='hero-terminal-bar'>
        <div className='flex gap-2'>
          <span className='size-2.5 rounded-full bg-[#ff5f57]' />
          <span className='size-2.5 rounded-full bg-[#febc2e]' />
          <span className='size-2.5 rounded-full bg-[#28c840]' />
        </div>
        <span className='font-mono text-[11px] text-fv-dim'>
          ~/design-system
        </span>
      </div>
      <div className='hero-terminal-body font-mono text-[13px] leading-7'>
        {LINES.slice(0, visible + 1).map((line, i) => {
          const text = i < visible ? line.text : line.text.slice(0, chars)
          if (!text && i === visible) {
            return null
          }

          return (
            <p
              key={line.text}
              className='hero-terminal-line'>
              {line.kind === 'cmd' ? (
                <>
                  <span className='text-fv-dim'>$ </span>
                  <span className='text-fv-text'>{text}</span>
                  {i === visible && chars < line.text.length ? (
                    <span className='term-cursor' />
                  ) : null}
                </>
              ) : null}
              {line.kind === 'ok' ? (
                <span className='text-fv-good'>✓ {text}</span>
              ) : null}
              {line.kind === 'out' ? (
                <span className='text-fv-muted'>
                  <span className='text-fv-dim'>→ </span>
                  {text}
                </span>
              ) : null}
            </p>
          )
        })}
      </div>
    </div>
  )
}
