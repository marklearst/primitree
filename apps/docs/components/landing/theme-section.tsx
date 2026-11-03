import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CodePanel } from '@/components/landing/code-panel'
import { type Placed, ribbonPath } from '@/lib/tokens/graph-layout'
import { siteTokens, tokenVar } from '@/lib/tokens/site-graph'
import { cssVarOf } from '@/lib/tokens/site-graph-names'
import { brandCaps, INK_ARC, neutralCaps } from '@/lib/tokens/solver'
import type { TokenPath } from '@/tokens/generated/token-path'

/* The theme section: the semantic tokens the dark theme re-aliases, the ramps
   they land on, and the CSS emitCss wrote for them. tokens.css is read once,
   and every count on the page comes from the same block the excerpt shows. */

const tokensCss = readFileSync(
  resolve(process.cwd(), 'tokens/generated/tokens.css'),
  'utf8'
).trimEnd()

const darkStart = tokensCss.indexOf("[data-theme='dark'] {")
/** The theme block, as tokens.css holds it. */
const darkBlock = tokensCss.slice(
  darkStart,
  tokensCss.indexOf('}', darkStart) + 1
)

/** The chain from the button's background down to its primitive, and the theme
 * block, as tokens.css holds them. */
function cssExcerpt(): string {
  const line = (name: string) =>
    tokensCss.split('\n').find(text => text.trim().startsWith(`${name}:`)) ?? ''
  return [
    ':root {',
    line('--primitives-color-brand-45'),
    line('--semantic-accent-solid'),
    line('--component-button-primary-background'),
    '}',
    '',
    darkBlock,
  ].join('\n')
}

const cssSample = cssExcerpt()

/** The semantic tokens the dark block re-aliases, in the order tokens.css holds
 * them, each with the primitive it reads in each theme from the graph. */
export const rerouted: readonly {
  readonly path: TokenPath
  readonly light: TokenPath
  readonly dark: TokenPath
}[] = darkBlock
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith('--semantic'))
  .map(line => {
    const name = line.slice(0, line.indexOf(':'))
    const token = siteTokens.find(item => cssVarOf(item.path) === name)
    if (
      token === undefined ||
      token.target.light === null ||
      token.target.dark === null
    ) {
      throw new Error(`${name} re-aliases no primitive in the graph.`)
    }
    return {
      path: token.path,
      light: token.target.light,
      dark: token.target.dark,
    }
  })

const ramps = [
  {
    id: 'neutral',
    steps: Object.keys(neutralCaps)
      .map(Number)
      .sort((a, b) => b - a),
  },
  {
    id: 'brand',
    steps: Object.keys(brandCaps)
      .map(Number)
      .sort((a, b) => b - a),
  },
  { id: 'red', steps: [97, 72, 45, 15] },
  { id: 'amber', steps: [72, 45, 15] },
] as const

const ribbonWidth = 700
const ribbonHeight = 140

/* The re-aliased tokens in the order their light targets sit on the ramps, so
   the ribbons run in parallel and a theme flip is what crosses them. */
const steps = ramps.flatMap(ramp =>
  ramp.steps.map(step => `primitives.color.${ramp.id}.${step}`)
)
const landing = (primitive: TokenPath) => steps.indexOf(primitive)
const rows = [...rerouted].sort((a, b) => landing(a.light) - landing(b.light))

/** The ribbons from the semantic row down onto the ramps. A ribbon that differs
 * by theme is drawn twice, and CSS shows the one the theme reads. */
function ThemeRibbons() {
  const columnWidth = ribbonWidth / rows.length
  return (
    <svg
      className='theme-ribbons'
      viewBox={`0 0 ${ribbonWidth} ${ribbonHeight}`}
      preserveAspectRatio='none'
      aria-hidden='true'>
      {rows.flatMap((item, index) => {
        const upper: Placed = { x: (index + 0.5) * columnWidth, y: 0 }
        const pairs =
          item.light === item.dark
            ? [['both', item.light] as const]
            : [['light', item.light] as const, ['dark', item.dark] as const]
        return pairs.map(([only, primitive]) => {
          const lower: Placed = {
            x: ((landing(primitive) + 0.5) * ribbonWidth) / steps.length,
            y: ribbonHeight,
          }
          return (
            <path
              key={`${item.path}-${only}`}
              className='theme-ribbon'
              data-from={item.path}
              data-to={primitive}
              data-only={only === 'both' ? undefined : only}
              d={ribbonPath(lower, upper, 9, 3)}
              style={{ fill: tokenVar(primitive) }}
            />
          )
        })
      })}
    </svg>
  )
}

export function ThemeSection() {
  return (
    <section
      className='theme section'
      aria-labelledby='theme-title'>
      <div className='section-head'>
        <h2 id='theme-title'>A theme changes one layer.</h2>
        <p>
          The dark theme here re-aliases {rerouted.length} semantic tokens and
          changes no primitive. A step number is CIE L*, so a step names a
          luminance at every hue. The dial writes primitives on{' '}
          <code>{'<html>'}</code>. For hues {INK_ARC[0]} to {INK_ARC[1]} the
          solid has to stay light, so it also re-aliases three semantic tokens
          and the label turns dark to hold AA.
        </p>
      </div>
      <ol
        className='theme-semantic'
        aria-label='The semantic tokens the dark theme re-aliases, with their current values'>
        {rows.map(({ path }) => (
          <li
            key={path}
            className='theme-node'
            data-tokens={path}>
            <span
              className='theme-node-swatch'
              style={{ backgroundColor: tokenVar(path) }}
            />
            <code>{path.slice('semantic.'.length)}</code>
          </li>
        ))}
      </ol>
      <ThemeRibbons />
      <div className='theme-ramps'>
        {ramps.map(ramp => (
          <ol
            key={ramp.id}
            className='ramp'
            data-ramp={ramp.id}
            style={{ flex: ramp.steps.length }}
            aria-label={`The ${ramp.id} primitives, by step`}>
            {ramp.steps.map((step, index) => {
              const path = `primitives.color.${ramp.id}.${step}` as TokenPath
              return (
                <li
                  key={step}
                  className='ramp-step'
                  data-tokens={path}
                  style={{ backgroundColor: tokenVar(path) }}>
                  <span
                    className='ramp-label'
                    style={{
                      color:
                        step > 50
                          ? tokenVar('primitives.color.neutral.8')
                          : tokenVar('primitives.color.neutral.97'),
                    }}>
                    {index === 0 ? (
                      <span className='ramp-family'>{ramp.id}</span>
                    ) : null}
                    {step}
                  </span>
                </li>
              )
            })}
          </ol>
        ))}
      </div>
      <div className='theme-css'>
        <div className='workflow-copy'>
          <h3>
            The same {rerouted.length} tokens, as <code>emitCss</code> wrote
            them
          </h3>
          <p>
            Each component variable reads its semantic variable, which reads the
            primitive. <code>primitree build</code> writes that chain in one{' '}
            <code>:root</code>.
          </p>
        </div>
        <CodePanel
          code={cssSample}
          lang='css'
          title='apps/docs/tokens/generated/tokens.css'
          note='excerpt'
        />
      </div>
    </section>
  )
}
