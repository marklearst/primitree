import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { cssVarOf } from '../lib/tokens/site-graph-names.ts'
import { contrast, solvePrimitives } from '../lib/tokens/solver.ts'

const formerBrandColors = [
  '#8b9cff',
  '#8b9cff40',
  '#6d82ff',
  '#7b8cff',
  '#c7d2fe',
  '#a78bfa',
  '#ff6b81',
  '#a8c95f',
  '#5f7f2f',
  '#dde9b9',
  '#45c98b',
  '#f2b84b',
  '#f27575',
  'rgba(139, 156, 255',
  'rgba(123, 140, 255',
  'rgba(255, 107, 129',
  'rgb(168 201 95',
  'rgb(69 201 139',
] as const

async function read(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8')
}

/** Whether the last rule for the selector that sets the property gives it that
 * value, read from the parsed stylesheet so a reformat or a shadowing rule
 * cannot fool it. */
function declared(
  css: string,
  selector: string,
  property: string,
  value: string
) {
  let last: string | undefined
  postcss.parse(css).walkRules(rule => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls(property, declaration => {
        last = declaration.value
      })
    }
  })
  return last === value
}

type Theme = 'light' | 'dark'

interface GraphToken {
  readonly path: string
  readonly target: Readonly<Record<Theme, string | null>>
}

const themes = ['light', 'dark'] as const
const graph = JSON.parse(await read('../tokens/generated/graph.json')) as {
  readonly tokens: readonly GraphToken[]
}
const tokenAt = new Map(graph.tokens.map(token => [token.path, token]))
const tokenByVariable = new Map(
  graph.tokens.map(token => [cssVarOf(token.path), token])
)

/** The custom properties a stylesheet declares, and what each one holds. */
function declaredVariables(css: string) {
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//gu, '')
  return new Map(
    [...uncommented.matchAll(/(--[\w-]+):\s*([^;{}]+);/gu)].map(
      ([, name = '', value = '']) => [name, value.trim()]
    )
  )
}

const siteVariables = declaredVariables(await read('../app/global.css'))

/** Follows a site role through its aliases to the primitive it paints. */
function primitiveBehind(variable: string, theme: Theme): string {
  const value = siteVariables.get(variable)
  if (value !== undefined) {
    const alias = /^var\((--[\w-]+)\)$/u.exec(value)?.[1]
    assert.ok(alias, `${variable} must hold one alias, found ${value}`)
    return primitiveBehind(alias, theme)
  }
  const token = tokenByVariable.get(variable)
  assert.ok(token, `${variable} names no token`)
  let path = token.path
  for (;;) {
    const next = tokenAt.get(path)?.target[theme] ?? null
    if (next === null) {
      return path
    }
    path = next
  }
}

const solvedAt = new Map<number, ReturnType<typeof solvePrimitives>>()

function solvedHex(variable: string, theme: Theme, hue: number) {
  const solved = solvedAt.get(hue) ?? solvePrimitives(hue)
  solvedAt.set(hue, solved)
  const [, , family = '', step = ''] = primitiveBehind(variable, theme).split(
    '.'
  )
  const hex = (solved as Record<string, Record<string, { hex: string }>>)[
    family
  ]?.[step]?.hex
  assert.ok(hex, `the solver wrote no ${family}.${step}`)
  return hex
}

/** Text and the surface it sits on, by the role the documentation shell and the
 * playground read. The dial's hue follows a reader onto both, so each pair has
 * to hold at every hue. */
const documentationTextPairs = [
  ['--color-fd-foreground', '--color-fd-background'],
  ['--color-fd-muted-foreground', '--color-fd-background'],
  ['--color-fd-muted-foreground', '--color-fd-muted'],
  ['--color-fd-popover-foreground', '--color-fd-popover'],
  ['--color-fd-card-foreground', '--color-fd-card'],
  ['--color-fd-primary', '--color-fd-background'],
  ['--color-fd-primary-foreground', '--color-fd-primary'],
  ['--color-fd-secondary-foreground', '--color-fd-secondary'],
  ['--color-fd-accent-foreground', '--color-fd-accent'],
  ['--color-fd-success', '--color-fd-background'],
  ['--color-fd-warning', '--color-fd-background'],
  ['--color-fd-error', '--color-fd-background'],
] as const

const playgroundTextPairs = [
  ['--color-primitree-text', '--color-primitree-bg'],
  ['--color-primitree-text', '--color-primitree-surface'],
  ['--color-primitree-text', '--color-primitree-raised'],
  ['--color-primitree-muted', '--color-primitree-bg'],
  ['--color-primitree-muted', '--color-primitree-surface'],
  ['--color-primitree-muted', '--color-primitree-raised'],
  ['--color-primitree-dim', '--color-primitree-bg'],
  ['--color-primitree-dim', '--color-primitree-surface'],
  ['--color-primitree-dim', '--color-primitree-accent-wash'],
  ['--color-primitree-accent', '--color-primitree-bg'],
  ['--color-primitree-accent', '--color-primitree-raised'],
  ['--color-primitree-accent', '--color-primitree-accent-wash'],
  ['--color-primitree-accent-ink', '--color-primitree-accent-fill'],
  ['--color-primitree-error', '--color-primitree-bg'],
  ['--color-primitree-error', '--color-primitree-raised'],
  ['--color-primitree-error', '--color-primitree-tint-fail'],
  ['--color-primitree-warn', '--color-primitree-bg'],
] as const

function flatCssRules(theme: string) {
  return [...theme.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(
    ([, selectors = '', declarations = '']) => ({
      declarations,
      selectors,
    })
  )
}

test('documentation theme maps every palette role onto a semantic token', async () => {
  const theme = await read('../app/global.css')
  const roles = [...siteVariables].filter(([name]) =>
    name.startsWith('--color-primitree-')
  )

  assert.ok(roles.length >= 20, 'the scan must reach the palette roles')
  for (const [name, value] of roles) {
    assert.match(
      value,
      /^var\(--semantic-[\w-]+\)$/u,
      `${name} must alias one semantic token`
    )
    const variable = /^var\((--[\w-]+)\)$/u.exec(value)?.[1] ?? ''
    assert.ok(tokenByVariable.has(variable), `${value} names no token`)
  }
  assert.match(
    theme,
    /::selection\s*\{\s*background: var\(--semantic-accent-subtle\);/u
  )
  assert.doesNotMatch(
    theme.replace(/\/\*[\s\S]*?\*\//gu, ''),
    /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\(/iu
  )
})

test('documentation theme imports the tokens and leaves themes to them', async () => {
  const [theme, tokens] = await Promise.all([
    read('../app/global.css'),
    read('../tokens/generated/tokens.css'),
  ])

  assert.match(theme, /@import '\.\.\/tokens\/generated\/tokens\.css';/u)
  assert.doesNotMatch(theme, /:root\[data-theme='light'\] \{[^}]*--color-/u)

  const dark = tokens.match(/^\[data-theme='dark'\] \{\n([\s\S]*?)^\}/mu)?.[1]
  assert.ok(dark, 'the generated file must hold the dark block')
  const lines = dark.trim().split('\n')
  assert.ok(lines.length > 0)
  for (const line of lines) {
    assert.match(
      line.trim(),
      /^--semantic-[\w-]+: var\(--primitives-[\w-]+\);$/u,
      'a theme re-aliases the semantic layer and changes no primitive'
    )
  }
})

test('every token a theme reroutes lands on a primitive in both themes', () => {
  const rerouted = graph.tokens.filter(
    token => token.target.light !== token.target.dark
  )

  assert.ok(rerouted.length > 0)
  for (const token of rerouted) {
    assert.match(token.path, /^semantic\./u)
    for (const theme of themes) {
      assert.match(
        primitiveBehind(cssVarOf(token.path), theme),
        /^primitives\./u
      )
    }
  }
})

for (const [surface, pairs] of [
  ['documentation shell', documentationTextPairs],
  ['playground', playgroundTextPairs],
] as const) {
  test(`${surface} text clears AA at every hue in both themes`, () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 1) {
      for (const theme of themes) {
        for (const [foreground, background] of pairs) {
          const ratio = contrast(
            solvedHex(foreground, theme, hue),
            solvedHex(background, theme, hue)
          )
          if (ratio < 4.5) {
            failures.push(
              `${hue} ${theme} ${foreground} on ${background}: ${ratio.toFixed(2)}`
            )
          }
        }
      }
    }
    assert.deepEqual(failures, [])
  })
}

test('the playground warning clears AA on its own wash', async () => {
  const playground = await read('../components/playground/playground.css')
  const wash =
    /\.pg-warnings\s*\{[^}]*background: rgb\((\d+) (\d+) (\d+) \/ (\d+)%\);/u.exec(
      playground
    )
  assert.ok(wash, 'the warning must state its wash')
  const [, red = '', green = '', blue = '', alpha = ''] = wash
  const overlay = [red, green, blue].map(Number)
  const opacity = Number(alpha) / 100
  const composite = (surface: string) =>
    `#${[1, 3, 5]
      .map((start, index) =>
        Math.round(
          (overlay[index] ?? 0) * opacity +
            Number.parseInt(surface.slice(start, start + 2), 16) * (1 - opacity)
        )
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`

  const failures: string[] = []
  for (let hue = 0; hue < 360; hue += 1) {
    for (const theme of themes) {
      const ratio = contrast(
        solvedHex('--color-primitree-warn', theme, hue),
        composite(solvedHex('--color-primitree-bg', theme, hue))
      )
      if (ratio < 4.5) {
        failures.push(`${hue} ${theme}: ${ratio.toFixed(2)}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('homepage fades text only for the compile and the graph stage', async () => {
  const home = await read('../components/landing/home.css')
  const decorative =
    /\.graph-stub|\.rule-quiet|\.install-manager-input|\.crown-input/u
  const staged = /\.is-compiling|\.is-focusing|\.show-/u
  const keyframe = /^\s*(?:from|to|[\d.]+%)\s*$/u

  const fadedTextRules = flatCssRules(home).filter(
    ({ declarations, selectors }) =>
      /(?:^|[\s;])opacity\s*:/u.test(declarations) &&
      !/\bopacity\s*:\s*1\s*;/u.test(declarations) &&
      !decorative.test(selectors) &&
      !staged.test(selectors) &&
      !keyframe.test(selectors)
  )

  assert.deepEqual(
    fadedTextRules,
    [],
    'static emphasis must change ribbons and outlines, never text opacity'
  )
})

test('rule diagrams draw at one pixel per unit at their widest', async () => {
  const [home, diagram, tokens] = await Promise.all([
    read('../components/landing/home.css'),
    read('../components/landing/rule-diagram.tsx'),
    read('../tokens/generated/tokens.css'),
  ])
  const ruleFor = (selector: string) =>
    flatCssRules(home).find(
      ({ selectors }) =>
        selectors.replace(/\/\*[\s\S]*?\*\//gu, '').trim() === selector
    )?.declarations ?? ''

  const viewWidth = /viewBox='0 0 (\d+) \d+'/u.exec(diagram)?.[1]
  const maxWidth = /max-width: (\d+)px;/u.exec(ruleFor('.rule-diagram'))?.[1]
  assert.ok(viewWidth && maxWidth, 'the diagram must declare both widths')
  assert.equal(
    maxWidth,
    viewWidth,
    'a diagram at its widest draws at one CSS pixel per unit'
  )
  assert.match(ruleFor('.rule-diagram'), /width: 100%;/u)

  assert.match(
    ruleFor('.rule-label'),
    /font-size: var\(--semantic-type-caption-fontSize\);/u
  )
  const caption = declaredVariables(tokens).get(
    '--semantic-type-caption-fontSize'
  )
  const primitive = /^var\((--[\w-]+)\)$/u.exec(caption ?? '')?.[1] ?? ''
  const size = declaredVariables(tokens).get(primitive) ?? ''
  assert.ok(
    Number.parseFloat(size) * 16 >= 12,
    `the caption must hold at least 12px, found ${size}`
  )
})

test('documentation shell maps Fumadocs to the site palette', async () => {
  const theme = await read('../app/global.css')

  assert.doesNotMatch(theme, /--fd-(?:background|foreground|primary|accent):/u)
  assert.match(theme, /--color-fd-background: var\(--color-primitree-bg\);/u)
  assert.match(theme, /--color-fd-foreground: var\(--color-primitree-text\);/u)
  assert.match(theme, /--color-fd-primary: var\(--color-primitree-accent\);/u)
  assert.match(
    theme,
    /--color-fd-primary-foreground: var\(--color-primitree-bg\);/u
  )
  assert.match(
    theme,
    /--color-fd-accent: var\(--color-primitree-accent-wash\);/u
  )
  assert.match(theme, /--color-fd-success: var\(--color-primitree-good\);/u)
  assert.match(theme, /--color-fd-warning: var\(--color-primitree-warn\);/u)
  assert.match(theme, /--color-fd-error: var\(--color-primitree-error\);/u)
})

/** Every stylesheet and component under the homepage folders, so a new file
 * joins the scan without an edit here. */
async function landingSources() {
  const sources: string[] = []
  for (const folder of [
    '../components/landing/',
    '../lib/landing/',
    '../lib/tokens/',
  ]) {
    const entries = await readdir(new URL(folder, import.meta.url), {
      recursive: true,
    })
    for (const entry of entries) {
      if (/\.(?:css|tsx?)$/u.test(entry)) {
        sources.push(await read(`${folder}${entry}`))
      }
    }
  }
  return sources
}

test('documentation brand files contain no former Primitree purple treatment', async () => {
  const sources = await Promise.all([
    read('../app/global.css'),
    read('../components/playground/playground.css'),
    read('../public/favicon.svg'),
    read('../public/primitree-icon.svg'),
  ])
  const landing = await landingSources()
  assert.ok(landing.length >= 10, 'the scan must reach the homepage sources')
  const combined = [...sources, ...landing].join('\n').toLowerCase()

  for (const color of formerBrandColors) {
    assert.equal(combined.includes(color), false, `found former color ${color}`)
  }
})

test('token graph keeps its structural contract', async () => {
  const [home, tokenGraph] = await Promise.all([
    read('../components/landing/home.css'),
    read('../components/landing/token-graph.tsx'),
  ])

  assert.match(tokenGraph, /className='graph-node'/u)
  assert.match(tokenGraph, /className='graph-edge'/u)
  assert.doesNotMatch(
    tokenGraph,
    /(?:linear|radial)Gradient|filter=|pointermove/u
  )
  assert.doesNotMatch(home, /\binfinite\b/u)
  assert.doesNotMatch(home, /\b(?:backdrop-)?filter\s*:/u)
  assert.ok(
    declared(home, '.graph-svg .graph-edge.is-lit', 'fill-opacity', '1')
  )
  assert.ok(
    declared(
      home,
      '.graph-svg .graph-break',
      '--edge-color',
      'var(--component-graph-fail)'
    )
  )
  assert.ok(
    declared(
      home,
      '.graph-node.is-lit .node-swatch',
      'stroke',
      'var(--component-graph-lit)'
    )
  )
  assert.ok(
    declared(
      home,
      '.graph-node:focus-visible > *',
      'stroke',
      'var(--component-focus-ring)'
    )
  )
  assert.doesNotMatch(home, /mark-glow|mark-ring/u)
})

test('a moving dial cuts every bound color straight to its value', async () => {
  const home = await read('../components/landing/home.css')

  for (const selector of [
    ':root[data-dragging] .home [data-tokens]',
    ':root[data-dragging] .island',
    ':root[data-dragging] .node-swatch',
    ':root[data-dragging] .graph-edge',
    ':root[data-dragging] .theme-node-swatch',
    ':root[data-dragging] .install-manager',
  ]) {
    assert.ok(declared(home, selector, 'transition', 'none'), selector)
  }
  assert.ok(
    !declared(
      home,
      ':root[data-dragging] .graph-edge',
      'fill',
      'var(--edge-color)'
    )
  )
})

test('documentation UI uses solid accents, neutral actions, and neutral focus', async () => {
  const [theme, playground, chrome] = await Promise.all([
    read('../app/global.css'),
    read('../components/playground/playground.css'),
    read('../components/landing/site-chrome.tsx'),
  ])

  assert.match(theme, /outline: 2px solid var\(--color-primitree-text\);/u)
  assert.doesNotMatch(playground, /\.pg-title em/u)
  assert.match(
    playground,
    /\.pg-button\.primary\s*\{\s*background: var\(--color-primitree-accent-fill\);\s*color: var\(--color-primitree-accent-ink\);\s*\}/u
  )
  assert.match(playground, /outline: 2px solid var\(--color-primitree-text\);/u)
  assert.match(
    playground,
    /\.pg-tab\.active\s*\{[\s\S]*color: var\(--color-primitree-accent\);/u
  )
  assert.match(
    playground,
    /\.pg-file\.active\s*\{[\s\S]*background: var\(--color-primitree-accent-wash\);[\s\S]*color: var\(--color-primitree-accent\);/u
  )
  assert.match(
    theme,
    /\.mobile-nav a\[aria-current='page'\]\s*\{\s*background: var\(--color-primitree-accent-wash\);\s*color: var\(--color-primitree-accent\);/u
  )
  assert.doesNotMatch(chrome, /bg-primitree-accent-wash/u)
  assert.match(
    theme,
    /\.site-nav-link\[aria-current='page'\]\s*\{[\s\S]*?text-decoration-color: var\(--color-primitree-accent\);/u
  )
  assert.match(
    chrome,
    /import\s*\{\s*FullSearchTrigger,\s*SearchTrigger,\s*\}\s*from 'fumadocs-ui\/layouts\/shared\/slots\/search-trigger'/u
  )
  assert.match(chrome, /GithubIcon/u)
  assert.match(chrome, /aria-label='Primitree on GitHub'/u)
  assert.match(
    theme,
    /\.site-icon-control\s*\{[\s\S]*width: 44px;[\s\S]*height: 44px;/u
  )
})

test('the site is set in Wotfard and MonoLisa, and their binaries stay out of git', async () => {
  const [primitives, fonts, monolisa, layout, home, theme, tokens] =
    await Promise.all([
      read('../tokens/primitives.tokens.json'),
      read('../app/fonts.css'),
      read('../app/monolisa.css'),
      read('../app/layout.tsx'),
      read('../components/landing/home.css'),
      read('../app/global.css'),
      read('../tokens/generated/tokens.css'),
    ])
  const { family, weight } = JSON.parse(primitives).primitives.font

  assert.equal(family.sans.$value[0], 'Wotfard')
  assert.equal(family.mono.$value[0], 'MonoLisa')
  assert.deepEqual(
    Object.keys(weight).filter(key => !key.startsWith('$')),
    ['400', '500']
  )
  assert.match(fonts, /font-family: Wotfard;/u)
  assert.match(monolisa, /font-family: MonoLisa;/u)
  assert.match(layout, /import '\.\/fonts\.css'/u)
  assert.match(layout, /import '\.\/monolisa\.css'/u)
  for (const source of [layout, home, theme, tokens]) {
    assert.doesNotMatch(source, /recursive/iu)
    assert.doesNotMatch(source, /font-variation-settings|--[\w-]*mono-?axis/iu)
  }

  const repository = fileURLToPath(new URL('../../..', import.meta.url))
  for (const binary of [
    'apps/docs/public/fonts/wotfard/wotfard-regular-webfont.woff2',
    'apps/docs/public/fonts/monolisa/0-MonoLisa-normal.woff2',
  ]) {
    const ignored = spawnSync('git', ['check-ignore', '-q', binary], {
      cwd: repository,
    })
    assert.equal(ignored.status, 0, `${binary} must stay gitignored`)
  }
})

test('documentation static mark stays white and favicon uses the mid-tone brand green', async () => {
  const [mark, favicon] = await Promise.all([
    read('../public/primitree-icon.svg'),
    read('../public/favicon.svg'),
  ])

  assert.match(mark, /fill="(?:white|#ffffff)"/iu)
  assert.match(favicon, /fill="#429c5a"/iu)
  assert.equal((mark.match(/\bfill="(?:white|#ffffff)"/giu) ?? []).length, 1)
  assert.equal((favicon.match(/\bfill="#429c5a"/giu) ?? []).length, 1)
})
