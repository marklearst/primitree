import {
  composeGraph,
  createSourceView,
  resolveToken,
  type GraphFragment,
} from '@primitree/core'
import { describe, expect, it } from 'vitest'
import { createDTCGGraphFragment } from '../src/index'

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

function requireFailure(result: {
  readonly ok: boolean
  readonly diagnostics?: readonly {
    readonly code: string
    readonly message: string
    readonly path?: readonly string[]
  }[]
}) {
  expect(result.ok).toBe(false)
  if (result.ok || result.diagnostics?.[0] === undefined) {
    throw new Error('Expected a failed result.')
  }
  return result.diagnostics[0]
}

function requireToken(fragment: GraphFragment, path: string) {
  const token = fragment.tokens.find(item => item.path.join('.') === path)
  expect(token).toBeDefined()
  if (token === undefined) {
    throw new Error(`Expected token "${path}".`)
  }
  return token
}

describe('DTCG graph reference chains', () => {
  it.each([
    ['number', 8],
    ['dimension', { value: 1, unit: 'rem' }],
    [
      'color',
      {
        colorSpace: 'display-p3',
        components: [0.2, 0.4, 0.8],
        alpha: 0.75,
      },
    ],
  ] as const)('resolves a three-token %s chain', (type, value) => {
    const fragment = requireValue(
      createDTCGGraphFragment(
        {
          scale: {
            alias: { $value: '{scale.middle}' },
            middle: { $value: '{scale.base}' },
            base: { $type: type, $value: value },
          },
        },
        { source: 'brand' }
      )
    )
    const alias = requireToken(fragment, 'scale.alias')
    const middle = requireToken(fragment, 'scale.middle')
    const base = requireToken(fragment, 'scale.base')

    expect(fragment.references).toEqual([
      { from: alias.id, to: middle.id, conditions: {} },
      { from: middle.id, to: base.id, conditions: {} },
    ])

    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'brand' }))
    const resolved = requireValue(resolveToken(graph, view, alias.id))

    expect(resolved.value).toEqual(value)
    expect(resolved.referenceChain).toEqual([alias.id, middle.id, base.id])
  })

  it('rejects an explicit type that conflicts with its direct target', () => {
    const alias = { $type: 'number', $value: '{palette.blue}' }
    const palette = {
      blue: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.2, 0.4, 0.8],
        },
      },
    }
    const expected = {
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG alias type does not match its reference target.',
      path: ['alias', '$value'],
    }

    for (const document of [
      { alias, palette },
      { palette, alias },
    ]) {
      expect(
        requireFailure(createDTCGGraphFragment(document, { source: 'brand' }))
      ).toEqual(expected)
    }
  })

  it('rejects a type conflict at the middle alias', () => {
    const result = createDTCGGraphFragment(
      {
        scale: {
          alias: { $value: '{scale.middle}' },
          middle: { $type: 'number', $value: '{scale.base}' },
          base: {
            $type: 'dimension',
            $value: { value: 8, unit: 'px' },
          },
        },
      },
      { source: 'brand' }
    )

    expect(requireFailure(result)).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG alias type does not match its reference target.',
      path: ['scale', 'middle', '$value'],
    })
  })

  it('keeps typed cycles for Core to report', () => {
    const fragment = requireValue(
      createDTCGGraphFragment(
        {
          first: { $type: 'number', $value: '{second}' },
          second: { $type: 'number', $value: '{first}' },
        },
        { source: 'brand' }
      )
    )
    const first = requireToken(fragment, 'first')

    expect(fragment.references).toHaveLength(2)

    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'brand' }))
    const diagnostic = requireFailure(resolveToken(graph, view, first.id))

    expect(diagnostic.code).toBe('graph.reference-cycle')
  })

  it('builds the same graph when token keys are shuffled', () => {
    const aliasFirst = requireValue(
      createDTCGGraphFragment(
        {
          scale: {
            alias: { $value: '{scale.middle}' },
            middle: { $value: '{scale.base}' },
            base: { $type: 'number', $value: 8 },
          },
          spare: {
            value: { $type: 'number', $value: 1 },
          },
        },
        { source: 'brand' }
      )
    )
    const baseFirst = requireValue(
      createDTCGGraphFragment(
        {
          spare: {
            value: { $value: 1, $type: 'number' },
          },
          scale: {
            base: { $value: 8, $type: 'number' },
            middle: { $value: '{scale.base}' },
            alias: { $value: '{scale.middle}' },
          },
        },
        { source: 'brand' }
      )
    )

    expect(baseFirst).toEqual(aliasFirst)
  })
})
