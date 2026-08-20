'use client'

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  GovernanceDemo,
  ProposalDeck,
  ProposalOutcome,
} from '@/lib/landing/governance-demo'
import { TokenTree } from '@/components/landing/token-tree'

export function ProofPanel({
  demo,
  deck,
}: {
  demo: GovernanceDemo
  deck: ProposalDeck
}) {
  const [activeId, setActiveId] = useState<ProposalOutcome['id']>('baseline')
  const outcome =
    deck.outcomes.find(item => item.id === activeId) ?? deck.outcomes[0]
  if (outcome === undefined) {
    return null
  }

  function moveTo(index: number) {
    const next =
      deck.outcomes[(index + deck.outcomes.length) % deck.outcomes.length]
    if (next !== undefined) {
      setActiveId(next.id)
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

  return (
    <div className='proof'>
      <div className='proof-evidence'>
        <div
          role='radiogroup'
          aria-label='Governance proposals'
          className='proof-chips'>
          {deck.outcomes.map((item, index) => (
            <button
              key={item.id}
              id={`proof-chip-${item.id}`}
              type='button'
              role='radio'
              aria-checked={item.id === outcome.id}
              tabIndex={item.id === outcome.id ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={event => onChipKeyDown(event, index)}>
              {item.label}
            </button>
          ))}
        </div>
        <p
          role='status'
          aria-live='polite'
          className='proof-verdict'
          data-tone={outcome.verdictTone}>
          <span
            className='proof-swap'
            key={outcome.id}>
            {outcome.verdict}
          </span>
        </p>
        <p className='proof-detail'>
          <span
            className='proof-swap'
            key={outcome.id}>
            {outcome.detail}
          </span>
        </p>
        <div className='proof-emitted'>
          <div
            className='proof-swap'
            key={outcome.id}>
            {outcome.emitted === null ? (
              <p className='proof-blocked'>
                No files ship. The build stops at the policy gate.
              </p>
            ) : (
              <>
                <p className='proof-emitted-label'>tokens.css</p>
                <pre>
                  <code>{outcome.emitted.css}</code>
                </pre>
                <p className='proof-emitted-label'>tokens.ts</p>
                <pre>
                  <code>{outcome.emitted.ts}</code>
                </pre>
              </>
            )}
          </div>
        </div>
        <p className='proof-owner'>
          <span>Owner</span>
          <code>{demo.owner}</code>
        </p>
      </div>
      <TokenTree
        demo={demo}
        outcome={outcome}
      />
    </div>
  )
}
