import { Fragment } from 'react'
import type {
  GovernanceDemo,
  ProposalOutcome,
} from '@/lib/landing/governance-demo'

function TokenPathText({ value }: { value: string }) {
  const segments = value.split('.')
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={`${segment}-${index}`}>
          {index > 0 ? (
            <>
              .<wbr />
            </>
          ) : null}
          {segment}
        </Fragment>
      ))}
    </>
  )
}

const MARK_PATH =
  'M36.76 85.34L41.7 58.07L37.3 60.88C20.85 71.1 -1.72 58.7 0.1 38.87C1.36 25.27 10.05 13.33 21.66 6.62C48.59 -8.95 89.6 3.69 94.62 36.67C97.83 57.79 76.07 71.48 58.03 60.92L53.42 58.06L58.23 85.33H36.76V85.34ZM42.44 8.69C38.52 8.99 34.65 9.87 31.04 11.39L30.99 34.53L42.45 41.4V8.69H42.44ZM52.56 8.88V19.19L64.9 12.09C64.95 11.83 64.8 11.92 64.65 11.85C61.71 10.44 57.91 9.45 54.68 8.98C54.13 8.9 53.34 8.74 52.81 8.75C52.7 8.75 52.59 8.77 52.56 8.88ZM22.44 16.59L20.22 18.25C18.14 20.3 16.03 22.37 14.54 24.91L22.44 29.42V16.58V16.59ZM52.56 41.28L80.7 24.81C79.28 22.73 77.66 20.56 75.77 18.88C75.56 18.69 74.41 17.69 74.28 17.64C74.06 17.54 73.89 17.72 73.71 17.81L52.72 30.33L52.57 41.28H52.56ZM10.35 32.88C9.18 37.97 8.35 43.02 11.07 47.77C14.73 54.18 22.78 56.77 29.67 54.35C32.54 53.34 35.47 51.47 37.63 49.35L10.36 32.87L10.35 32.88ZM84.46 32.89L57.62 49.48C63.17 55.44 71.96 57.46 79.08 52.93C85.1 49.1 86.82 43.04 85.45 36.21C85.38 35.86 84.63 32.88 84.46 32.88V32.89Z'

export function TokenTree({
  demo,
  outcome,
}: {
  demo: GovernanceDemo
  outcome: ProposalOutcome
}) {
  return (
    <div
      className='tree'
      data-outcome={outcome.id}>
      <p className='sr-only'>{outcome.description}</p>
      <div
        className='tree-outputs'
        aria-hidden='true'>
        <span className='tree-band-label'>Ships</span>
        <code>{demo.outputs.join(' · ')}</code>
      </div>
      <div
        className='tree-band tree-band-canopy'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Canopy<em>component</em>
        </span>
        <ul className='tree-consumers'>
          {demo.directDependents.map(dependent => (
            <li
              key={dependent.path}
              className='tree-node'>
              <code>
                <TokenPathText value={dependent.path} />
              </code>
            </li>
          ))}
        </ul>
      </div>
      <div
        className='tree-band tree-band-trunk'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Trunk<em>semantic</em>
        </span>
        <div className='tree-trunk-slot'>
          <span className='tree-spine tree-spine-junction' />
          <div className='tree-node tree-token-node'>
            <span className='tree-node-kicker'>Governed token</span>
            <code>
              <TokenPathText value={outcome.tokenPath} />
            </code>
            <span className='tree-root-node' />
          </div>
        </div>
      </div>
      <div
        className='tree-band tree-band-roots'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Roots<em>primitives</em>
        </span>
        <div className='tree-alias-slot'>
          <span
            className='tree-spine tree-spine-alias'
            key={outcome.id}
          />
          <div className='tree-node tree-source-node'>
            <span className='tree-node-kicker'>Proposed alias</span>
            <code>
              <TokenPathText value={outcome.proposedValue} />
            </code>
            {outcome.resolvedValue === null ? null : (
              <span
                className='tree-swatch'
                style={{ background: outcome.resolvedValue }}
              />
            )}
          </div>
        </div>
      </div>
      <div
        className='tree-mark'
        aria-hidden='true'>
        <span className='tree-trunk' />
        <svg viewBox='0 0 95 86'>
          <path
            className='tree-mark-body'
            d={MARK_PATH}
          />
        </svg>
      </div>
    </div>
  )
}
