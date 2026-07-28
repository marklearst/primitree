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

  expect(theme).toMatch(/--bg: #030304;/u)
  expect(theme).toMatch(/--bg-surface: #08080a;/u)
  expect(theme).toMatch(/--bg-raised: #0f0f12;/u)
  expect(theme).toMatch(/--bg-hover: #16161a;/u)
  expect(theme).toMatch(/--text: #fafafa;/u)
  expect(theme).toMatch(/--accent: #a8c95f;/u)
  expect(theme).toMatch(/--accent-strong: #5f7f2f;/u)
  expect(theme).toMatch(/--accent-soft: #dde9b9;/u)
  expect(theme).toMatch(/--accent-wash: rgb\(168 201 95 \/ 10%\);/u)
  expect(theme).toMatch(/--good: #45c98b;/u)
  expect(theme).toMatch(/--warn: #f2b84b;/u)
  expect(theme).toMatch(/--error: #f27575;/u)
  expect(theme).toMatch(
    /::selection\s*\{\s*background: rgb\(168 201 95 \/ 25%\);/u
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
    /\.button\.primary\s*\{\s*background: #fafafa;\s*color: #09090b;\s*\}/u
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
  expect(favicon).toMatch(/fill="#5f7f2f"/iu)
  expect(mark.match(/\bfill="(?:white|#ffffff)"/giu)).toHaveLength(1)
  expect(favicon.match(/\bfill="#5f7f2f"/giu)).toHaveLength(1)
})
