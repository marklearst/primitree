import {
  composeGraph,
  createSourceView,
  resolveToken,
  type TokenId,
} from '@primitree/core'
import { toGraphFragment } from '../src/index'

function requireValue<Value>(result: {
  readonly ok: boolean
  readonly value?: Value
}): Value {
  expect(result.ok).toBe(true)
  if (!result.ok || result.value === undefined) {
    throw new Error('Expected a successful result.')
  }
  return result.value
}

describe('DTCG graph adapter', () => {
  it('converts token paths, groups, values, references, and provenance', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          scale: {
            $type: 'number',
            base: { $value: 8 },
          },
          semantic: {
            $type: 'number',
            space: { $value: '{scale.base}' },
          },
        },
        { source: 'brand', uri: 'tokens.json' }
      )
    )

    expect(fragment.source).toMatchObject({
      id: 'source:brand',
      type: 'dtcg',
    })
    expect(fragment.groups.map(group => group.path)).toEqual([
      ['scale'],
      ['semantic'],
    ])
    expect(fragment.tokens.map(token => token.path)).toEqual([
      ['scale', 'base'],
      ['semantic', 'space'],
    ])
    expect(fragment.tokens[0]?.provenance).toEqual([
      { uri: 'tokens.json', pointer: '/scale/base' },
    ])
    expect(fragment.references).toHaveLength(1)

    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'brand' }))
    const space = fragment.tokens.find(token => token.name === 'space')!
    const resolved = requireValue(
      resolveToken(graph, view, space.id as TokenId)
    )

    expect(resolved.value).toBe(8)
    expect(resolved.referenceChain).toEqual([
      space.id,
      fragment.tokens.find(token => token.name === 'base')!.id,
    ])
  })

  it('lets Core report a reference to a missing token', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          semantic: {
            action: {
              $type: 'color',
              $value: '{color.missing}',
            },
          },
        },
        { source: 'brand' }
      )
    )

    const result = composeGraph([fragment])

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('graph.missing-reference')
  })
})
