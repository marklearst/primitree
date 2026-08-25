'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type {
  GovernanceDemo,
  ProposalDeck,
  ProposalOutcome,
} from '@/lib/landing/governance-demo'
import { TokenGraph } from '@/components/landing/token-graph'

const PROPOSAL_FLAGS: Record<ProposalOutcome['id'], string> = {
  baseline: 'current',
  alias: 'alias',
  violation: 'violation',
  rename: 'rename',
}

function nodeSummary(outcome: ProposalOutcome, slot: string | null) {
  if (slot === null) {
    return null
  }
  const node = outcome.nodes.find(item => item.slot === slot)
  if (node === undefined) {
    return null
  }
  const consumerCount =
    node.consumers === 1 ? '1 consumer' : `${node.consumers} consumers`
  return `${node.path} · ${node.kind} ${node.display} · owner ${node.owner} · ${consumerCount}`
}

export function ProofPanel({
  demo,
  deck,
}: {
  demo: GovernanceDemo
  deck: ProposalDeck
}) {
  const [activeId, setActiveId] = useState<ProposalOutcome['id']>('baseline')
  const [traceSlot, setTraceSlot] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  useEffect(() => {
    return () => {
      clearTimeout(checkTimer.current)
    }
  }, [])
  const outcome =
    deck.outcomes.find(item => item.id === activeId) ?? deck.outcomes[0]
  if (outcome === undefined) {
    return null
  }

  function pick(id: ProposalOutcome['id']) {
    setActiveId(id)
    setTraceSlot(null)
    setSelectedSlot(null)
    setChecking(true)
    clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(() => setChecking(false), 700)
  }

  function moveTo(index: number) {
    const next =
      deck.outcomes[(index + deck.outcomes.length) % deck.outcomes.length]
    if (next !== undefined) {
      pick(next.id)
      document.getElementById(`proof-chip-${next.id}`)?.focus()
    }
  }

  function onChipKeyDown(
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
      moveTo(deck.outcomes.length - 1)
    }
  }

  const inspected = nodeSummary(outcome, traceSlot ?? selectedSlot)

  return (
    <div className='proof'>
      <div className='proof-command'>
        <code>
          <span className='mark-acc'>$</span> primitree check --source brand
          --proposal {PROPOSAL_FLAGS[outcome.id]}
          <span
            className='proof-cursor'
            aria-hidden='true'>
            ▌
          </span>
        </code>
        <span className='proof-command-spacer' />
        <span
          className='proof-command-label'
          id='proof-proposal-label'>
          Proposal
        </span>
        <div
          role='radiogroup'
          aria-labelledby='proof-proposal-label'
          className='proof-chips'>
          {deck.outcomes.map((item, index) => (
            // biome-ignore lint/a11y/useSemanticElements: proposal chips form a WAI-ARIA radio group of buttons with roving tabindex; native radio inputs cannot take this styling.
            <button
              key={item.id}
              id={`proof-chip-${item.id}`}
              type='button'
              role='radio'
              aria-checked={item.id === outcome.id}
              tabIndex={item.id === outcome.id ? 0 : -1}
              onClick={() => pick(item.id)}
              onKeyDown={event => onChipKeyDown(event, index)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <p className='sr-only'>{outcome.description}</p>
      <div className='graph-scroll'>
        <div
          className='graph-frame'
          key={outcome.id}>
          <TokenGraph
            outcome={outcome}
            checking={checking}
            traceSlot={traceSlot}
            selectedSlot={selectedSlot}
            onTraceSlot={setTraceSlot}
            onSelectSlot={setSelectedSlot}
          />
          {checking ? (
            <div
              className='graph-sweep'
              aria-hidden='true'
            />
          ) : null}
        </div>
      </div>
      <div
        className='proof-verdict-bar'
        data-tone={checking ? 'checking' : outcome.verdictTone}>
        {checking ? (
          <>
            <span className='proof-checking-label'>
              checking
              <span
                className='proof-cursor'
                aria-hidden='true'>
                ▌
              </span>
            </span>
            <span className='proof-checking-sub'>
              resolving aliases · applying policy
            </span>
          </>
        ) : null}
        <p
          role='status'
          aria-live='polite'
          className='proof-verdict'
          data-tone={outcome.verdictTone}
          hidden={checking}>
          <span
            className='proof-swap'
            key={outcome.id}>
            <span className='proof-verdict-chip'>{outcome.status}</span>{' '}
            <span className='proof-findings'>{outcome.findingsLine}</span>
          </span>
        </p>
        {checking ? null : (
          <>
            <span
              className='proof-divider'
              aria-hidden='true'
            />
            <p className='proof-detail'>
              <span
                className='proof-swap'
                key={`${outcome.id}-${inspected ?? 'outcome'}`}>
                {inspected ?? outcome.detail}
              </span>
            </p>
            {traceSlot === null && selectedSlot === null ? (
              <>
                <span
                  className='proof-hint'
                  aria-hidden='true'>
                  hover to trace · click to inspect
                </span>
                <span
                  className='proof-divider'
                  aria-hidden='true'
                />
              </>
            ) : null}
            <p className='proof-count'>
              {demo.tokenCount} tokens · {demo.layerCount} layers
            </p>
          </>
        )}
      </div>
    </div>
  )
}
