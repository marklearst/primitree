import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { NARROW_RIBBON, ribbonEdges } from '../lib/tokens/graph-edges.ts'
import { RIBBON } from '../lib/tokens/graph-layout.ts'
import graph from '../tokens/generated/graph.json' with { type: 'json' }

/* The hero and the phone both call ribbonEdges, so this holds the one function
   to the references graph.json declares. */

const tokens = graph.tokens.map(token => ({
  p: token.path,
  l: token.target.light,
  d: token.target.dark,
  c: token.type === 'color',
}))
const bandY: Readonly<Record<string, number>> = {
  component: 0,
  semantic: 120,
  primitives: 240,
}
const positionOf = (path: string) => {
  const index = tokens.findIndex(token => token.p === path)
  return index === -1
    ? undefined
    : { x: index * 6, y: bandY[path.split('.')[0]] }
}
const references = graph.tokens
  .flatMap(token =>
    [...new Set([token.target.light, token.target.dark])]
      .filter(target => target !== null)
      .map(target => `${token.path}>${target}`)
  )
  .sort()

describe('the graph edges', () => {
  for (const [name, style] of [
    ['hero', RIBBON],
    ['phone', NARROW_RIBBON],
  ] as const) {
    test(`the ${name} draws each reference once, long runs first, at a rest inside the fade`, () => {
      const edges = ribbonEdges(tokens, positionOf, style)
      assert.deepEqual(
        edges.map(edge => `${edge.from}>${edge.to}`).sort(),
        references
      )
      const runs = edges.map(edge => edge.run)
      assert.deepEqual(
        runs,
        [...runs].sort((a, b) => b - a)
      )
      for (const edge of edges) {
        const rest = Number(edge.rest)
        assert.ok(
          rest >= style.opacity * style.opacityFloor - 0.0005 &&
            rest <= style.opacity + 0.0005,
          `${edge.from}>${edge.to} rests at ${edge.rest}`
        )
        assert.match(edge.d, /^M-?[\d.]+ -?[\d.]+C[^Z]+Z$/u)
      }
    })
  }
})
