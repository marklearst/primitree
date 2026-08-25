import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

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

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map(channel => Number.parseInt(channel, 16) / 255)

  assert.equal(channels?.length, 3, `expected a six-digit hex color: ${hex}`)

  const [red = 0, green = 0, blue = 0] = (channels ?? []).map(channel =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

function compositeHex(foreground: string, background: string, alpha: number) {
  const channels = (value: string) =>
    value
      .slice(1)
      .match(/.{2}/gu)
      ?.map(channel => Number.parseInt(channel, 16)) ?? []
  const foregroundChannels = channels(foreground)
  const backgroundChannels = channels(background)
  assert.equal(foregroundChannels.length, 3)
  assert.equal(backgroundChannels.length, 3)

  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(
        channel * alpha + (backgroundChannels[index] ?? 0) * (1 - alpha)
      )
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function themeHex(theme: string, variable: string) {
  const match = theme.match(new RegExp(`--${variable}: (#[0-9a-f]{6});`, 'u'))
  assert.ok(match?.[1], `missing --${variable}`)
  return match[1]
}

function flatCssRules(theme: string) {
  return [...theme.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(
    ([, selectors = '', declarations = '']) => ({
      declarations,
      selectors,
    })
  )
}

test('documentation theme exposes the approved brand palette', async () => {
  const theme = await read('../app/global.css')

  assert.match(theme, /--color-primitree-accent: #34d399;/u)
  assert.match(theme, /--color-primitree-accent-strong: #0b9464;/u)
  assert.match(theme, /--color-primitree-accent-soft: #6ee7b7;/u)
  assert.match(theme, /--color-primitree-accent-ink: #04251a;/u)
  assert.match(
    theme,
    /--color-primitree-accent-wash: rgb\(52 211 153 \/ 10%\);/u
  )
  assert.match(theme, /--color-primitree-good: #34d399;/u)
  assert.match(theme, /--color-primitree-warn: #fbbf24;/u)
  assert.match(theme, /--color-primitree-error: #f87171;/u)
  assert.match(
    theme,
    /::selection\s*\{\s*background: rgb\(52 211 153 \/ 25%\);/u
  )
})

test('documentation theme carries a complete light overlay', async () => {
  const theme = await read('../app/global.css')
  const lightBlock = theme.match(
    /:root\[data-theme='light'\] \{[\s\S]*?\n\}/u
  )?.[0]
  assert.ok(lightBlock, 'the light theme overlay must exist')

  for (const variable of [
    '--color-primitree-bg: #f6faf8;',
    '--color-primitree-surface: #ffffff;',
    '--color-primitree-text: #0a1510;',
    '--color-primitree-accent: #0b9464;',
    '--color-primitree-accent-ink: #eafff6;',
    '--color-primitree-warn: #b45309;',
    '--color-primitree-error: #dc2626;',
  ]) {
    assert.ok(
      lightBlock.includes(variable),
      `light theme must define ${variable}`
    )
  }
})

test('documentation dim text clears AA contrast on every landing surface', async () => {
  const theme = await read('../app/global.css')
  const dim = themeHex(theme, 'color-primitree-dim')
  const backgrounds = [
    themeHex(theme, 'color-primitree-bg'),
    themeHex(theme, 'color-primitree-surface'),
    compositeHex(
      themeHex(theme, 'color-primitree-accent'),
      themeHex(theme, 'color-primitree-bg'),
      0.1
    ),
  ]

  for (const background of backgrounds) {
    assert.ok(
      contrastRatio(dim, background) >= 4.5,
      `${dim} must clear 4.5:1 against ${background}`
    )
  }
})

test('token graph fades text only for the transient hover trace', async () => {
  const theme = await read('../app/global.css')
  const textBearingSelector =
    /\.graph-node(?!-swatch)|\.graph-violation-tag|\.proof-(?:verdict|detail)/u

  const fadedTextRules = flatCssRules(theme).filter(
    ({ declarations, selectors }) =>
      textBearingSelector.test(selectors) &&
      /\bopacity\s*:/u.test(declarations) &&
      !selectors.includes('[data-dim]')
  )

  assert.deepEqual(
    fadedTextRules,
    [],
    'static outcome emphasis must change connectors and borders, never text opacity'
  )
})

test('token graph scrolls in place and keeps its labels legible', async () => {
  const [theme, graph] = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/token-graph.tsx'),
  ])

  assert.match(graph, /className='graph-svg'/u)
  assert.match(graph, /viewBox=\{`0 0 \$\{VIEW_WIDTH\} \$\{VIEW_HEIGHT\}`\}/u)
  const viewWidth = graph.match(/const VIEW_WIDTH = (\d+)/u)?.[1]
  assert.ok(viewWidth, 'the graph must declare its viewBox width')

  const ruleFor = (selector: string) =>
    flatCssRules(theme).find(
      ({ selectors }) =>
        selectors.replace(/\/\*[\s\S]*?\*\//gu, '').trim() === selector
    )
  const scrollRule = ruleFor('.graph-scroll')
  assert.match(
    scrollRule?.declarations ?? '',
    /overflow-x: auto;/u,
    'the graph must scroll inside its own container on small screens'
  )

  const frameRule = ruleFor('.graph-frame')
  const minWidth = frameRule?.declarations.match(
    /min-width:\s*([0-9.]+)px/u
  )?.[1]
  assert.ok(minWidth, 'the graph frame must set a minimum width')

  const labelRule = ruleFor('.graph-node-label')
  const fontSize = labelRule?.declarations.match(
    /font-size:\s*([0-9.]+)px/u
  )?.[1]
  assert.ok(fontSize, 'graph labels must set a CSS-pixel font size')

  const effectiveFontSize =
    (Number(minWidth) / Number(viewWidth)) * Number(fontSize)
  assert.ok(
    effectiveFontSize >= 12,
    `graph labels must stay at least 12px when scaled (got ${effectiveFontSize.toFixed(2)}px)`
  )
})

test('documentation shell maps Fumadocs to the Lichen theme', async () => {
  const theme = await read('../app/global.css')

  assert.doesNotMatch(theme, /--fd-(?:background|foreground|primary|accent):/u)
  assert.match(theme, /--color-fd-background: var\(--color-primitree-bg\);/u)
  assert.match(theme, /--color-fd-foreground: var\(--color-primitree-text\);/u)
  assert.match(theme, /--color-fd-primary: var\(--color-primitree-accent\);/u)
  assert.match(
    theme,
    /--color-fd-primary-foreground: var\(--color-primitree-accent-ink\);/u
  )
  assert.match(
    theme,
    /--color-fd-accent: var\(--color-primitree-accent-wash\);/u
  )
  assert.match(theme, /--color-fd-success: var\(--color-primitree-good\);/u)
  assert.match(theme, /--color-fd-warning: var\(--color-primitree-warn\);/u)
  assert.match(theme, /--color-fd-error: var\(--color-primitree-error\);/u)
})

test('documentation brand files contain no former Primitree purple treatment', async () => {
  const sources = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/token-graph.tsx'),
    read('../components/landing/proof-panel.tsx'),
    read('../components/landing/install-card.tsx'),
    read('../components/landing/governance-home.tsx'),
    read('../components/playground/playground.css'),
    read('../public/favicon.svg'),
    read('../public/primitree-icon.svg'),
  ])
  const combined = sources.join('\n').toLowerCase()

  for (const color of formerBrandColors) {
    assert.equal(combined.includes(color), false, `found former color ${color}`)
  }
})

test('token graph keeps the structural Lichen contract', async () => {
  const [theme, graph] = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/token-graph.tsx'),
  ])

  assert.match(graph, /className='graph-node'/u)
  assert.match(graph, /className='graph-edge'/u)
  assert.doesNotMatch(graph, /(?:linear|radial)Gradient|filter=|pointermove/u)
  assert.doesNotMatch(graph, /\binfinite\b/u)
  assert.match(
    theme,
    /\.graph-node-box\s*\{[\s\S]*?fill: var\(--color-primitree-surface\);/u
  )
  assert.match(
    theme,
    /\.graph-edge\[data-tone='governed'\]\s*\{[\s\S]*?stroke: var\(--color-primitree-accent\);/u
  )
  assert.match(
    theme,
    /\.graph-edge\[data-tone='violation'\]\s*\{[\s\S]*?stroke: var\(--color-primitree-error\);/u
  )
  assert.match(
    theme,
    /\.graph-node:focus-visible \.graph-node-box\s*\{[\s\S]*?stroke: var\(--color-primitree-text\);/u
  )
})

test('documentation UI uses solid accents, neutral actions, and neutral focus', async () => {
  const [theme, playground, chrome] = await Promise.all([
    read('../app/global.css'),
    read('../components/playground/playground.css'),
    read('../components/landing/site-chrome.tsx'),
  ])

  assert.match(theme, /outline: 2px solid var\(--color-primitree-text\);/u)
  assert.match(
    playground,
    /\.pg-title em\s*\{\s*font-style: normal;\s*color: var\(--color-primitree-accent\);\s*\}/u
  )
  assert.match(
    playground,
    /\.pg-button\.primary\s*\{\s*background: var\(--color-primitree-accent\);\s*color: #04251a;\s*\}/u
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
  assert.match(chrome, /bg-primitree-accent-wash text-primitree-accent/u)
  assert.match(
    chrome,
    /import\s*\{\s*FullSearchTrigger,\s*SearchTrigger,\s*\}\s*from 'fumadocs-ui\/layouts\/shared\/slots\/search-trigger'/u
  )
  assert.match(chrome, /GithubLogoIcon/u)
  assert.match(chrome, /aria-label='Primitree on GitHub'/u)
  assert.match(
    theme,
    /\.site-icon-control\s*\{[\s\S]*width: 44px;[\s\S]*height: 44px;/u
  )
})

test('documentation static mark stays white and favicon uses the light-surface accent', async () => {
  const [mark, favicon] = await Promise.all([
    read('../public/primitree-icon.svg'),
    read('../public/favicon.svg'),
  ])

  assert.match(mark, /fill="(?:white|#ffffff)"/iu)
  assert.match(favicon, /fill="#0b9464"/iu)
  assert.equal((mark.match(/\bfill="(?:white|#ffffff)"/giu) ?? []).length, 1)
  assert.equal((favicon.match(/\bfill="#0b9464"/giu) ?? []).length, 1)
})
