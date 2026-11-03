import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  contrast,
  INK_ARC,
  type SolvedPrimitives,
  solvePrimitives,
  underInk,
} from '../lib/tokens/solver.ts'
import recording from '../lib/landing/site-cli.json' with { type: 'json' }

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const tokensRoot = path.join(docsRoot, 'tokens')
const readJson = (file: string) =>
  JSON.parse(readFileSync(path.join(tokensRoot, file), 'utf8'))

const flatten = (node: unknown, prefix = ''): [string, string | object][] =>
  Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
    if (key.startsWith('$')) {
      return []
    }
    const name = prefix === '' ? key : `${prefix}.${key}`
    const leaf = value as { $value?: string | object }
    return leaf.$value === undefined
      ? flatten(value, name)
      : [[name, leaf.$value] as [string, string | object]]
  })

const themes = {
  light: readJson('theme/light.tokens.json'),
  dark: readJson('theme/dark.tokens.json'),
}
const shared = readJson('semantic.tokens.json')

/** The primitive a semantic token points at in a theme, as family and step. */
function stepOf(theme: 'light' | 'dark', token: string): [string, string] {
  const entries = new Map([...flatten(shared), ...flatten(themes[theme])])
  const alias = entries.get(`semantic.${token}`)
  const match =
    typeof alias === 'string'
      ? /^\{primitives\.color\.(\w+)\.(\d+)\}$/u.exec(alias)
      : null
  if (match === null) {
    throw new Error(`semantic.${token} does not alias a color primitive`)
  }
  return [match[1] as string, match[2] as string]
}

/** The hex the solver wrote for a step. A missing step fails the test instead
 * of passing it with an empty string. */
function hexOf(
  solved: SolvedPrimitives,
  [family, step]: readonly [string, string]
): string {
  const color = (solved as Record<string, Record<string, { hex: string }>>)[
    family
  ]?.[step]
  if (color === undefined) {
    throw new Error(`The solver wrote no ${family}.${step}.`)
  }
  return color.hex
}

/** Text tokens, and the surfaces each may sit on. */
const textPairs: readonly (readonly [string, readonly string[]])[] = [
  ['text.primary', ['surface.page', 'surface.raised', 'surface.sunken']],
  ['text.secondary', ['surface.page', 'surface.raised', 'surface.sunken']],
  ['text.muted', ['surface.page', 'surface.raised']],
  ['accent.text', ['surface.page', 'surface.raised']],
  ['status.fail', ['surface.page', 'surface.raised', 'status.failSubtle']],
  ['status.warn', ['surface.page', 'surface.raised']],
  ['text.onIsland', ['surface.island']],
  ['accent.onIsland', ['surface.island']],
  ['syntax.base', ['surface.code']],
  ['syntax.comment', ['surface.code']],
  ['syntax.punctuation', ['surface.code']],
  ['syntax.key', ['surface.code']],
  ['syntax.string', ['surface.code']],
  ['syntax.number', ['surface.code']],
  ['syntax.keyword', ['surface.code']],
  ['syntax.reference', ['surface.code']],
  ['syntax.fail', ['surface.code']],
  ['text.onInverse', ['surface.inverse']],
]

describe('the solved palette', () => {
  test('every text and surface pair holds 4.5:1 at all 360 hues in both themes', () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 1) {
      const solved = solvePrimitives(hue)
      for (const theme of ['light', 'dark'] as const) {
        for (const [text, surfaces] of textPairs) {
          for (const surface of surfaces) {
            const ratio = contrast(
              hexOf(solved, stepOf(theme, text)),
              hexOf(solved, stepOf(theme, surface))
            )
            if (ratio < 4.5) {
              failures.push(
                `${hue} ${theme} ${text} on ${surface}: ${ratio.toFixed(2)}`
              )
            }
          }
        }
      }
    }
    assert.deepEqual(failures, [])
  })

  test('the solid and its label hold 4.5:1 on both routes, at every hue', () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 1) {
      const solved = solvePrimitives(hue)
      const pairs = [
        [
          'light paper',
          hexOf(solved, ['brand', '45']),
          hexOf(solved, ['neutral', '100']),
        ],
        [
          'dark ink',
          hexOf(solved, ['brand', '72']),
          hexOf(solved, ['neutral', '4']),
        ],
        [
          'arc ink',
          hexOf(solved, ['brand', '85']),
          hexOf(solved, ['neutral', '8']),
        ],
      ] as const
      for (const [name, solid, label] of pairs) {
        const ratio = contrast(solid, label)
        if (ratio < 4.5) {
          failures.push(`${hue} ${name}: ${ratio.toFixed(2)}`)
        }
      }
    }
    assert.deepEqual(failures, [])
  })

  test('a strong border holds 3:1 against the page at every hue', () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 1) {
      const solved = solvePrimitives(hue)
      for (const theme of ['light', 'dark'] as const) {
        const ratio = contrast(
          hexOf(solved, stepOf(theme, 'border.strong')),
          hexOf(solved, stepOf(theme, 'surface.page'))
        )
        if (ratio < 3) {
          failures.push(`${hue} ${theme}: ${ratio.toFixed(2)}`)
        }
      }
    }
    assert.deepEqual(failures, [])
  })

  test('a step number names the same luminance in every family', () => {
    const solved = solvePrimitives(265)
    const a = hexOf(solved, ['neutral', '45'])
    const b = hexOf(solved, ['brand', '45'])
    assert.ok(contrast(a, b) < 1.05, `${a} and ${b} differ in luminance`)
  })

  test('the ink arc is one span, and a drag widens it only at its edges', () => {
    const [start, end] = INK_ARC
    const inArc = Array.from({ length: 360 }, (_, hue) => underInk(hue))
    assert.equal(inArc.filter(Boolean).length, end - start + 1)
    assert.equal(underInk(start - 2), false)
    assert.equal(underInk(start - 2, true), true)
    assert.equal(underInk(start - 6, true), false)
  })
})

describe('the token files', () => {
  const walk = (directory: string): string[] =>
    readdirSync(path.join(tokensRoot, directory)).flatMap(name => {
      const relative = path.join(directory, name)
      if (relative.startsWith('generated')) {
        return []
      }
      return statSync(path.join(tokensRoot, relative)).isDirectory()
        ? walk(relative)
        : name.endsWith('.tokens.json')
          ? [relative]
          : []
    })
  const all = walk('').flatMap(file => flatten(readJson(file)))

  test('every primitive has a reader in some context', () => {
    const read = new Set(
      all
        .map(([, value]) => value)
        .filter(value => typeof value === 'string')
        .map(value => (value as string).slice(1, -1))
    )
    const orphans = all
      .map(([name]) => name)
      .filter(name => name.startsWith('primitives.') && !read.has(name))
    assert.deepEqual(orphans, [])
  })

  test('both theme files hold the same paths', () => {
    const paths = (theme: 'light' | 'dark') =>
      flatten(themes[theme])
        .map(([name]) => name)
        .sort()
    assert.deepEqual(paths('light'), paths('dark'))
  })

  test('the theme and motion modifiers touch separate tokens', () => {
    const motion = new Set(
      flatten(readJson('motion/full.tokens.json')).map(([name]) => name)
    )
    assert.deepEqual(
      flatten(themes.light)
        .map(([name]) => name)
        .filter(name => motion.has(name)),
      []
    )
  })

  test('no primitive changes between the themes', () => {
    const inTheme = [...flatten(themes.light), ...flatten(themes.dark)]
    assert.deepEqual(
      inTheme.filter(([name]) => name.startsWith('primitives.')),
      []
    )
  })
})

describe('the generated files', () => {
  test('match what the tokens build to', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/build-site-tokens.mjs', '--check'],
      { cwd: docsRoot, encoding: 'utf8' }
    )
    assert.equal(result.status, 0, result.stderr)
  })

  test('the homepage recording matches the real CLI', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/capture-site.mjs', '--check'],
      { cwd: docsRoot, encoding: 'utf8' }
    )
    assert.equal(result.status, 0, result.stderr)
  })

  test('the CSS names the attribute next-themes sets', () => {
    const css = readFileSync(
      path.join(tokensRoot, 'generated/tokens.css'),
      'utf8'
    )
    assert.match(css, /^\[data-theme='dark'\] \{/mu)
    assert.match(css, /^\[data-motion='reduced'\] \{/mu)
    assert.doesNotMatch(css, /data-semantic/u)
  })

  test('the dark block re-aliases as many tokens as diff reports', () => {
    const css = readFileSync(
      path.join(tokensRoot, 'generated/tokens.css'),
      'utf8'
    )
    const start = css.indexOf("[data-theme='dark'] {")
    const dark = css.slice(start, css.indexOf('}', start))
    const realiased = dark
      .split('\n')
      .filter(line => line.startsWith('  --semantic')).length
    const stdout = recording['diff-theme'].stdout
    const changed = stdout
      .split('\n')
      .filter(line => line.startsWith('changed ')).length
    assert.equal(realiased, changed)
    assert.match(
      stdout,
      new RegExp(`^Diff found ${changed} token changes\\.`, 'u')
    )
  })
})

describe('the site CSS', () => {
  const home = readFileSync(
    path.join(docsRoot, 'components/landing/home.css'),
    'utf8'
  )

  test('reads no primitive, because a theme could never reach it', () => {
    assert.doesNotMatch(home, /--primitives-/u)
    assert.doesNotMatch(
      readFileSync(path.join(docsRoot, 'app/global.css'), 'utf8'),
      /--primitives-/u
    )
  })

  test('holds no color literal', () => {
    const literals = home
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .match(/#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\((?!\s*from)/giu)
    assert.deepEqual(literals, null)
  })

  test('sets no duration, font, or radius by hand', () => {
    const body = home.replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.deepEqual(body.match(/\b\d+m?s\b/gu), null)
    for (const declaration of body.matchAll(
      /(?:^|\s)(font-size|font-weight|font-family|border-radius|line-height|letter-spacing):\s*([^;]+);/gmu
    )) {
      const [, property, value] = declaration
      const named = /var\(--|inherit/u.test(value ?? '')
      const circle = property === 'border-radius' && value === '50%'
      assert.ok(named || circle, `${property}: ${value}`)
    }
  })
})
