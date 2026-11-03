import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkDocument,
  documentWithBreaks,
} from '../lib/tokens/page-check-core.ts'
import {
  ownersOf,
  siteOwnershipWithoutDefault,
} from '../lib/tokens/site-policy.ts'
import {
  countCrossings,
  type GraphLayer,
  LAYER_ORDER,
  orderBands,
  placeBands,
  TYPE_ORDER,
} from '../lib/tokens/graph-layout.ts'
import recording from '../lib/landing/site-cli.json' with { type: 'json' }
import graph from '../tokens/generated/graph.json' with { type: 'json' }

/* The homepage's switches run this check in the browser. These tests hold it to
   what the real CLI printed for the same edits. */

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

describe('the rules the homepage breaks', () => {
  const expected = {
    'break-literal': 'PT1003 semantic.accent.solid:',
    'break-skip': 'PT1004 component.link.text:',
    'break-stray': 'PT1001 brand.accent:',
    'break-owner': 'PT1005 ',
  }

  for (const [id, line] of Object.entries(expected)) {
    test(`${id} exits 1 and names ${line}`, () => {
      const run = recording[id as keyof typeof expected]
      assert.equal(run.exitCode, 1)
      assert.ok(
        run.stderr.split('\n').some(text => text.startsWith(line)),
        run.stderr
      )
    })
  }

  const lightDocument = JSON.parse(
    readFileSync(
      path.join(docsRoot, 'tokens/generated/resolved/light-full.tokens.json'),
      'utf8'
    )
  )
  const ids = {
    'break-literal': 'literal',
    'break-skip': 'skip',
    'break-stray': 'stray',
    'break-owner': 'owner',
  } as const

  for (const [id, breakId] of Object.entries(ids)) {
    test(`the check in the browser prints what the CLI printed for ${id}`, () => {
      const breaks = new Set([breakId])
      const lines = checkDocument(
        documentWithBreaks(lightDocument, breaks),
        breaks
      ).map(item => `${item.ruleId} ${item.path}: ${item.message}`)
      const printed = recording[id as keyof typeof ids].stderr
        .split('\n')
        .filter(text => /^PT\d{4} /u.test(text))
      assert.deepEqual(lines.sort(), [...printed].sort())
    })
  }

  test('a finding in the browser names the owners the CLI names', () => {
    const breaks = new Set(['skip'] as const)
    const [finding] = checkDocument(
      documentWithBreaks(lightDocument, breaks),
      breaks
    )
    const [printed] = JSON.parse(recording['break-skip-json'].stdout).findings
    assert.deepEqual(finding?.owners, printed.owners)
    assert.deepEqual(finding?.owners, ['design-systems'])
  })

  test('the graph names the owners inspect prints', () => {
    const line = recording.inspect.stdout
      .split('\n')
      .find(text => text.startsWith('Owners: '))
    assert.equal(
      line,
      `Owners: ${ownersOf('semantic.accent.solid').join(', ')}`
    )
    assert.deepEqual(
      ownersOf('component.link.text', siteOwnershipWithoutDefault),
      []
    )
  })

  test('the committed tokens pass the check in the browser', () => {
    assert.deepEqual(checkDocument(lightDocument, new Set()), [])
  })

  test('the committed tokens pass in both themes', () => {
    assert.equal(recording.check.exitCode, 0)
    assert.equal(recording['check-dark'].exitCode, 0)
    assert.match(
      recording.check.stdout,
      new RegExp(`with ${graph.tokens.length} tokens`, 'u')
    )
  })

  test('a removed default owner leaves only the semantic owner', () => {
    const lines = recording['break-owner'].stderr
      .split('\n')
      .filter(text => text.startsWith('PT1005 '))
    const unowned = graph.tokens.filter(token => token.layer !== 'semantic')
    assert.equal(lines.length, unowned.length)
  })
})

describe('the graph layout', () => {
  const nodes = graph.tokens.map(token => ({
    path: token.path,
    layer: token.layer as GraphLayer,
    type: token.type,
  }))
  const edgesFor = (theme: 'light' | 'dark' | 'both') =>
    graph.tokens.flatMap(token => {
      const targets =
        theme === 'both'
          ? new Set([token.target.light, token.target.dark])
          : new Set([token.target[theme]])
      return [...targets]
        .filter(target => target !== null)
        .map(target => ({ from: token.path, to: target }))
    })
  const bands = orderBands(nodes, edgesFor('both'))
  const rerouted = graph.tokens.filter(
    token => token.target.light !== token.target.dark
  ).length

  test('crosses no more than the tokens a theme reroutes', () => {
    const crossings = countCrossings(bands, edgesFor('both'))
    assert.ok(
      crossings <= rerouted,
      `${crossings} crossings, ${rerouted} rerouted`
    )
  })

  test('crosses almost nothing inside one theme', () => {
    assert.ok(countCrossings(bands, edgesFor('light')) <= 6)
    assert.ok(countCrossings(bands, edgesFor('dark')) <= 6)
  })

  test('keeps every token, and each band in its slabs', () => {
    assert.equal(bands.length, LAYER_ORDER.length)
    assert.equal(bands.flat().length, nodes.length)
    const typeOf = new Map(graph.tokens.map(token => [token.path, token.type]))
    for (const band of bands) {
      const ranks = band.map(path =>
        TYPE_ORDER.indexOf(typeOf.get(path) as (typeof TYPE_ORDER)[number])
      )
      assert.deepEqual(
        ranks,
        [...ranks].sort((a, b) => a - b)
      )
    }
  })

  test('keeps ribbons short enough to read', () => {
    const { positions } = placeBands(nodes, bands, {
      width: 1360,
      margin: 28,
      slabGap: 16,
      bandY: { component: 30, semantic: 166, primitives: 302 },
    })
    const runs = edgesFor('both').map(edge =>
      Math.abs(
        (positions.get(edge.from)?.x ?? 0) - (positions.get(edge.to)?.x ?? 0)
      )
    )
    const mean = runs.reduce((sum, run) => sum + run, 0) / runs.length
    assert.ok(mean <= 30, `mean run ${mean.toFixed(1)}px`)
  })
})
