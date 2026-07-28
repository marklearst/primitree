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
    read('../components/landing/animated-mark.tsx'),
    read('../components/playground/playground.css'),
    read('../public/favicon.svg'),
    read('../public/primitree-icon.svg'),
  ])
  const combined = sources.join('\n').toLowerCase()

  for (const color of formerBrandColors) {
    assert.equal(combined.includes(color), false, `found former color ${color}`)
  }
})

test('documentation mark uses a white body with Lichen nodes and neutral rings', async () => {
  const [theme, mark] = await Promise.all([
    read('../app/global.css'),
    read('../components/landing/animated-mark.tsx'),
  ])

  assert.doesNotMatch(mark, /id='mark-fill'/u)
  assert.doesNotMatch(mark, /fill='url\(#mark-fill\)'/u)
  assert.match(mark, /className='mark-body'\s+d=\{MARK_PATH\}\s+fill='white'/u)
  assert.match(
    theme,
    /\.mark-glow\s*\{[\s\S]*rgb\(168 201 95 \/ 10%\)[\s\S]*\}/u
  )
  assert.match(
    theme,
    /\.mark-ring\s*\{[\s\S]*border: 1px solid rgb\(255 255 255 \/ 8%\);/u
  )
  assert.match(
    theme,
    /\.mark-ring-2\s*\{[\s\S]*border-color: rgb\(255 255 255 \/ 4%\);/u
  )
  assert.match(
    theme,
    /\.mark-node-dot\s*\{[\s\S]*fill: var\(--color-primitree-accent\);/u
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
