import {
  composeGraph,
  createGraphFragment,
  createSourceId,
  createSourceView,
  diffGraphViews,
  getDependencies,
  getDependents,
  getReferences,
  inspectToken,
  qualifyId,
  resolveToken,
  resolveView,
  type Result,
} from '../../src/index'

function requireValue<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Expected a successful graph result.')
  return result.value
}

describe('source-neutral graph', () => {
  it('copies and freezes one adapter fragment', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const groupId = requireValue(
      qualifyId({
        sourceId,
        kind: 'group',
        localId: 'primitive',
      })
    )
    const tokenId = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: 'color.blue',
      })
    )
    const input = {
      source: { id: sourceId, type: 'dtcg', name: 'Brand tokens' },
      groups: [
        {
          id: groupId,
          sourceId,
          name: 'Primitive',
          path: ['primitive'],
        },
      ],
      tokens: [
        {
          id: tokenId,
          sourceId,
          groupId,
          name: 'Blue',
          path: ['primitive', 'color', 'blue'],
          type: 'color',
          values: [{ value: { kind: 'literal', value: '#3366ff' } }],
        },
      ],
    }

    const fragment = requireValue(createGraphFragment(input))

    input.tokens[0]!.path[0] = 'changed'
    expect(fragment.source.id).toBe(sourceId)
    expect(fragment.groups).toHaveLength(1)
    expect(fragment.tokens).toHaveLength(1)
    expect(fragment.references).toEqual([])
    expect(Object.isFrozen(fragment)).toBe(true)
    expect(Object.isFrozen(fragment.tokens[0])).toBe(true)
  })

  it('composes fragments and rejects missing reference targets', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const tokenId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'alias' })
    )
    const missingId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'missing' })
    )
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: tokenId,
            sourceId,
            name: 'Alias',
            path: ['alias'],
            type: 'color',
            values: [{ value: { kind: 'reference', target: missingId } }],
          },
        ],
      })
    )

    const result = composeGraph([fragment])

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('graph.missing-reference')
  })

  it('resolves and inspects an alias through an exact-path view', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const blueId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'blue' })
    )
    const actionId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'action' })
    )
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: blueId,
            sourceId,
            name: 'Blue',
            path: ['color', 'blue'],
            type: 'color',
            values: [
              { value: { kind: 'literal', value: '#36f' } },
              {
                value: { kind: 'literal', value: '#69f' },
                conditions: { theme: 'dark' },
              },
            ],
          },
          {
            id: actionId,
            sourceId,
            name: 'Action',
            path: ['color', 'action'],
            type: 'color',
            values: [{ value: { kind: 'reference', target: blueId } }],
          },
        ],
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'app' }))

    expect(
      requireValue(getDependencies(graph, actionId, { transitive: true }))
    ).toEqual([blueId])
    expect(requireValue(getDependents(graph, blueId))).toEqual([actionId])

    const resolved = requireValue(
      resolveToken(graph, view, actionId, { theme: 'dark' })
    )
    expect(resolved.value).toBe('#69f')
    expect(resolved.referenceChain).toEqual([actionId, blueId])

    const inspected = requireValue(
      inspectToken(
        { graph, view },
        { kind: 'path', path: ['color', 'action'] },
        { theme: 'dark' }
      )
    )
    expect(inspected.tokenId).toBe(actionId)
    expect(inspected.dependencies).toEqual([blueId])
    expect(inspected.dependents).toEqual([])
    expect(inspected.resolution.value).toBe('#69f')
  })

  it('walks a long alias chain and caps full-view work', () => {
    const sourceId = requireValue(createSourceId('s'))
    const localIds = Array.from({ length: 3_000 }, (_, index) =>
      index.toString(36)
    )
    const ids = localIds.map(localId =>
      requireValue(qualifyId({ sourceId, kind: 'token', localId }))
    )
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: ids.map((id, index) => ({
          id,
          sourceId,
          name: 'T',
          path: [localIds[index]],
          type: 'color',
          values: [
            {
              value:
                index === ids.length - 1
                  ? { kind: 'literal', value: '#36f' }
                  : { kind: 'reference', target: ids[index + 1] },
            },
          ],
        })),
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'app' }))

    expect(requireValue(resolveToken(graph, view, ids[0]!)).value).toBe('#36f')
    expect(resolveView(graph, view).diagnostics[0]?.code).toBe(
      'graph.work-limit'
    )

    const keptIds = new Set(ids.slice(-1_500))
    const keptTokens = graph.tokens.filter(token => keptIds.has(token.id))
    const beforeGraph = Object.freeze({
      ...graph,
      tokens: keptTokens,
      references: graph.references.filter(
        edge => keptIds.has(edge.from) && keptIds.has(edge.to)
      ),
    })
    const diffView = Object.freeze({
      ...view,
      tokens: view.tokens.filter(token => keptIds.has(token.tokenId)),
    })
    const afterGraph = Object.freeze({
      ...beforeGraph,
      tokens: beforeGraph.tokens.map(token =>
        Object.freeze({ ...token, name: 'Updated' })
      ),
    })
    expect(
      diffGraphViews(
        { graph: beforeGraph, view: diffView },
        { graph: afterGraph, view: diffView }
      ).diagnostics[0]?.code
    ).toBe('graph.work-limit')
  })

  it('charges condition matching across a full view', () => {
    const sourceId = requireValue(createSourceId('conditions'))
    const baseId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'base' })
    )
    const conditions = Object.fromEntries(
      Array.from({ length: 2_000 }, (_, index) => [`c${index}`, 'on'])
    )
    const aliasIds = Array.from({ length: 600 }, (_, index) =>
      requireValue(
        qualifyId({ sourceId, kind: 'token', localId: `alias-${index}` })
      )
    )
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: baseId,
            sourceId,
            name: 'Base',
            path: ['base'],
            type: 'color',
            values: [
              {
                value: { kind: 'literal', value: '#36f' },
                conditions,
              },
            ],
          },
          ...aliasIds.map((id, index) => ({
            id,
            sourceId,
            name: `Alias ${index}`,
            path: ['alias', `${index}`],
            type: 'color',
            values: [{ value: { kind: 'reference', target: baseId } }],
          })),
        ],
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'app' }))

    expect(resolveView(graph, view, conditions).diagnostics[0]?.code).toBe(
      'graph.work-limit'
    )
  })

  it('reports a changed token and the alias affected by it', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const baseId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'base' })
    )
    const aliasId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'alias' })
    )
    const snapshot = (value: unknown) => {
      const fragment = requireValue(
        createGraphFragment({
          source: { id: sourceId, type: 'dtcg' },
          groups: [],
          tokens: [
            {
              id: baseId,
              sourceId,
              name: 'Base',
              path: ['base'],
              type: 'color',
              values: [{ value: { kind: 'literal', value } }],
            },
            {
              id: aliasId,
              sourceId,
              name: 'Alias',
              path: ['alias'],
              type: 'color',
              values: [{ value: { kind: 'reference', target: baseId } }],
            },
          ],
        })
      )
      const graph = requireValue(composeGraph([fragment]))
      const view = requireValue(createSourceView(graph, { id: 'app' }))
      return { graph, view }
    }

    const diff = requireValue(
      diffGraphViews(snapshot('#36f'), snapshot('#69f'))
    )

    expect(diff.changes).toEqual([
      { kind: 'changed', tokenId: baseId, impactedTokenIds: [aliasId] },
    ])
    expect(
      requireValue(
        diffGraphViews(
          snapshot({ red: 51, blue: 255 }),
          snapshot({ blue: 255, red: 51 })
        )
      ).changes
    ).toEqual([])
  })

  it('returns a diagnostic when a fragment cannot be read', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('blocked')
        },
      }
    )

    expect(() => createGraphFragment(hostile)).not.toThrow()
    expect(createGraphFragment(hostile).ok).toBe(false)
  })

  it('returns diagnostics when public operations cannot read their inputs', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('blocked')
        },
        get() {
          throw new Error('blocked')
        },
      }
    )
    const calls = [
      () => Reflect.apply(createSourceId, undefined, [hostile]),
      () => Reflect.apply(qualifyId, undefined, [hostile]),
      () => Reflect.apply(createGraphFragment, undefined, [hostile]),
      () => Reflect.apply(composeGraph, undefined, [[hostile]]),
      () => Reflect.apply(createSourceView, undefined, [hostile, hostile]),
      () => Reflect.apply(getReferences, undefined, [hostile, hostile]),
      () => Reflect.apply(getDependencies, undefined, [hostile, hostile]),
      () => Reflect.apply(getDependents, undefined, [hostile, hostile]),
      () => Reflect.apply(resolveToken, undefined, [hostile, hostile, hostile]),
      () => Reflect.apply(resolveView, undefined, [hostile, hostile]),
      () => Reflect.apply(inspectToken, undefined, [hostile, hostile]),
      () => Reflect.apply(diffGraphViews, undefined, [hostile, hostile]),
    ]

    for (const call of calls) {
      expect(call).not.toThrow()
      expect(call()).toMatchObject({ ok: false })
    }
    expect(() => createSourceId('\ud800')).not.toThrow()
    expect(createSourceId('\ud800').ok).toBe(false)
  })

  it('passes the largest source name through the public ID functions', () => {
    const sourceId = requireValue(createSourceId('\u0800'.repeat(256)))
    const tokenId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'token' })
    )

    expect(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: tokenId,
            sourceId,
            name: 'Token',
            path: ['token'],
            type: 'color',
            values: [{ value: { kind: 'literal', value: '#36f' } }],
          },
        ],
      }).ok
    ).toBe(true)
  })

  it('passes the largest local IDs into a graph fragment', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const groupId = requireValue(
      qualifyId({
        sourceId,
        kind: 'group',
        localId: '\u0800'.repeat(256),
      })
    )
    const tokenId = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: '\u0801'.repeat(256),
      })
    )
    const targetId = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: '\u0802'.repeat(256),
      })
    )

    expect(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [
          {
            id: groupId,
            sourceId,
            name: 'Group',
            path: ['group'],
          },
        ],
        tokens: [
          {
            id: tokenId,
            sourceId,
            groupId,
            name: 'Alias',
            path: ['alias'],
            type: 'color',
            values: [{ value: { kind: 'reference', target: targetId } }],
          },
          {
            id: targetId,
            sourceId,
            groupId,
            name: 'Target',
            path: ['target'],
            type: 'color',
            values: [{ value: { kind: 'literal', value: '#36f' } }],
          },
        ],
      }).ok
    ).toBe(true)
  })

  it('stops fragment work before copying an oversized value', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const tokenId = requireValue(
      qualifyId({ sourceId, kind: 'token', localId: 'large' })
    )
    const input = (value: string) => ({
      source: { id: sourceId, type: 'dtcg' },
      groups: [],
      tokens: [
        {
          id: tokenId,
          sourceId,
          name: 'Large',
          path: ['large'],
          type: 'string',
          values: [{ value: { kind: 'literal', value } }],
        },
      ],
    })

    expect(createGraphFragment(input('x'.repeat(900_000))).ok).toBe(true)
    expect(
      createGraphFragment(input('x'.repeat(1_000_001))).diagnostics[0]?.code
    ).toBe('graph.work-limit')
  })

  it('rejects ambiguous values, cycles, and reference type mismatches', () => {
    const sourceId = requireValue(createSourceId('brand'))
    const id = (name: string) =>
      requireValue(qualifyId({ sourceId, kind: 'token', localId: name }))
    const colorId = id('color')
    const ambiguousId = id('ambiguous')
    const cycleId = id('cycle')
    const mismatchId = id('mismatch')
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: colorId,
            sourceId,
            name: 'Color',
            path: ['color'],
            type: 'color',
            values: [{ value: { kind: 'literal', value: '#36f' } }],
          },
          {
            id: ambiguousId,
            sourceId,
            name: 'Ambiguous',
            path: ['ambiguous'],
            type: 'color',
            values: [
              { value: { kind: 'literal', value: '#36f' } },
              { value: { kind: 'literal', value: '#69f' } },
            ],
          },
          {
            id: cycleId,
            sourceId,
            name: 'Cycle',
            path: ['cycle'],
            type: 'color',
            values: [{ value: { kind: 'reference', target: cycleId } }],
          },
          {
            id: mismatchId,
            sourceId,
            name: 'Mismatch',
            path: ['mismatch'],
            type: 'number',
            values: [{ value: { kind: 'reference', target: colorId } }],
          },
        ],
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'app' }))

    expect(resolveToken(graph, view, ambiguousId).diagnostics[0]?.code).toBe(
      'graph.ambiguous-value'
    )
    expect(resolveToken(graph, view, cycleId).diagnostics[0]?.code).toBe(
      'graph.reference-cycle'
    )
    expect(resolveToken(graph, view, mismatchId).diagnostics[0]?.code).toBe(
      'graph.reference-type-mismatch'
    )
  })
})
