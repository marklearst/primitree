'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { GovernanceDemo } from '@/lib/landing/governance-demo'

const MARK_PATH =
  'M36.76 85.34L41.7 58.07L37.3 60.88C20.85 71.1 -1.72 58.7 0.1 38.87C1.36 25.27 10.05 13.33 21.66 6.62C48.59 -8.95 89.6 3.69 94.62 36.67C97.83 57.79 76.07 71.48 58.03 60.92L53.42 58.06L58.23 85.33H36.76V85.34ZM42.44 8.69C38.52 8.99 34.65 9.87 31.04 11.39L30.99 34.53L42.45 41.4V8.69H42.44ZM52.56 8.88V19.19L64.9 12.09C64.95 11.83 64.8 11.92 64.65 11.85C61.71 10.44 57.91 9.45 54.68 8.98C54.13 8.9 53.34 8.74 52.81 8.75C52.7 8.75 52.59 8.77 52.56 8.88ZM22.44 16.59L20.22 18.25C18.14 20.3 16.03 22.37 14.54 24.91L22.44 29.42V16.58V16.59ZM52.56 41.28L80.7 24.81C79.28 22.73 77.66 20.56 75.77 18.88C75.56 18.69 74.41 17.69 74.28 17.64C74.06 17.54 73.89 17.72 73.71 17.81L52.72 30.33L52.57 41.28H52.56ZM10.35 32.88C9.18 37.97 8.35 43.02 11.07 47.77C14.73 54.18 22.78 56.77 29.67 54.35C32.54 53.34 35.47 51.47 37.63 49.35L10.36 32.87L10.35 32.88ZM84.46 32.89L57.62 49.48C63.17 55.44 71.96 57.46 79.08 52.93C85.1 49.1 86.82 43.04 85.45 36.21C85.38 35.86 84.63 32.88 84.46 32.88V32.89Z'

const branches = ['govern', 'trace', 'ship'] as const
type Branch = (typeof branches)[number]

const branchLabels: Record<Branch, string> = {
  govern: 'Govern',
  trace: 'Trace',
  ship: 'Ship',
}

function branchId(branch: Branch, part: 'tab' | 'panel') {
  return `canopy-${part}-${branch}`
}

export function LivingCanopy({ demo }: { demo: GovernanceDemo }) {
  const rootRef = useRef<HTMLElement>(null)
  const [activeBranch, setActiveBranch] = useState<Branch>('govern')
  const [forbiddenProposal, setForbiddenProposal] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (root === null) {
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const supportsChoreography = window.matchMedia(
      '(min-width: 75rem) and (min-height: 56.25rem)'
    )
    const sentinels = root.querySelectorAll<HTMLElement>('[data-canopy-stage]')
    let observer: IntersectionObserver | undefined

    const configureChoreography = () => {
      observer?.disconnect()
      observer = undefined

      if (reducedMotion.matches || !supportsChoreography.matches) {
        root.dataset.stage = 'ship'
        return
      }

      root.dataset.stage = 'source'
      observer = new IntersectionObserver(
        entries => {
          const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort(
              (left, right) => right.intersectionRatio - left.intersectionRatio
            )
            .at(0)
          const stage = (visible?.target as HTMLElement | undefined)?.dataset
            .canopyStage

          if (stage !== undefined) {
            root.dataset.stage = stage
          }
        },
        { rootMargin: '-34% 0px -46%', threshold: [0, 0.25, 0.6] }
      )
      sentinels.forEach(sentinel => {
        observer?.observe(sentinel)
      })
    }

    configureChoreography()
    reducedMotion.addEventListener('change', configureChoreography)
    supportsChoreography.addEventListener('change', configureChoreography)

    return () => {
      observer?.disconnect()
      reducedMotion.removeEventListener('change', configureChoreography)
      supportsChoreography.removeEventListener('change', configureChoreography)
    }
  }, [])

  function focusBranch(branch: Branch) {
    setActiveBranch(branch)
    document.getElementById(branchId(branch, 'tab'))?.focus()
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: Branch
  ) {
    const currentIndex = branches.indexOf(current)
    let next: Branch | undefined

    if (event.key === 'ArrowRight') {
      next = branches[(currentIndex + 1) % branches.length]
    } else if (event.key === 'ArrowLeft') {
      next = branches[(currentIndex - 1 + branches.length) % branches.length]
    } else if (event.key === 'Home') {
      next = branches[0]
    } else if (event.key === 'End') {
      next = branches.at(-1)
    }

    if (next !== undefined) {
      event.preventDefault()
      focusBranch(next)
    }
  }

  return (
    <section
      ref={rootRef}
      className='canopy-root'
      data-stage='source'
      data-branch={activeBranch}>
      <div className='canopy-sticky'>
        <div className='canopy-frame'>
          <div className='canopy-frame-header'>
            <p>Living token</p>
            <code>{demo.tokenPath}</code>
          </div>

          <div className='canopy-visual-grid'>
            <div className='canopy-graphic'>
              <p className='sr-only'>
                {demo.tokenPath} references {demo.aliasTarget}, resolves to{' '}
                {demo.resolvedValue}, belongs to {demo.owner}, and has three
                direct component dependents:{' '}
                {demo.directDependents
                  .map(dependent => dependent.path)
                  .join(', ')}
                . A passing policy check allows the configured{' '}
                {demo.outputs.join(', ')} code formats.
              </p>

              <svg
                className='canopy-svg'
                viewBox='0 0 760 620'
                aria-hidden='true'
                role='presentation'>
                <g
                  className='canopy-links'
                  fill='none'>
                  <path
                    className='canopy-link canopy-resolve-link'
                    d='M380 390V358'
                  />
                  <path
                    className='canopy-link canopy-dependency-link'
                    d='M380 288L285 215H235'
                  />
                  <path
                    className='canopy-link canopy-dependency-link'
                    d='M380 288V193'
                  />
                  <path
                    className='canopy-link canopy-dependency-link'
                    d='M380 288L475 215H525'
                  />
                  <path
                    className='canopy-link canopy-output-link'
                    d='M132 155L225 95H260'
                  />
                  <path
                    className='canopy-link canopy-output-link'
                    d='M380 133V95'
                  />
                  <path
                    className='canopy-link canopy-output-link'
                    d='M628 155L535 95H500'
                  />
                </g>

                <g
                  className='canopy-source-node'
                  data-motion>
                  <rect
                    x='245'
                    y='390'
                    width='270'
                    height='64'
                    rx='2'
                  />
                  <text
                    x='264'
                    y='414'
                    className='canopy-node-kicker'>
                    PRIMITIVE ALIAS
                  </text>
                  <text
                    x='264'
                    y='438'
                    className='canopy-node-label'>
                    {'{primitives.color.blue.500}'}
                  </text>
                  <circle
                    cx='490'
                    cy='422'
                    r='7'
                    className='canopy-source-swatch'
                  />
                </g>

                <g
                  className='canopy-dependent-node canopy-dependent-left'
                  data-motion>
                  <rect
                    x='30'
                    y='155'
                    width='205'
                    height='60'
                    rx='2'
                  />
                  <text
                    x='47'
                    y='190'
                    className='canopy-node-label'>
                    {demo.directDependents[0]?.path}
                  </text>
                </g>
                <g
                  className='canopy-dependent-node canopy-dependent-center'
                  data-motion>
                  <rect
                    x='278'
                    y='133'
                    width='204'
                    height='60'
                    rx='2'
                  />
                  <text
                    x='295'
                    y='168'
                    className='canopy-node-label'>
                    {demo.directDependents[1]?.path}
                  </text>
                </g>
                <g
                  className='canopy-dependent-node canopy-dependent-right'
                  data-motion>
                  <rect
                    x='525'
                    y='155'
                    width='205'
                    height='60'
                    rx='2'
                  />
                  <text
                    x='542'
                    y='190'
                    className='canopy-node-label'>
                    {demo.directDependents[2]?.path}
                  </text>
                </g>

                <g
                  className='canopy-token-node'
                  data-motion>
                  <rect
                    x='248'
                    y='288'
                    width='264'
                    height='70'
                    rx='2'
                  />
                  <text
                    x='267'
                    y='314'
                    className='canopy-node-kicker'>
                    GOVERNED TOKEN
                  </text>
                  <text
                    x='267'
                    y='341'
                    className='canopy-token-label'>
                    {demo.tokenPath}
                  </text>
                  <circle
                    cx='487'
                    cy='323'
                    r='7'
                    className='canopy-root-node'
                  />
                </g>

                <g
                  className='canopy-output-node'
                  data-motion>
                  <rect
                    x='260'
                    y='35'
                    width='240'
                    height='60'
                    rx='2'
                  />
                  <text
                    x='278'
                    y='59'
                    className='canopy-node-kicker'>
                    CONFIGURED CODE FORMATS
                  </text>
                  <text
                    x='278'
                    y='82'
                    className='canopy-node-label'>
                    {demo.outputs.join(' · ')}
                  </text>
                </g>

                <g
                  className='canopy-logo'
                  transform='translate(316 488) scale(1.35)'>
                  <g data-motion>
                    <path
                      className='canopy-logo-body'
                      d={MARK_PATH}
                      fill='var(--color-primitree-text)'
                    />
                  </g>
                </g>
                <path
                  className='canopy-trunk'
                  d='M380 488V454'
                />
              </svg>

              <div
                className='canopy-mobile-graph'
                aria-hidden='true'>
                <div className='canopy-mobile-node canopy-mobile-node-output'>
                  <span>Configured code formats</span>
                  <code>{demo.outputs.join(' · ')}</code>
                </div>

                <div className='canopy-mobile-dependents'>
                  {demo.directDependents.map(dependent => (
                    <div
                      key={dependent.path}
                      className='canopy-mobile-node'>
                      <span>Direct consumer</span>
                      <code>{dependent.path}</code>
                    </div>
                  ))}
                </div>

                <div className='canopy-mobile-node canopy-mobile-node-token'>
                  <span>Governed token</span>
                  <code>{demo.tokenPath}</code>
                </div>

                <div className='canopy-mobile-node canopy-mobile-node-source'>
                  <span>Primitive alias</span>
                  <code>{`{${demo.aliasTarget}}`}</code>
                </div>

                <div className='canopy-mobile-logo'>
                  <svg
                    viewBox='0 0 95 86'
                    aria-hidden='true'>
                    <path d={MARK_PATH} />
                  </svg>
                  <span>Governed at the root</span>
                </div>
              </div>
            </div>

            <div className='canopy-evidence'>
              <div
                className='canopy-tabs'
                role='tablist'
                aria-label='Governance evidence'>
                {branches.map(branch => (
                  <button
                    key={branch}
                    id={branchId(branch, 'tab')}
                    type='button'
                    role='tab'
                    aria-selected={activeBranch === branch}
                    aria-controls={branchId(branch, 'panel')}
                    tabIndex={activeBranch === branch ? 0 : -1}
                    onClick={() => setActiveBranch(branch)}
                    onKeyDown={event => handleTabKeyDown(event, branch)}>
                    {branchLabels[branch]}
                  </button>
                ))}
              </div>

              <div
                id={branchId('govern', 'panel')}
                role='tabpanel'
                aria-labelledby={branchId('govern', 'tab')}
                hidden={activeBranch !== 'govern'}
                className='canopy-panel'>
                <p className='canopy-panel-label'>Policy gate</p>
                <button
                  type='button'
                  className='canopy-proposal'
                  aria-pressed={forbiddenProposal}
                  aria-describedby='canopy-policy-reason'
                  onClick={() => setForbiddenProposal(value => !value)}>
                  <span>Proposed alias</span>
                  <code>
                    {forbiddenProposal
                      ? '{component.color.brand}'
                      : `{${demo.aliasTarget}}`}
                  </code>
                  <span
                    className='canopy-switch'
                    aria-hidden='true'>
                    <span />
                  </span>
                </button>
                <div className='canopy-verdict'>
                  <p
                    role='status'
                    aria-live='polite'
                    className={forbiddenProposal ? 'is-blocked' : undefined}>
                    {forbiddenProposal
                      ? `${demo.blocked.status} · ${demo.blocked.ruleId}`
                      : `${demo.compliant.status} · ${demo.compliant.findings} findings`}
                  </p>
                  <small
                    id='canopy-policy-reason'
                    aria-live='polite'>
                    {forbiddenProposal ? demo.blocked.reason : ''}
                  </small>
                </div>
                <p className='canopy-owner'>
                  <span>Owner</span>
                  <code>{demo.owner}</code>
                </p>
              </div>

              <div
                id={branchId('trace', 'panel')}
                role='tabpanel'
                aria-labelledby={branchId('trace', 'tab')}
                hidden={activeBranch !== 'trace'}
                className='canopy-panel'>
                <p className='canopy-panel-label'>Direct impact</p>
                <p className='canopy-panel-metric'>3 consumers</p>
                <ul className='canopy-path-list'>
                  {demo.directDependents.map(dependent => (
                    <li key={dependent.path}>{dependent.path}</li>
                  ))}
                </ul>
              </div>

              <div
                id={branchId('ship', 'panel')}
                role='tabpanel'
                aria-labelledby={branchId('ship', 'tab')}
                hidden={activeBranch !== 'ship'}
                className='canopy-panel'>
                <p className='canopy-panel-label'>Configured code formats</p>
                <p className='canopy-panel-metric'>{demo.resolvedValue}</p>
                <ul className='canopy-output-list'>
                  {demo.outputs.map(output => (
                    <li key={output}>{output}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ol
        className='canopy-stage-track'
        aria-label='Token change path'>
        <li data-canopy-stage='source'>
          <strong>Source</strong>
          <p>The primitive enters once as an opaque sRGB value.</p>
        </li>
        <li data-canopy-stage='resolve'>
          <strong>Resolve</strong>
          <p>The semantic alias resolves before policy or output runs.</p>
        </li>
        <li data-canopy-stage='govern'>
          <strong>Govern</strong>
          <p>Layer and ownership rules decide whether the change proceeds.</p>
        </li>
        <li data-canopy-stage='ship'>
          <strong>Ship</strong>
          <p>A passing graph can build every configured code format.</p>
        </li>
      </ol>
    </section>
  )
}
