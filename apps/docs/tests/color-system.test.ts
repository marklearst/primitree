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
  '#34d399',
  '#fbbf24',
  '#ff6b81',
  'rgba(139, 156, 255',
  'rgba(123, 140, 255',
  'rgba(52, 211, 153',
  'rgba(251, 191, 36',
  'rgba(255, 107, 129',
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

test('documentation theme exposes the approved Lichen palette', async () => {
  const theme = await read('../app/global.css')

  assert.match(theme, /--color-primitree-accent: #a8c95f;/u)
  assert.match(theme, /--color-primitree-accent-strong: #5f7f2f;/u)
  assert.match(theme, /--color-primitree-accent-soft: #dde9b9;/u)
  assert.match(
    theme,
    /--color-primitree-accent-wash: rgb\(168 201 95 \/ 10%\);/u
  )
  assert.match(theme, /--color-primitree-good: #45c98b;/u)
  assert.match(theme, /--color-primitree-warn: #f2b84b;/u)
  assert.match(theme, /--color-primitree-error: #f27575;/u)
  assert.match(
    theme,
    /::selection\s*\{\s*background: rgb\(168 201 95 \/ 25%\);/u
  )
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

test('living canopy never fades text-bearing stages or graph nodes', async () => {
  const theme = await read('../app/global.css')
  const textBearingSelector =
    /\.canopy-(?:source|token|dependent|output)-node|\.canopy-stage-track\s*>\s*li/u

  const fadedTextRules = flatCssRules(theme).filter(
    ({ declarations, selectors }) =>
      textBearingSelector.test(selectors) && /\bopacity\s*:/u.test(declarations)
  )

  assert.deepEqual(
    fadedTextRules,
    [],
    'stage emphasis must change connectors and borders, never text opacity'
  )
})

test('living canopy provides a legible compact graph below tablet width', async () => {
  const [theme, canopy] = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/living-canopy.tsx'),
  ])

  assert.match(canopy, /className='canopy-mobile-graph'/u)
  assert.match(theme, /\.canopy-mobile-graph\s*\{[\s\S]*?display: none;/u)
  assert.match(
    theme,
    /@media \(max-width: 719px\)[\s\S]*?\.canopy-svg\s*\{\s*display: none;\s*\}/u
  )
  assert.match(
    theme,
    /@media \(max-width: 719px\)[\s\S]*?\.canopy-mobile-graph\s*\{[\s\S]*?display: grid;/u
  )
  assert.match(
    theme,
    /@media \(max-width: 719px\)[\s\S]*?\.canopy-stage-track strong\s*\{\s*font-size: 12px;\s*\}/u
  )

  const mobileNodeRule = flatCssRules(theme).find(({ selectors }) =>
    selectors.trim().startsWith('.canopy-mobile-node')
  )
  const fontSize = mobileNodeRule?.declarations.match(
    /font-size:\s*([0-9.]+)px/u
  )?.[1]
  assert.ok(fontSize, 'compact graph nodes must set a CSS-pixel font size')
  assert.ok(Number(fontSize) >= 12, 'compact graph text must be at least 12px')
})

test('documentation shell maps Fumadocs to the Lichen theme', async () => {
  const theme = await read('../app/global.css')

  assert.doesNotMatch(theme, /--fd-(?:background|foreground|primary|accent):/u)
  assert.match(theme, /--color-fd-background: var\(--color-primitree-bg\);/u)
  assert.match(theme, /--color-fd-foreground: var\(--color-primitree-text\);/u)
  assert.match(theme, /--color-fd-primary: var\(--color-primitree-accent\);/u)
  assert.match(theme, /--color-fd-primary-foreground: #09090b;/u)
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
    read('../components/landing/living-canopy.tsx'),
    read('../components/playground/playground.css'),
    read('../public/favicon.svg'),
    read('../public/primitree-icon.svg'),
  ])
  const combined = sources.join('\n').toLowerCase()

  for (const color of formerBrandColors) {
    assert.equal(combined.includes(color), false, `found former color ${color}`)
  }
})

test('living canopy makes the Bone mark a structural Lichen root', async () => {
  const [theme, canopy] = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/living-canopy.tsx'),
  ])

  assert.match(canopy, /className='canopy-logo'/u)
  assert.match(
    canopy,
    /className='canopy-logo-body'\s+d=\{MARK_PATH\}\s+fill='var\(--color-primitree-text\)'/u
  )
  assert.match(canopy, /className='canopy-root-node'/u)
  assert.doesNotMatch(canopy, /(?:linear|radial)Gradient|filter=|pointermove/u)
  assert.doesNotMatch(canopy, /\binfinite\b/u)
  assert.match(
    theme,
    /\.canopy-logo-body\s*\{\s*fill: var\(--color-primitree-text\);\s*\}/u
  )
  assert.match(
    theme,
    /\.canopy-source-swatch,\s*\.canopy-root-node\s*\{\s*fill: var\(--color-primitree-accent\);\s*\}/u
  )
  assert.match(
    theme,
    /\.canopy-trunk\s*\{[\s\S]*stroke: var\(--color-primitree-accent\);/u
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
    /\.pg-button\.primary\s*\{\s*background: #fafafa;\s*color: #09090b;\s*\}/u
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
    /import \{ SearchTrigger \} from 'fumadocs-ui\/layouts\/shared\/slots\/search-trigger'/u
  )
  assert.match(chrome, /function GithubMark\(\)/u)
  assert.match(chrome, /fill='currentColor'/u)
  assert.match(chrome, /aria-label='Primitree on GitHub'/u)
  assert.match(
    theme,
    /\.site-icon-control\s*\{[\s\S]*width: 44px !important;[\s\S]*height: 44px !important;/u
  )
})

test('documentation static mark stays white and favicon uses the light-surface Lichen accent', async () => {
  const [mark, favicon] = await Promise.all([
    read('../public/primitree-icon.svg'),
    read('../public/favicon.svg'),
  ])

  assert.match(mark, /fill="(?:white|#ffffff)"/iu)
  assert.match(favicon, /fill="#5f7f2f"/iu)
  assert.equal((mark.match(/\bfill="(?:white|#ffffff)"/giu) ?? []).length, 1)
  assert.equal((favicon.match(/\bfill="#5f7f2f"/giu) ?? []).length, 1)
})
