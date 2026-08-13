import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { LivingCanopy } from '@/components/landing/living-canopy'
import { createGovernanceDemo } from '@/lib/landing/governance-demo'

export function GovernanceHome() {
  const demo = createGovernanceDemo()

  return (
    <div className='governance-home'>
      <section className='governance-hero'>
        <div className='governance-wrap'>
          <div className='governance-hero-copy'>
            <h1 aria-label='Govern token change. Know every consequence.'>
              <span>Govern token change.</span>
              <span>Know every consequence.</span>
            </h1>
            <div className='governance-hero-support'>
              <p>
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
            </div>
          </div>
          <LivingCanopy demo={demo} />
        </div>
      </section>

      <section className='governance-consequences'>
        <div className='governance-wrap governance-argument'>
          <div className='governance-argument-intro'>
            <h2>One graph. Every consequence.</h2>
            <p>
              Primitree makes the relationship between source, policy, impact,
              and output explicit before a token reaches product code.
            </p>
          </div>
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
                After the graph passes, one configured build emits the selected
                DTCG, CSS, Tailwind, and TypeScript files from the same resolved
                values.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className='governance-quickstart'>
        <div className='governance-wrap governance-proof'>
          <div className='governance-proof-copy'>
            <h2>Rules close to the tokens.</h2>
            <p>
              Define architecture and ownership beside the source. Check the
              exact graph in development and CI before generating files.
            </p>
            <Link
              href='/docs/cli/check'
              className='governance-text-link'>
              Read the check command
              <ArrowRight
                aria-hidden='true'
                size={15}
              />
            </Link>
          </div>
          <div className='governance-code-proof'>
            <div className='governance-code-block'>
              <p>primitree.config.ts</p>
              <pre>
                <code>{`export default {
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
}`}</code>
              </pre>
            </div>
            <div className='governance-command-row'>
              <code>pnpm exec primitree check --source brand</code>
              <span>
                <Check
                  aria-hidden='true'
                  size={14}
                />
                PASS
              </span>
            </div>
          </div>
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
