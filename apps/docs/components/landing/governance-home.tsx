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
  const heroReport = [
    '$ primitree check --source brand',
    '',
    `Check passed for source "brand" with ${demo.tokenCount} tokens.`,
    '',
    `$ primitree inspect ${demo.tokenPath}`,
    '',
    `Token: ${demo.tokenPath}`,
    `Alias chain: ${demo.tokenPath} -> ${demo.aliasTarget}`,
    `Value: ${demo.resolvedValue}`,
    `Owners: ${demo.owner}`,
    'Direct dependents:',
    ...demo.directDependents.map(dependent => `  ${dependent.path}`),
  ].join('\n')

  return (
    <div className='governance-home'>
      <section className='governance-hero'>
        <div className='governance-wrap governance-hero-inner'>
          <h1 aria-label='Change review for design tokens.'>
            <span>Change review</span>
            <span>for design tokens.</span>
          </h1>
          <div className='governance-hero-split'>
            <div className='governance-hero-copy-stack'>
              <p className='governance-hero-lede'>
                Primitree checks each change to a token source against the layer
                and ownership rules in your config, shows the components the
                change reaches, and builds files when the graph passes.
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
            <div className='terminal hero-terminal'>
              <p className='terminal-title'>primitree check · brand source</p>
              <pre>
                <code>{heroReport}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className='governance-proof-section'>
        <div className='governance-wrap'>
          <div className='section-intro'>
            <p className='section-kicker'>Evidence</p>
            <h2>Try a change against the policy.</h2>
            <p>
              Click a proposal below. Each verdict, consumer list, and emitted
              line comes from @primitree/core at this site&apos;s build time,
              through the same functions the CLI calls.
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
            <h2>See what a rename touches.</h2>
            <p>
              primitree diff reads two revisions of a source through the graph
              and pairs each change with the components that reference it. One
              rename shows up as five changes.
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
            <p className='section-kicker'>Configuration</p>
            <h2>Rules close to the tokens.</h2>
            <p>
              Define architecture and ownership beside the source. Check the
              exact graph in development and CI before generating files.
            </p>
            <div className='governance-argument-flow'>
              <article>
                <h3>Layer policy</h3>
                <p>
                  Layers, allowed references, and owners live in config. A
                  change that crosses a rule stops with that rule&apos;s ID in
                  the report.
                </p>
              </article>
              <article>
                <h3>Change impact</h3>
                <p>
                  The graph resolves aliases and dependents, so a reviewer sees
                  which components a change reaches before it merges.
                </p>
              </article>
              <article>
                <h3>Build outputs</h3>
                <p>
                  One build writes the DTCG, CSS, Tailwind, and TypeScript files
                  from the resolved graph.
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
            DTCG Format Module 2025.10 output · Resolver contexts in
            tokens.resolver.json · Extensions under
            $extensions[&apos;com.primitree&apos;]
          </p>
          <p>
            <span>Outputs</span>
            DTCG · CSS · Tailwind · TypeScript, from one resolved graph
          </p>
          <p>
            <span>Sources</span>
            Local DTCG files · Figma variables export · Variables REST API
          </p>
        </div>
      </section>

      <section className='governance-final'>
        <div className='governance-wrap governance-final-inner'>
          <h2>Your next token change, reviewed.</h2>
          <p>
            Point primitree at a tokens.json, write three layer rules, and read
            the first report.
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
              href='/playground'
              className='btn-ghost governance-cta'>
              Open the playground
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
