'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

const PACKAGE_MANAGERS = [
  { id: 'npm', command: 'npm install -D primitree@next' },
  { id: 'pnpm', command: 'pnpm add -D primitree@next' },
  { id: 'yarn', command: 'yarn add -D primitree@next' },
  { id: 'bun', command: 'bun add -d primitree@next' },
] as const

type PackageManagerId = (typeof PACKAGE_MANAGERS)[number]['id']

export function InstallCard({
  tokenCount,
  layerCount,
  findings,
  outputs,
}: {
  tokenCount: number
  layerCount: number
  findings: number
  outputs: readonly string[]
}) {
  const [activeId, setActiveId] = useState<PackageManagerId>('npm')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    return () => {
      clearTimeout(copyTimer.current)
    }
  }, [])
  const active =
    PACKAGE_MANAGERS.find(manager => manager.id === activeId) ??
    PACKAGE_MANAGERS[0]
  const wroteLine = ['dtcg', ...outputs.map(label => label.toLowerCase())].join(
    ' · '
  )

  function moveTo(index: number) {
    const next =
      PACKAGE_MANAGERS[
        (index + PACKAGE_MANAGERS.length) % PACKAGE_MANAGERS.length
      ]
    if (next !== undefined) {
      setActiveId(next.id)
      document.getElementById(`install-tab-${next.id}`)?.focus()
    }
  }

  function onTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(PACKAGE_MANAGERS.length - 1)
    }
  }

  return (
    <div className='install-card'>
      <div className='install-card-head'>
        <div
          role='radiogroup'
          aria-label='Package manager'
          className='install-tabs'>
          {PACKAGE_MANAGERS.map((manager, index) => (
            // biome-ignore lint/a11y/useSemanticElements: the design's tab row is a WAI-ARIA radio group of buttons with roving tabindex; native radio inputs cannot take this styling.
            <button
              key={manager.id}
              id={`install-tab-${manager.id}`}
              type='button'
              role='radio'
              aria-checked={manager.id === active.id}
              tabIndex={manager.id === active.id ? 0 : -1}
              onClick={() => setActiveId(manager.id)}
              onKeyDown={event => onTabKeyDown(event, index)}>
              {manager.id}
            </button>
          ))}
        </div>
        <span
          className='install-shell'
          aria-hidden='true'>
          bash
        </span>
      </div>
      <button
        type='button'
        className='install-copy-row'
        aria-label={`Copy the ${active.id} install command`}
        data-copied={copied || undefined}
        onClick={() => {
          navigator.clipboard?.writeText(active.command).catch(() => {})
          setCopied(true)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => setCopied(false), 1200)
        }}>
        <code>
          <span className='mark-acc'>$</span> {active.command}
        </code>
        <span className='install-copy-label'>{copied ? 'copied' : 'copy'}</span>
      </button>
      <div className='install-output'>
        <p>
          <span className='mark-acc'>$</span> primitree check
        </p>
        <p>
          <span className='mark-acc'>✓</span> graph resolved · {tokenCount}{' '}
          tokens · {layerCount} layers
        </p>
        <p>
          <span className='mark-acc'>✓</span> policy passed · {findings}{' '}
          findings
        </p>
        <p>→ wrote {wroteLine}</p>
      </div>
    </div>
  )
}
