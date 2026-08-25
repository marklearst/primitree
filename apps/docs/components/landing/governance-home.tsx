import Link from 'next/link'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { InstallCard } from '@/components/landing/install-card'
import { ProofPanel } from '@/components/landing/proof-panel'
import {
  createGovernanceDemo,
  createProposalDeck,
  describeLayersSnippet,
} from '@/lib/landing/governance-demo'
import { readPrimitreeVersion } from '@/lib/landing/release'

/** Renders the diff transcript with the design's per-line color roles and
 * block spacing. */
function DiffReportLines({ lines }: { lines: readonly string[] }) {
  let firstChangeSeen = false
  const seen = new Map<string, number>()
  return (
    <div className='terminal-lines'>
      {lines.map(line => {
        if (line === '') {
          return null
        }
        const occurrence = (seen.get(line) ?? 0) + 1
        seen.set(line, occurrence)
        const key = `${line}#${occurrence}`
        if (line.startsWith('$ ')) {
          return (
            <div key={key}>
              <span className='mark-acc'>$</span> {line.slice(2)}
            </div>
          )
        }
        const foundMatch = line.match(/^Diff found (\d+) token changes\.$/u)
        if (foundMatch !== null) {
          return (
            <div
              key={key}
              data-gap='block'>
              Diff found <span className='mark-acc'>{foundMatch[1]}</span> token
              changes.
            </div>
          )
        }
        if (line.startsWith('  Affected tokens')) {
          return (
            <div
              key={key}
              data-line='dim'>
              {line}
            </div>
          )
        }
        if (line.startsWith('removed ')) {
          return (
            <div
              key={key}
              data-line='removed'>
              {line}
            </div>
          )
        }
        if (line.startsWith('added ')) {
          return (
            <div
              key={key}
              data-line='added'>
              {line}
            </div>
          )
        }
        if (line.startsWith('New findings:')) {
          return (
            <div
              key={key}
              data-gap='block'>
              {line}
            </div>
          )
        }
        const isFirstChange = !firstChangeSeen && line.startsWith('changed ')
        if (isFirstChange) {
          firstChangeSeen = true
        }
        return (
          <div
            key={key}
            data-gap={isFirstChange ? 'block' : undefined}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

export function GovernanceHome() {
  const demo = createGovernanceDemo()
  const deck = createProposalDeck()
  const layersSnippet = describeLayersSnippet()
  const [snippetComment, ...snippetRest] = layersSnippet.split('\n')
  const snippetCode = snippetRest.join('\n')
  const version = readPrimitreeVersion()
  const consumerCount = deck.renameImpact.consumers.length

  return (
    <div className='governance-home'>
      <section className='governance-hero'>
        <div className='governance-wrap governance-hero-inner'>
          <div className='governance-hero-copy-stack'>
            <h1 aria-label='Govern token change. Know what it reaches before it merges.'>
              <span>Govern token change.</span>
              <span>Know what it reaches before it merges.</span>
            </h1>
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
                <ArrowRightIcon
                  aria-hidden='true'
                  size={15}
                  weight='bold'
                />
              </Link>
              <Link
                href='/playground'
                className='btn-ghost governance-cta'>
                Open the playground
              </Link>
            </div>
          </div>
          <div className='governance-hero-card'>
            <InstallCard
              tokenCount={demo.tokenCount}
              layerCount={demo.layerCount}
              findings={demo.compliant.findings}
              outputs={demo.outputs}
            />
          </div>
        </div>
      </section>

      <section
        className='governance-proof-section'
        aria-labelledby='proof-heading'>
        <h2
          id='proof-heading'
          className='sr-only'>
          Try a change against the policy.
        </h2>
        <ProofPanel
          demo={demo}
          deck={deck}
        />
        <div className='governance-wrap'>
          <p className='proof-attribution'>
            Each verdict, consumer list, and count comes from @primitree/core at
            this site&apos;s build time, through the same functions the CLI
            calls.
          </p>
        </div>
      </section>

      <section className='governance-compare'>
        <div className='governance-wrap governance-compare-grid'>
          <div className='governance-compare-cell'>
            <p className='section-kicker'>Before</p>
            <h3>Review by eyeball</h3>
            <p className='governance-compare-copy'>
              A rename lands in tokens.json. Someone scans the PR, approves, and
              finds out in production which components it reached.
            </p>
            <p className='governance-reach'>
              what it reaches: <span data-tone='fail'>unknown</span>
            </p>
            <div className='terminal'>
              <p className='terminal-title'>tokens.json · pull request</p>
              <div className='terminal-lines'>
                <div data-line='removed'>
                  {'- "bg.brand": { "$value": "{blue.500}" }'}
                </div>
                <div data-line='added'>
                  {'+ "bg.primary": { "$value": "{blue.500}" }'}
                </div>
                <div
                  data-line='dim'
                  data-gap=''>
                  Approved · merged · consumers unknown
                </div>
              </div>
            </div>
          </div>
          <div className='governance-compare-cell'>
            <p
              className='section-kicker'
              data-tone='accent'>
              After
            </p>
            <h3>Review by graph</h3>
            <p className='governance-compare-copy'>
              The same rename arrives as five changes with three named
              consumers. The rule it would break blocks the build before merge.
            </p>
            <p className='governance-reach'>
              what it reaches:{' '}
              <span data-tone='pass'>{consumerCount} components, named</span>
            </p>
            <div className='terminal'>
              <p className='terminal-title'>primitree diff · same change</p>
              <div className='terminal-lines'>
                <div data-line='removed'>
                  removed {deck.renameImpact.removedPath}
                </div>
                <div data-line='added'>added {deck.renameImpact.addedPath}</div>
                <div>{`→ ${deck.renameImpact.consumers.join(' · ')}`}</div>
                <div
                  data-line='dim'
                  data-gap=''>
                  merge waits until the {consumerCount} refs update
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='governance-diff-section'>
        <div className='governance-wrap governance-diff-grid'>
          <div className='section-intro'>
            <p
              className='section-kicker'
              data-tone='accent'>
              Change review
            </p>
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
              <ArrowRightIcon
                aria-hidden='true'
                size={14}
                weight='bold'
              />
            </Link>
          </div>
          <div
            className='terminal'
            data-density='report'>
            <p
              className='terminal-title'
              data-style='report'>
              <span
                className='terminal-dot'
                aria-hidden='true'
              />
              Diff report · brand source
            </p>
            <DiffReportLines lines={deck.diffReport} />
          </div>
        </div>
      </section>

      <section className='governance-quickstart'>
        <div className='governance-wrap'>
          <div className='section-intro'>
            <p
              className='section-kicker'
              data-tone='accent'>
              Quickstart
            </p>
            <h2>First report in two minutes.</h2>
            <p>
              No service and no account. A config file next to your tokens, one
              command locally or in CI.
            </p>
          </div>
          <div className='governance-steps'>
            <article className='governance-step'>
              <p className='governance-step-title'>Step 01 · Install</p>
              <pre>
                <code>
                  <span className='mark-acc'>$</span> npm install -D
                  primitree@next
                  {'\n'}
                  <span data-line='dim'>+ primitree@{version}</span>
                </code>
              </pre>
            </article>
            <article className='governance-step'>
              <p className='governance-step-title'>
                Step 02 · Describe your layers
              </p>
              <pre>
                <code>
                  <span data-line='dim'>{snippetComment}</span>
                  {'\n'}
                  {snippetCode}
                </code>
              </pre>
            </article>
            <article className='governance-step'>
              <p className='governance-step-title'>Step 03 · Run the check</p>
              <pre>
                <code>
                  <span className='mark-acc'>$</span> primitree check --source
                  brand
                  {'\n'}
                  <span data-line='dim'>
                    <span className='mark-acc'>✓</span> policy passed ·{' '}
                    {demo.compliant.findings} findings
                  </span>
                  {'\n'}
                  <span data-line='dim'>
                    → wrote dtcg ·{' '}
                    {demo.outputs
                      .map(label =>
                        label === 'TypeScript' ? 'ts' : label.toLowerCase()
                      )
                      .join(' · ')}
                  </span>
                </code>
              </pre>
            </article>
          </div>
        </div>
      </section>

      <section className='governance-facts-section'>
        <div className='governance-wrap governance-facts'>
          <p>
            <span>Standard</span>
            DTCG Format Module 2025.10 output. Resolver contexts in
            tokens.resolver.json. Extensions under
            $extensions[&quot;com.primitree&quot;].
          </p>
          <p>
            <span>Outputs</span>
            DTCG · CSS · Tailwind · TypeScript, from one resolved graph.
          </p>
          <p>
            <span>Sources</span>
            Local DTCG files · Figma variables export · Variables REST API.
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
              <ArrowRightIcon
                aria-hidden='true'
                size={15}
                weight='bold'
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
