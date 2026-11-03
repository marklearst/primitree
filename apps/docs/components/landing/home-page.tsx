import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { ArrowRightIcon } from '@/components/icons'
import { BuildLine, CloseChain } from '@/components/landing/build-line'
import { CodePanel } from '@/components/landing/code-panel'
import { Crown } from '@/components/landing/crown'
import { InstallChooser } from '@/components/landing/install-chooser'
import { Ledger } from '@/components/landing/ledger'
import { RuleDiagram } from '@/components/landing/rule-diagram'
import { RuleSwitch } from '@/components/landing/rule-switch'
import { CommandWords, RunCommand } from '@/components/landing/run-command'
import { rerouted, ThemeSection } from '@/components/landing/theme-section'
import { TokenGraph } from '@/components/landing/token-graph'
import { Transcript } from '@/components/landing/transcript'
import { readPrimitreeVersion } from '@/lib/landing/release'
import siteCli from '@/lib/landing/site-cli.json' with { type: 'json' }
import { links } from '@/lib/shared'
import { bind, reads } from '@/lib/tokens/bind'
import { ruleBreaks } from '@/lib/tokens/breaks'
import type { BreakId } from '@/lib/tokens/page-store'
import { signalZones } from '@/lib/tokens/signal-zones'
import { layerCounts } from '@/lib/tokens/site-graph'
import { brandCaps, solveStep, underInk } from '@/lib/tokens/solver'
import './home.css'

const tokensRoot = resolve(process.cwd(), 'tokens')
const BRAND_HUE = JSON.parse(
  readFileSync(resolve(tokensRoot, 'theme.config.json'), 'utf8')
).hue

const tokenFile = (name: string) =>
  readFileSync(resolve(tokensRoot, name), 'utf8').trimEnd()

/** The dial's ring: the color the solid takes at each hue, from the solver. */
function ringColors(): readonly string[] {
  return Array.from({ length: 72 }, (_, index) => {
    const hue = index * 5
    const [step, cap] = underInk(hue)
      ? ([85, brandCaps[85]] as const)
      : ([45, brandCaps[45]] as const)
    return solveStep(hue, step, cap).hex
  })
}

/** Both themes' arcs render; CSS shows the set for html[data-theme]. */
const zones = [...signalZones('light'), ...signalZones('dark')]

const rules: readonly {
  readonly id: BreakId
  readonly name: string
  readonly what: string
  readonly example: ReactNode
  readonly cost: string
  readonly fix: ReactNode
  readonly label: string
  readonly sample?: 'button' | 'link'
}[] = [
  {
    id: 'literal',
    name: 'Wrong value form',
    what: 'A raw value sits in a layer of aliases, or an alias sits in a layer of raw values.',
    example: (
      <>
        <code>semantic.accent.solid</code> holds a color object in place of an
        alias.
      </>
    ),
    cost: 'The next rebrand misses it. Switch it on: the hue turns, and this button stays behind.',
    fix: 'Restore the alias. A new color goes in as a primitive first.',
    label: 'Hard-code the accent',
    sample: 'button',
  },
  {
    id: 'skip',
    name: 'Reference not allowed',
    what: 'An alias points at a layer its own layer may not reference, or at a token outside every layer.',
    example: (
      <>
        <code>component.link.text</code> points at{' '}
        <code>{'{primitives.color.brand.45}'}</code>.
      </>
    ),
    cost: 'A theme re-aliases the semantic layer, so it can no longer reach this token. Switch it on: the page goes dark, and this link drops below AA.',
    fix: 'Point it at a semantic token, or add a semantic token for it to read.',
    label: 'Skip a layer',
    sample: 'link',
  },
  {
    id: 'stray',
    name: 'Token outside every layer',
    what: 'The first segment of the token path matches no layer in the config.',
    example: (
      <>
        <code>brand.accent</code>, with no layer for <code>brand</code>.
      </>
    ),
    cost: 'No layer rule covers it, so nothing checks what it holds or what it references.',
    fix: 'Move the token under a layer root, or add its first segment to a layer’s roots.',
    label: 'Add a stray token',
  },
  {
    id: 'owner',
    name: 'No owner',
    what: 'No owner covers the token’s top-level group, and the config sets no default.',
    example: (
      <>
        This page’s config with <code>ownership.default</code> removed.
      </>
    ),
    cost: 'Nobody reviews a change to these tokens. Switch it on and count them.',
    fix: (
      <>
        Add <code>ownership.default</code>, or an owner for that top-level
        group.
      </>
    ),
    label: 'Remove the default owner',
  },
]

const valueTypes = [
  'dimension',
  'duration',
  'number',
  'fontFamily',
  'fontWeight',
  'cubicBezier',
]

const supported = [
  {
    id: 'color',
    text: <>Colors in all 14 DTCG color spaces, written as color objects</>,
  },
  {
    id: 'types',
    text: valueTypes.map((type, index) => (
      <Fragment key={type}>
        {index === 0 ? null : index === valueTypes.length - 1 ? ', and ' : ', '}
        <code>{type}</code>
      </Fragment>
    )),
  },
  {
    id: 'aliases',
    text: (
      <>
        Group <code>$type</code>, <code>$root</code> tokens, and{' '}
        <code>{'{group.token}'}</code> aliases
      </>
    ),
  },
  {
    id: 'metadata',
    text: (
      <>
        <code>$description</code>, <code>$deprecated</code>, and vendor{' '}
        <code>$extensions</code>, kept in the built file
      </>
    ),
  },
]

const notYet = [
  {
    id: 'composites',
    text: (
      <>
        Composite types: <code>shadow</code>, <code>typography</code>,{' '}
        <code>border</code>, <code>gradient</code>, <code>transition</code>,{' '}
        <code>strokeStyle</code>
      </>
    ),
  },
  {
    id: 'pointers',
    text: (
      <>
        JSON Pointer <code>$ref</code> aliases and group <code>$extends</code>
      </>
    ),
  },
  {
    id: 'resolver',
    text: (
      <>
        A Resolver file as a local source. <code>primitree build</code> writes
        one value per token. This site calls <code>applyResolver</code> and{' '}
        <code>emitCss</code> from a script for its themes, and checks each
        context as its own source.
      </>
    ),
  },
  {
    id: 'files',
    text: (
      <>
        Token sets split across files in a configured source. A source reads one
        file, and an alias into another file stops <code>check</code> with exit
        2.
      </>
    ),
  },
]

const configNotes = [
  {
    term: 'roots',
    text: 'The top-level groups that belong to the layer. Primitree compares the first segment of each token path, case included.',
  },
  {
    term: 'values',
    text: (
      <>
        A <code>'literal'</code> layer holds raw values. A{' '}
        <code>'reference'</code> layer holds aliases such as{' '}
        <code>{'{primitives.color.brand.45}'}</code>, and an{' '}
        <code>'either'</code> layer accepts both.
      </>
    ),
  },
  {
    term: 'references',
    text: 'The layers an alias in this layer may point at. A layer that leaves itself out cannot alias its own tokens.',
  },
  {
    term: 'ownership',
    text: 'The owners of each top-level group, with a default for the rest.',
  },
  {
    term: 'outputs',
    text: (
      <>
        The directory <code>build</code> writes to, and the formats it writes.
      </>
    ),
  },
]

function diffExcerpt(): string {
  const lines = siteCli['diff-theme'].stdout.split('\n')
  return lines.slice(0, 9).join('\n')
}

/** The calls the rule switches run, read from the file so they cannot drift. */
function checkExcerpt() {
  const source = readFileSync(
    resolve(tokensRoot, '../lib/tokens/page-check-core.ts'),
    'utf8'
  )
  const excerpt =
    /^ {2}const fragment = [\s\S]*?^ {2}const report = .*$/mu.exec(source)
  if (excerpt === null) {
    throw new Error('page-check-core.ts no longer holds the check calls.')
  }
  return excerpt[0].replace(/^ {2}/gmu, '')
}

/** One real finding, one field to a line, so its owners stand out. */
function skipFindingJson() {
  const [finding] = JSON.parse(siteCli['break-skip-json'].stdout).findings
  const fields = Object.entries(finding as Record<string, unknown>).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  )
  return `{\n${fields.join(',\n')}\n}`
}

const ciSample = `- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- uses: actions/setup-node@v7
  with:
    node-version: 24
- run: npm ci
- run: npx primitree check
- run: npx primitree build --check
- run: |
    git show origin/main:tokens.json > base.tokens.json
    npx primitree diff base.tokens.json tokens.json --config primitree.config.ts`

const hooksSample = `import { TokensProvider, useToken } from '@primitree/hooks'

export function App({ tokens, resolver }) {
  return (
    <TokensProvider tokens={tokens} resolver={resolver}>
      <Button />
    </TokensProvider>
  )
}

function Button() {
  const background = useToken(
    'component.button.primary.background'
  )
  return (
    <button style={{ background: background.css ?? undefined }}>
      Ship
    </button>
  )
}`

/** The primary button reads these through its class, in this order. */
const buttonReads = reads(
  'component.button.primary.backgroundHover',
  'component.button.primary.background',
  'component.button.radius',
  'component.button.primary.text'
)

const linkBinding = bind({
  color: 'component.link.text',
  textDecorationColor: 'component.link.underline',
})

/** The homepage in reading order: the graph that runs the page, the rules, the
 * theme with the CSS it writes, the config, the workflow, the reach, the
 * limits, every token, and the install. */
export function HomePage() {
  const version = readPrimitreeVersion()
  const counts = layerCounts()
  const total = counts.component + counts.semantic + counts.primitives
  const skip = siteCli['break-skip']

  return (
    <div className='home'>
      <section
        className='hero'
        aria-labelledby='hero-title'>
        <h1
          id='hero-title'
          className='hero-title'
          {...reads(
            'semantic.type.display.fontFamily',
            'semantic.type.display.fontWeight',
            'semantic.text.primary'
          )}>
          <span>Govern token change.</span>{' '}
          <span>Know every token it reaches.</span>
        </h1>
        <div className='hero-body'>
          <p
            className='hero-lede'
            {...bind({ color: 'semantic.text.primary' })}>
            One config declares your layers, what each may reference, and who
            owns it. <code>primitree check</code> fails CI when a DTCG token
            breaks a rule, and <code>primitree diff</code> lists every token a
            change reaches.
          </p>
          <Crown
            ring={ringColors()}
            zones={zones}
          />
          <div className='hero-action'>
            <InstallChooser id='hero-install' />
            <Link
              href='/docs/getting-started'
              className='button-primary'
              {...buttonReads}>
              Read the quickstart
              <ArrowRightIcon size={16} />
            </Link>
          </div>
          <p
            className='hero-invite'
            {...bind({ color: 'semantic.text.secondary' })}>
            @primitree/core and @primitree/dtcg run the check and write the CSS
            from the {total} tokens in the graph. The dial is this site’s
            solver. Turn the dial, break a rule, look all the way down.
          </p>
        </div>
        <TokenGraph />
        <p className='hero-source'>
          The check reads the tokens as shipped, at hue {BRAND_HUE}.
        </p>
      </section>

      <section
        className='rules section'
        aria-labelledby='rules-title'>
        <div className='section-head'>
          <h2 id='rules-title'>Break a rule and see what it costs.</h2>
          <p>
            <code>check</code> reads your layers from{' '}
            <code>primitree.config.ts</code> and prints one line per finding.
            Any finding exits 1, and <code>build</code> writes nothing until the
            file passes. A file with a composite type, <code>$ref</code>,{' '}
            <code>$extends</code>, or a Resolver stops <code>check</code> with
            exit 2. Each switch below applies its edit to a copy of this page’s
            tokens or config, runs the real check in this tab, and shows the
            cost on the page.
          </p>
        </div>
        <ul className='rules-list'>
          {rules.map(rule => {
            const { code } = ruleBreaks[rule.id]
            return (
              <li
                key={rule.id}
                id={code.toLowerCase()}
                className='rule'>
                <div className='rule-head'>
                  <h3 className='rule-name'>
                    {rule.name}
                    <code className='rule-code'>{code}</code>
                  </h3>
                  <RuleDiagram id={rule.id} />
                </div>
                <dl className='rule-details'>
                  <div>
                    <dt>Meaning</dt>
                    <dd>{rule.what}</dd>
                  </div>
                  <div>
                    <dt>Example</dt>
                    <dd>{rule.example}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{rule.cost}</dd>
                  </div>
                  <div>
                    <dt>Fix</dt>
                    <dd>{rule.fix}</dd>
                  </div>
                </dl>
                <div className='rule-demo'>
                  {rule.sample === 'button' ? (
                    <Link
                      href='/docs/getting-started'
                      className='button-primary'
                      {...buttonReads}>
                      This button
                    </Link>
                  ) : null}
                  {rule.sample === 'link' ? (
                    <Link
                      href='/docs/cli/check#findings'
                      className='text-link'
                      {...linkBinding}>
                      This link
                    </Link>
                  ) : null}
                  <RuleSwitch
                    id={rule.id}
                    label={rule.label}
                  />
                </div>
              </li>
            )
          })}
        </ul>
        <figure className='rules-proof'>
          <figcaption>
            The same skip through the CLI, on a scratch copy of this page’s
            tokens with one extra source for the broken file. The JSON report
            names who owns the token. Below is its one finding, one field to a
            line.
          </figcaption>
          <Transcript>
            <span
              className='run-prompt'
              aria-hidden='true'>
              ${' '}
            </span>
            <CommandWords text={skip.command} />
            {`\n${skip.stderr}\n\n`}
            <span
              className='run-prompt'
              aria-hidden='true'>
              ${' '}
            </span>
            <CommandWords text={siteCli['break-skip-json'].command} />
            {`\n${skipFindingJson()}`}
          </Transcript>
        </figure>
        <p className='section-more'>
          <Link
            href='/docs/cli/check#findings'
            className='text-link'
            {...linkBinding}>
            See the exact output for each finding in the check reference
          </Link>
        </p>
      </section>

      <ThemeSection />

      <section
        className='config section'
        aria-labelledby='config-title'>
        <div className='section-head'>
          <h2 id='config-title'>
            primitree.config.ts declares three layers and two owners.
          </h2>
          <p>
            Each layer names the top-level groups that belong to it, the value
            form its tokens hold, and the layers its aliases may point at.{' '}
            <code>check</code>, <code>diff</code>, <code>inspect</code>, and{' '}
            <code>build</code> all read the same file. Layer rules and ownership
            are data here, so there is no lint plugin to write. This is the file
            that governs this page.
          </p>
        </div>
        <div className='config-body'>
          <CodePanel
            code={tokenFile('primitree.config.ts')}
            lang='ts'
            title='apps/docs/tokens/primitree.config.ts'
            copy
            className='config-file'
          />
          <dl className='config-notes'>
            {configNotes.map(note => (
              <div key={note.term}>
                <dt>
                  <code>{note.term}</code>
                </dt>
                <dd>{note.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        className='workflow section'
        aria-labelledby='workflow-title'>
        <div className='section-head'>
          <h2 id='workflow-title'>
            Four commands: check, inspect, diff, and build.
          </h2>
        </div>
        <ol className='workflow-steps'>
          <li className='workflow-step'>
            <div className='workflow-copy'>
              <h3>Fail on a broken rule</h3>
              <p>
                On a configured source, <code>check</code> exits 0 on a pass, 1
                on any finding, and 2 on a config or input error, so CI fails
                any change that breaks a rule.
              </p>
            </div>
            <Transcript>
              <RunCommand
                args={siteCli.check.command.replace('primitree ', '')}
              />
              {`\n${siteCli.check.stdout}`}
            </Transcript>
          </li>
          <li className='workflow-step'>
            <div className='workflow-copy'>
              <h3>Name the owner</h3>
              <p>
                <code>inspect</code> explains one token: its alias chain, its
                owners, each token that reads it, and where it lives in the
                file. A reviewer knows who to ask before they approve.
              </p>
            </div>
            <Transcript>
              <RunCommand
                args={siteCli.inspect.command.replace('primitree ', '')}
              />
              {`\n${siteCli.inspect.stdout}`}
            </Transcript>
          </li>
          <li className='workflow-step'>
            <div className='workflow-copy'>
              <h3>List what it reaches</h3>
              <p>
                <code>diff</code> pairs each change with the tokens it affects.
                Here the dark theme reads as a change: {rerouted.length}{' '}
                semantic tokens, and every component token they reach. It exits
                1 while the new file still holds a finding and prints the
                counts; <code>check</code> on that file names each one. It
                follows token references and stops at the file, so a stylesheet
                that reads a token does not count.
              </p>
            </div>
            <Transcript>
              <RunCommand
                args={siteCli['diff-theme'].command.replace('primitree ', '')}
              />
              {`\n${diffExcerpt()}\n…`}
            </Transcript>
          </li>
          <li className='workflow-step'>
            <div className='workflow-copy'>
              <h3>Keep the build current</h3>
              <p>
                <code>build</code> checks the rules before it writes.{' '}
                <code className='nowrap'>build --check</code> exits 1 when the
                generated files no longer match the source, so a pull request
                that skips the rebuild fails CI.
              </p>
            </div>
            <Transcript>
              <RunCommand
                args={siteCli.build.command.replace('primitree ', '')}
              />
              {`\n${siteCli.build.stdout}\n\n`}
              <RunCommand
                args={siteCli['build-check'].command.replace('primitree ', '')}
              />
              {`\n${siteCli['build-check'].stdout}`}
            </Transcript>
          </li>
        </ol>
        <div className='workflow-step workflow-ci'>
          <div className='workflow-copy'>
            <h3>Put all of it in CI</h3>
            <p>
              <code>check</code> exits 1 on a finding and{' '}
              <code className='nowrap'>build --check</code> exits 1 on a stale
              build, so either one fails the job. <code>diff</code> prints the
              reach into the job log and exits 1 when the new file holds a
              finding. A changed value exits 0, and so does a removed token
              nothing reads, so those wait for a reviewer.
            </p>
          </div>
          <CodePanel
            code={ciSample}
            title='Example workflow'
            note='excerpt'
            plain
          />
        </div>
      </section>

      <section
        className='reach section'
        aria-labelledby='reach-title'>
        <div className='section-head'>
          <h2 id='reach-title'>
            Each rule switch calls @primitree/core in your browser.
          </h2>
          <p>
            <code>@primitree/core</code> holds the rules,{' '}
            <code>@primitree/dtcg</code> reads your tokens and emits the
            outputs, and the CLI calls them. Your scripts, your agents, and your
            React app read the same tokens.
          </p>
        </div>
        <div className='workflow-step reach-library'>
          <div className='workflow-copy'>
            <h3>Run the check from a script</h3>
            <p>
              Your browser ran these lines when you flipped a switch, and each
              finding came back with its owners. <code>evaluatePolicy</code>{' '}
              also takes a <code>baseline</code> of known finding IDs, so an old
              file can adopt the rules and still fail on anything new. The CLI
              has no option for a baseline yet. Each call returns a value or its
              diagnostics, and <code>unwrap</code> is this site’s helper that
              throws on the diagnostics.
            </p>
          </div>
          <CodePanel
            code={checkExcerpt()}
            lang='ts'
            title='apps/docs/lib/tokens/page-check-core.ts'
            note='excerpt'
          />
        </div>
        <div className='workflow-copy reach-lede'>
          <h3>Hand the same tokens to agents and React</h3>
          <p>
            <code>@primitree/mcp</code> serves a token directory over the Model
            Context Protocol, and <code>@primitree/hooks</code> reads the built
            tokens in React. This is what the server returned for this page’s
            tokens.
          </p>
        </div>
        <div className='reach-body'>
          <figure className='reach-proof'>
            <figcaption>
              An agent asks <code>get_token</code> and reads this back
            </figcaption>
            <Transcript>
              <CommandWords text={siteCli.mcp.command} />
              {`\n${siteCli.mcp.stdout}`}
            </Transcript>
          </figure>
          <CodePanel
            code={hooksSample}
            title='Reading a token in React'
            plain
          />
        </div>
      </section>

      <section
        className='limits section'
        aria-labelledby='limits-title'>
        <div className='section-head'>
          <h2 id='limits-title'>
            Reads DTCG 2025.10, except composite types, $ref, $extends, and
            Resolver files.
          </h2>
          <p>
            DTCG 2025.10 is the Design Tokens Community Group’s Final Community
            Group Report. It is not a W3C Standard, and Primitree is not a W3C
            project.
          </p>
        </div>
        <div className='limits-body'>
          <div className='limits-list'>
            <h3>Reads and writes</h3>
            <ul>
              {supported.map(item => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </div>
          <div className='limits-list'>
            <h3>Not yet</h3>
            <ul>
              {notYet.map(item => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
            <p className='limits-note'>
              A file that uses one of these stops <code>check</code> with exit
              2.
            </p>
            <p className='limits-note'>
              <code>diff</code> follows token references and does not read your
              CSS or components, so a token that a stylesheet reads prints{' '}
              <code>Affected tokens: none</code>.
            </p>
          </div>
          <dl className='limits-facts'>
            <div>
              <dt>Release</dt>
              <dd>
                <code>{version}</code>, npm tag <code>next</code>
              </dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>Node.js 24 or newer</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>MIT</dd>
            </div>
            <div>
              <dt>Packages</dt>
              <dd>
                <code>@primitree/cli</code>, <code>core</code>,{' '}
                <code>dtcg</code>, <code>hooks</code>, <code>mcp</code>, and the{' '}
                <code>primitree</code> launcher
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section
        className='ledger section'
        aria-labelledby='ledger-title'>
        <Ledger total={total} />
      </section>

      <section
        className='close'
        aria-labelledby='close-title'
        {...bind({
          backgroundColor: 'component.close.background',
          color: 'component.close.text',
        })}>
        <div className='close-copy'>
          <h2 id='close-title'>Run the check on your own tokens.</h2>
          <ol className='close-steps'>
            <li>
              Add <code>primitree.config.ts</code>, with your layers and a
              default owner, next to your DTCG file.
            </li>
            <li>
              Run{' '}
              <code>
                <RunCommand
                  args='check'
                  prompt={false}
                />
              </code>
              .
            </li>
            <li>
              Add <code>check</code> to CI.
            </li>
          </ol>
        </div>
        <InstallChooser
          id='close-install'
          className='close-install'
        />
        <nav
          className='close-links'
          aria-label='Next steps'>
          <Link href='/docs/getting-started'>Quickstart</Link>
          <Link href='/docs/cli'>CLI reference</Link>
          <Link
            href={links.playground}
            prefetch={false}>
            Playground
          </Link>
          <a
            href={`${links.github}/tree/main/examples/brand`}
            target='_blank'
            rel='noopener noreferrer'>
            A small starter on GitHub
          </a>
          <a
            href={links.github}
            target='_blank'
            rel='noopener noreferrer'>
            Source on GitHub
          </a>
        </nav>
        <p className='close-colophon'>
          <CloseChain />
          <BuildLine total={total} />
        </p>
      </section>
    </div>
  )
}
