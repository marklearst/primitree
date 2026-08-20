import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CopyCommand } from '@/components/landing/copy-command'
import { ProofPanel } from '@/components/landing/proof-panel'
import {
  createGovernanceDemo,
  createProposalDeck,
} from '@/lib/landing/governance-demo'

const INSTALL_COMMAND = 'npx primitree@next check'

const CONFIG_SNIPPET = `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: { layers: [
        {
          id: 'primitives',
          roots: ['primitives'],
          values: 'literal'
        },
        {
          id: 'semantic',
          roots: ['semantic'],
          values: 'reference',
          references: ['primitives']
        },
        {
          id: 'component',
          roots: ['component'],
          values: 'reference',
          references: ['semantic']
        }
      ] },
      ownership: {
        default: ['design-systems'],
        paths: { semantic: ['product-design'] }
      },
      outputs: {
        directory: './generated',
        formats: ['dtcg', 'css', 'typescript', 'tailwind']
      }
    }
  }
}`

export function GovernanceHome() {
  const demo = createGovernanceDemo()
  const deck = createProposalDeck()

  return (
    <div className='governance-home'>
      <section className='governance-hero'>
        <div className='governance-wrap governance-hero-inner'>
          <h1 aria-label='Govern token change. Know every consequence.'>
            <span>Govern token change.</span>
            <span>Know every consequence.</span>
          </h1>
          <p className='governance-hero-lede'>
            Turn a token edit into reviewable evidence: what it resolves to,
            which components depend on it, who owns it, and whether the
            configured policy allows the change to ship.
          </p>
          <div className='governance-actions'>
            <Link
              href='/docs/getting-started'
              className='btn-primary governance-cta'>
              Run the quickstart
              <ArrowRight
                aria-hidden='true'
                size={16}
                strokeWidth={1.8}
              />
            </Link>
            <Link
              href='/playground'
              className='btn-ghost governance-cta'>
              Open the playground
            </Link>
          </div>
          <div className='hero-install'>
            <code>{INSTALL_COMMAND}</code>
            <CopyCommand
              text={INSTALL_COMMAND}
              label='Copy the install command'
            />
          </div>
        </div>
      </section>

      <section className='governance-proof-section'>
        <div className='governance-wrap'>
          <div className='section-intro'>
            <p className='section-kicker'>Evidence</p>
            <h2>Propose a change. Read the verdict.</h2>
            <p>
              Pick a proposal for the governed token. The panel shows the policy
              verdict, the affected consumers, and the emitted code. The engine
              computes every outcome at build time from the same graph the CLI
              checks.
            </p>
          </div>
          <ProofPanel
            demo={demo}
            deck={deck}
          />
        </div>
      </section>

      <section className='governance-diff-section'>
        <div className='governance-wrap governance-diff-grid'>
          <div className='section-intro'>
            <p className='section-kicker'>Change review</p>
            <h2>The diff names every affected token.</h2>
            <p>
              primitree diff compares two revisions of one source through the
              graph. The report lists each change beside the tokens that inherit
              it, before a merge lands.
            </p>
            <Link
              href='/docs/cli/diff'
              className='governance-text-link'>
              Read the diff command
              <ArrowRight
                aria-hidden='true'
                size={15}
              />
            </Link>
          </div>
          <div className='terminal'>
            <p className='terminal-title'>primitree diff · brand source</p>
            <pre>
              <code>{deck.diffReport.join('\n')}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className='governance-quickstart'>
        <div className='governance-wrap governance-proof-copy-grid'>
          <div className='governance-proof-copy'>
            <h2>Rules close to the tokens.</h2>
            <p>
              Define architecture and ownership beside the source. Check the
              exact graph in development and CI before generating files.
            </p>
            <div className='governance-argument-flow'>
              <article>
                <h3>Govern the proposal</h3>
                <p>
                  Encode allowed layers, references, and owners as policy. A
                  proposal either passes with evidence or stops with the exact
                  rule it crossed.
                </p>
              </article>
              <article>
                <h3>Trace the blast radius</h3>
                <p>
                  Follow resolved aliases and direct dependents through the same
                  graph. Reviewers see what changed and which consumers inherit
                  it.
                </p>
              </article>
              <article>
                <h3>Ship one contract</h3>
                <p>
                  After the graph passes, one configured build emits the
                  selected DTCG, CSS, Tailwind, and TypeScript files from the
                  same resolved values.
                </p>
              </article>
            </div>
          </div>
          <div className='governance-code-proof'>
            <div className='governance-code-block'>
              <div className='governance-code-head'>
                <p>primitree.config.ts</p>
                <CopyCommand
                  text={CONFIG_SNIPPET}
                  label='Copy the config example'
                />
              </div>
              <pre>
                <code>{CONFIG_SNIPPET}</code>
              </pre>
            </div>
            <div className='governance-command-row'>
              <code>pnpm exec primitree check --source brand</code>
              <span>{demo.compliant.status}</span>
            </div>
          </div>
        </div>
        <div className='governance-wrap governance-facts'>
          <p>
            <span>Standard</span>
            DTCG 2025.10 output · Resolver contexts in tokens.resolver.json ·
            Extensions under $extensions[&apos;com.primitree&apos;]
          </p>
          <p>
            <span>Sources</span>
            Local DTCG files · Figma variables export · Variables REST API
          </p>
        </div>
      </section>

      <section className='governance-final'>
        <div className='governance-wrap governance-final-inner'>
          <h2>Make token change legible.</h2>
          <p>
            Start with one source, one policy, and evidence your team can
            review.
          </p>
          <div className='governance-actions'>
            <Link
              href='/docs/getting-started'
              className='btn-primary governance-cta'>
              Start with the docs
              <ArrowRight
                aria-hidden='true'
                size={16}
              />
            </Link>
            <Link
              href='/docs'
              className='btn-ghost governance-cta'>
              Browse the docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
