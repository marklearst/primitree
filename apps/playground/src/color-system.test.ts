import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

const formerBrandColors = [
  '#7b8cff',
  '#7b8cff40',
  '#5e70ff',
  '#b18cff',
  '#3ddc97',
  '#ffb454',
  '#ff6b81',
  'rgba(123, 140, 255',
  'rgba(61, 220, 151',
  'rgba(255, 180, 84',
  'rgba(255, 107, 129',
] as const

async function read(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8')
}

test('playground theme exposes the approved Lichen palette', async () => {
  const theme = await read('./styles.css')

  expect(theme).toMatch(/--bg: #0b0f0d;/u)
  expect(theme).toMatch(/--bg-surface: #101512;/u)
  expect(theme).toMatch(/--bg-raised: #161c18;/u)
  expect(theme).toMatch(/--bg-hover: #1c241f;/u)
  expect(theme).toMatch(/--text: #f0f5f2;/u)
  expect(theme).toMatch(/--accent: #34d399;/u)
  expect(theme).toMatch(/--accent-strong: #0b9464;/u)
  expect(theme).toMatch(/--accent-soft: #6ee7b7;/u)
  expect(theme).toMatch(/--accent-wash: rgb\(52 211 153 \/ 10%\);/u)
  expect(theme).toMatch(/--good: #34d399;/u)
  expect(theme).toMatch(/--warn: #fbbf24;/u)
  expect(theme).toMatch(/--error: #f87171;/u)
  expect(theme).toMatch(
    /::selection\s*\{\s*background: rgb\(52 211 153 \/ 25%\);/u
  )
})

test('playground brand files contain no former Primitree purple treatment', async () => {
  const sources = await Promise.all([
    read('./styles.css'),
    read('./assets/primitree-icon.svg'),
    read('../public/favicon.svg'),
  ])
  const combined = sources.join('\n').toLowerCase()

  for (const color of formerBrandColors) {
    expect(combined, `found former color ${color}`).not.toContain(color)
  }
})

test('playground uses solid accents, neutral actions, and neutral focus', async () => {
  const theme = await read('./styles.css')

  expect(theme).toMatch(
    /\.page-title em\s*\{\s*font-style: normal;\s*color: var\(--accent\);\s*\}/u
  )
  expect(theme).toMatch(
    /\.button\.primary\s*\{\s*background: var\(--accent\);\s*color: #04251a;\s*\}/u
  )
  expect(theme).toMatch(/outline: 2px solid var\(--text\);/u)
  expect(theme).toMatch(/\.tab\.active\s*\{[\s\S]*color: var\(--accent\);/u)
  expect(theme).toMatch(
    /\.file\.active\s*\{[\s\S]*background: var\(--accent-wash\);[\s\S]*color: var\(--accent\);/u
  )
})

test('playground static mark stays white and favicon uses the light-surface Lichen accent', async () => {
  const [mark, favicon] = await Promise.all([
    read('./assets/primitree-icon.svg'),
    read('../public/favicon.svg'),
  ])

  expect(mark).toMatch(/fill="(?:white|#ffffff)"/iu)
  expect(favicon).toMatch(/fill="#0b9464"/iu)
  expect(mark.match(/\bfill="(?:white|#ffffff)"/giu)).toHaveLength(1)
  expect(favicon.match(/\bfill="#0b9464"/giu)).toHaveLength(1)
})
