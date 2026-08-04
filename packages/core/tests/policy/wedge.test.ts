import {
  composeGraph,
  createGraphFragment,
  createSourceId,
  createSourceView,
  qualifyId,
} from '../../src/index'
import {
  createPolicy,
  evaluatePolicy,
  parsePolicy,
  type PolicyInput,
} from '../../src/policy/index'

type TestResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly diagnostics: readonly unknown[] }

function requireValue<Value>(result: TestResult<Value>): Value {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('Expected a successful result.')
  }
  return result.value
}

function requireItem<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error('Expected the test fixture to contain an item.')
  }
  return value
}

function createSnapshot() {
  const sourceId = requireValue(createSourceId('brand'))
  const tokenId = (name: string) =>
    requireValue(qualifyId({ sourceId, kind: 'token', localId: name }))
  const blue = tokenId('blue')
  const action = tokenId('action')
  const card = tokenId('card')
  const loose = tokenId('loose')
  const fragment = requireValue(
    createGraphFragment({
      source: { id: sourceId, type: 'dtcg' },
      groups: [],
      tokens: [
        {
          id: blue,
          sourceId,
          name: 'Blue',
          path: ['color', 'blue'],
          type: 'color',
          values: [{ value: { kind: 'literal', value: '#36f' } }],
        },
        {
          id: action,
          sourceId,
          name: 'Action',
          path: ['semantic', 'action'],
          type: 'color',
          values: [{ value: { kind: 'reference', target: blue } }],
        },
        {
          id: card,
          sourceId,
          name: 'Card',
          path: ['component', 'card'],
          type: 'color',
          values: [{ value: { kind: 'literal', value: '#69f' } }],
        },
        {
          id: loose,
          sourceId,
          name: 'Loose',
          path: ['other', 'loose'],
          type: 'color',
          values: [{ value: { kind: 'reference', target: action } }],
        },
      ],
    })
  )
  const graph = requireValue(composeGraph([fragment]))
  const view = requireValue(createSourceView(graph, { id: 'app' }))
  return { graph, view, ids: { blue, action, card, loose } }
}

const policyInput = {
  id: 'brand',
  viewId: 'app',
  layers: [
    { id: 'base', roots: ['color'], values: 'literal', references: [] },
    {
      id: 'meaning',
      roots: ['semantic'],
      values: 'reference',
      references: ['base'],
    },
    {
      id: 'ui',
      roots: ['component'],
      values: 'reference',
      references: ['meaning'],
    },
  ],
  ownership: {
    paths: { semantic: ['product-design'] },
  },
} satisfies PolicyInput

describe('token policy checks', () => {
  it('checks layer assignment, values, reference direction, and owners', () => {
    const snapshot = createSnapshot()
    const policy = requireValue(createPolicy(policyInput))

    const report = requireValue(evaluatePolicy(snapshot, policy))

    expect(report.findings.map(finding => finding.ruleId)).toEqual([
      'PT1005',
      'PT1003',
      'PT1005',
      'PT1001',
      'PT1005',
    ])
    expect(report.findings[0]).toMatchObject({
      tokenId: snapshot.ids.blue,
      owners: [],
    })
    expect(report.findings[0]?.findingId).toBe(
      'PT1005:source%3Abrand%2Ftoken%3Ablue'
    )
    expect(report.findings[1]).toMatchObject({
      tokenId: snapshot.ids.card,
      layerId: 'ui',
    })
    expect(report.findings[3]).toMatchObject({
      tokenId: snapshot.ids.loose,
    })
    expect(report.summary).toEqual({ active: 5, baseline: 0 })
  })

  it('reports a reference to a layer that is not allowed', () => {
    const snapshot = createSnapshot()
    const policy = requireValue(
      createPolicy({
        ...policyInput,
        layers: policyInput.layers.map(layer =>
          layer.id === 'meaning' ? { ...layer, references: ['ui'] } : layer
        ),
      })
    )

    const report = requireValue(evaluatePolicy(snapshot, policy))

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: 'PT1004',
        tokenId: snapshot.ids.action,
        targetTokenId: snapshot.ids.blue,
      })
    )
  })

  it('uses the path selected by the view', () => {
    const snapshot = createSnapshot()
    const view = Object.freeze({
      ...snapshot.view,
      tokens: Object.freeze([
        Object.freeze({
          tokenId: snapshot.ids.blue,
          path: Object.freeze(['semantic', 'blue']),
        }),
      ]),
    })
    const policy = requireValue(createPolicy(policyInput))

    const report = requireValue(
      evaluatePolicy({ graph: snapshot.graph, view }, policy)
    )

    expect(report.findings).toEqual([
      expect.objectContaining({
        ruleId: 'PT1003',
        tokenId: snapshot.ids.blue,
        path: ['semantic', 'blue'],
        owners: ['product-design'],
        layerId: 'meaning',
      }),
    ])
  })

  it('uses the target path selected by the view for reference checks', () => {
    const snapshot = createSnapshot()
    const view = Object.freeze({
      ...snapshot.view,
      tokens: Object.freeze(
        snapshot.view.tokens
          .filter(
            member =>
              member.tokenId === snapshot.ids.blue ||
              member.tokenId === snapshot.ids.action
          )
          .map(member =>
            member.tokenId === snapshot.ids.blue
              ? Object.freeze({
                  tokenId: member.tokenId,
                  path: Object.freeze(['component', 'blue']),
                })
              : member
          )
      ),
    })
    const policy = requireValue(createPolicy(policyInput))

    const report = requireValue(
      evaluatePolicy({ graph: snapshot.graph, view }, policy)
    )

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: 'PT1004',
        tokenId: snapshot.ids.action,
        targetTokenId: snapshot.ids.blue,
        path: ['semantic', 'action'],
      })
    )
  })

  it('rejects an alias when its target is absent from the view', () => {
    const snapshot = createSnapshot()
    const view = Object.freeze({
      ...snapshot.view,
      tokens: Object.freeze(
        snapshot.view.tokens.filter(
          member => member.tokenId === snapshot.ids.action
        )
      ),
    })
    const policy = requireValue(createPolicy(policyInput))

    const result = evaluatePolicy({ graph: snapshot.graph, view }, policy)

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('policy.invalid-snapshot')

    const unassignedView = Object.freeze({
      ...snapshot.view,
      tokens: Object.freeze(
        snapshot.view.tokens.filter(
          member => member.tokenId === snapshot.ids.loose
        )
      ),
    })
    const unassignedResult = evaluatePolicy(
      { graph: snapshot.graph, view: unassignedView },
      policy
    )
    expect(unassignedResult.ok).toBe(false)
    expect(unassignedResult.diagnostics[0]?.code).toBe(
      'policy.invalid-snapshot'
    )
  })

  it('accepts one to four layers and rejects other counts or duplicate roots', () => {
    const layer = (id: string, root: string) => ({
      id,
      roots: [root],
      values: 'either' as const,
      references: [id],
    })

    for (let count = 1; count <= 4; count += 1) {
      expect(
        createPolicy({
          id: `policy-${count}`,
          viewId: 'app',
          layers: Array.from({ length: count }, (_, index) =>
            layer(`layer-${index}`, `root-${index}`)
          ),
        }).ok
      ).toBe(true)
    }
    expect(createPolicy({ id: 'empty', viewId: 'app', layers: [] }).ok).toBe(
      false
    )
    expect(
      createPolicy({
        id: 'large',
        viewId: 'app',
        layers: Array.from({ length: 5 }, (_, index) =>
          layer(`layer-${index}`, `root-${index}`)
        ),
      }).ok
    ).toBe(false)
    expect(
      createPolicy({
        id: 'duplicate',
        viewId: 'app',
        layers: [layer('one', 'shared'), layer('two', 'shared')],
      }).diagnostics[0]?.code
    ).toBe('policy.duplicate-root')
  })

  it('returns exact diagnostics for invalid policy details and options', () => {
    const layer = {
      id: 'base',
      roots: ['color'],
      values: 'literal' as const,
      references: [] as string[],
    }
    const cases = [
      [
        createPolicy({
          id: 'duplicate-layer',
          viewId: 'app',
          layers: [layer, { ...layer, roots: ['other'] }],
        }),
        'policy.duplicate-layer',
      ],
      [
        createPolicy({
          id: 'invalid-layer',
          viewId: 'app',
          layers: [{ ...layer, roots: [] }],
        }),
        'policy.invalid-layer',
      ],
      [
        createPolicy({
          id: 'unknown-layer',
          viewId: 'app',
          layers: [{ ...layer, references: ['missing'] }],
        }),
        'policy.unknown-layer',
      ],
      [
        createPolicy({
          id: 'invalid-owners',
          viewId: 'app',
          layers: [layer],
          ownership: { default: ['team', 'team'] },
        }),
        'policy.invalid-ownership',
      ],
      [
        createPolicy({
          id: 'unknown-owner-root',
          viewId: 'app',
          layers: [layer],
          ownership: { paths: { other: ['team'] } },
        }),
        'policy.unknown-owner-root',
      ],
      [parsePolicy('x'.repeat(1_000_001)), 'policy.input-limit'],
    ] as const

    for (const [result, code] of cases) {
      expect(result.diagnostics[0]?.code).toBe(code)
    }

    const snapshot = createSnapshot()
    const policy = requireValue(createPolicy(policyInput))
    expect(
      evaluatePolicy(snapshot, policy, [] as never).diagnostics[0]?.code
    ).toBe('policy.invalid-options')
    expect(
      evaluatePolicy(snapshot, policy, { baseline: ['bad'] } as never)
        .diagnostics[0]?.code
    ).toBe('policy.invalid-baseline')
  })

  it('parses JSON and marks exact baseline findings', () => {
    const snapshot = createSnapshot()
    const policy = requireValue(parsePolicy(JSON.stringify(policyInput)))
    const first = requireValue(evaluatePolicy(snapshot, policy))

    const report = requireValue(
      evaluatePolicy(snapshot, policy, {
        baseline: [first.findings[0]!.findingId],
      })
    )

    expect(report.findings[0]?.disposition).toBe('baseline')
    expect(report.summary).toEqual({ active: 4, baseline: 1 })
  })

  it('returns diagnostics for unreadable input and the wrong view', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('blocked')
        },
      }
    )
    expect(() => createPolicy(hostile)).not.toThrow()
    expect(createPolicy(hostile).ok).toBe(false)
    expect(parsePolicy(hostile).ok).toBe(false)
    expect(parsePolicy('{').ok).toBe(false)
    expect(() =>
      Reflect.apply(evaluatePolicy, undefined, [hostile, hostile])
    ).not.toThrow()
    expect(
      Reflect.apply(evaluatePolicy, undefined, [hostile, hostile]).ok
    ).toBe(false)

    const snapshot = createSnapshot()
    const policy = requireValue(
      createPolicy({ ...policyInput, viewId: 'another-view' })
    )
    expect(evaluatePolicy(snapshot, policy).diagnostics[0]?.code).toBe(
      'policy.view-mismatch'
    )
  })

  it('accepts long token IDs and their exact finding IDs in a baseline', () => {
    const snapshot = createSnapshot()
    const sourceId = requireValue(createSourceId('long'))
    const longBase = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: '😀'.repeat(128),
      })
    )
    const longAction = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: `a${'😀'.repeat(127)}`,
      })
    )
    const blue = snapshot.graph.tokens.find(
      token => token.id === snapshot.ids.blue
    )!
    const action = snapshot.graph.tokens.find(
      token => token.id === snapshot.ids.action
    )!
    const graph = Object.freeze({
      ...snapshot.graph,
      tokens: Object.freeze([
        Object.freeze({ ...blue, id: longBase }),
        Object.freeze({
          ...action,
          id: longAction,
          values: Object.freeze([
            Object.freeze({
              ...action.values[0]!,
              value: Object.freeze({
                kind: 'reference' as const,
                target: longBase,
              }),
            }),
          ]),
        }),
      ]),
      references: Object.freeze([]),
    })
    const view = Object.freeze({
      ...snapshot.view,
      tokens: Object.freeze([
        Object.freeze({ tokenId: longBase, path: blue.path }),
        Object.freeze({ tokenId: longAction, path: action.path }),
      ]),
    })
    const policy = requireValue(
      createPolicy({
        id: 'long-ids',
        viewId: 'app',
        layers: [
          {
            id: 'base',
            roots: ['color'],
            values: 'literal',
            references: [],
          },
          {
            id: 'meaning',
            roots: ['semantic'],
            values: 'reference',
            references: [],
          },
        ],
        ownership: { default: ['team'] },
      })
    )

    const first = requireValue(evaluatePolicy({ graph, view }, policy))
    const direction = first.findings.find(
      finding => finding.ruleId === 'PT1004'
    )!

    expect(direction.findingId.length).toBeGreaterThan(2_048)
    const second = requireValue(
      evaluatePolicy({ graph, view }, policy, {
        baseline: [direction.findingId],
      })
    )
    expect(second.findings[0]?.disposition).toBe('baseline')
  })

  it('checks the largest IDs returned by the graph API', () => {
    const sourceId = requireValue(createSourceId('\u0800'.repeat(256)))
    const tokenId = requireValue(
      qualifyId({
        sourceId,
        kind: 'token',
        localId: '\u0801'.repeat(256),
      })
    )
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens: [
          {
            id: tokenId,
            sourceId,
            name: 'Token',
            path: ['color', 'token'],
            type: 'color',
            values: [{ value: { kind: 'literal', value: '#36f' } }],
          },
        ],
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'app' }))
    const policy = requireValue(
      createPolicy({
        id: 'largest-ids',
        viewId: 'app',
        layers: [
          {
            id: 'base',
            roots: ['color'],
            values: 'literal',
            references: [],
          },
        ],
        ownership: { default: ['team'] },
      })
    )

    expect(evaluatePolicy({ graph, view }, policy).ok).toBe(true)
  })

  it('reports a known layer that references an unassigned token', () => {
    const snapshot = createSnapshot()
    const card = snapshot.graph.tokens.find(
      token => token.id === snapshot.ids.card
    )!
    const graph = Object.freeze({
      ...snapshot.graph,
      tokens: Object.freeze(
        snapshot.graph.tokens.map(token =>
          token.id === card.id
            ? Object.freeze({
                ...token,
                values: Object.freeze([
                  Object.freeze({
                    ...token.values[0]!,
                    value: Object.freeze({
                      kind: 'reference' as const,
                      target: snapshot.ids.loose,
                    }),
                  }),
                ]),
              })
            : token
        )
      ),
    })
    const policy = requireValue(createPolicy(policyInput))

    const report = requireValue(
      evaluatePolicy({ graph, view: snapshot.view }, policy)
    )

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: 'PT1004',
        tokenId: snapshot.ids.card,
        targetTokenId: snapshot.ids.loose,
      })
    )
  })

  it('accepts a baseline with more than 256 findings', () => {
    const sourceId = requireValue(createSourceId('many'))
    const tokens = Array.from({ length: 300 }, (_, index) => {
      const id = requireValue(
        qualifyId({ sourceId, kind: 'token', localId: `${index}` })
      )
      return {
        id,
        sourceId,
        name: `Token ${index}`,
        path: ['other', `${index}`],
        type: 'color' as const,
        values: [{ value: { kind: 'literal' as const, value: '#36f' } }],
      }
    })
    const fragment = requireValue(
      createGraphFragment({
        source: { id: sourceId, type: 'dtcg' },
        groups: [],
        tokens,
      })
    )
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'many' }))
    const policy = requireValue(
      createPolicy({
        id: 'many',
        viewId: 'many',
        layers: [
          {
            id: 'base',
            roots: ['color'],
            values: 'either',
            references: ['base'],
          },
        ],
        ownership: { default: ['team'] },
      })
    )
    const first = requireValue(evaluatePolicy({ graph, view }, policy))

    const report = requireValue(
      evaluatePolicy({ graph, view }, policy, {
        baseline: first.findings.map(finding => finding.findingId),
      })
    )

    expect(report.summary).toEqual({ active: 0, baseline: 300 })
  })

  it('rejects a policy snapshot that exceeds the work limit', () => {
    const snapshot = createSnapshot()
    const blue = requireItem(
      snapshot.graph.tokens.find(token => token.id === snapshot.ids.blue)
    )
    const graph = Object.freeze({
      ...snapshot.graph,
      tokens: Object.freeze(
        snapshot.graph.tokens.map(token =>
          token.id === blue.id
            ? Object.freeze({
                ...token,
                values: Object.freeze([
                  Object.freeze({
                    ...requireItem(token.values[0]),
                    value: Object.freeze({
                      kind: 'literal' as const,
                      value: 'x'.repeat(1_000_001),
                    }),
                  }),
                ]),
              })
            : token
        )
      ),
    })
    const policy = requireValue(createPolicy(policyInput))

    const result = evaluatePolicy({ graph, view: snapshot.view }, policy)

    expect(result.diagnostics[0]?.code).toBe('policy.work-limit')
  })

  it('stops before checking references when token values exceed the work limit', () => {
    const snapshot = createSnapshot()
    const action = requireItem(
      snapshot.graph.tokens.find(token => token.id === snapshot.ids.action)
    )
    const actionValue = requireItem(action.values[0])
    const missing = requireValue(
      qualifyId({
        sourceId: requireValue(createSourceId('brand')),
        kind: 'token',
        localId: 'missing',
      })
    )
    const missingReference = Object.freeze({
      ...actionValue,
      value: Object.freeze({
        kind: 'reference' as const,
        target: missing,
      }),
    })
    let authoredReads = 0
    const values = new Proxy([actionValue], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return function* () {
            for (let index = 0; index <= 1_000_000; index += 1) {
              authoredReads += 1
              yield index === 1_000_000 ? missingReference : actionValue
            }
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const graph = Object.freeze({
      ...snapshot.graph,
      tokens: Object.freeze(
        snapshot.graph.tokens.map(token =>
          token.id === action.id ? Object.freeze({ ...token, values }) : token
        )
      ),
    })
    const policy = requireValue(createPolicy(policyInput))

    const result = evaluatePolicy({ graph, view: snapshot.view }, policy)

    expect(result.diagnostics[0]?.code).toBe('policy.work-limit')
    expect(authoredReads).toBeLessThan(1_000_001)
  })

  it('limits array reads when a policy input changes its reported length', () => {
    let lengthReads = 0
    let layerReads = 0
    const layers = new Proxy([policyInput.layers[0]], {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads += 1
          return lengthReads === 1 ? 1 : 10_000
        }
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          layerReads += 1
          return target[0]
        }
        return Reflect.get(target, property, receiver)
      },
    })

    const result = createPolicy({ ...policyInput, layers })

    expect(result.diagnostics[0]?.code).toBe('policy.invalid-config')
    expect(layerReads).toBe(1)
  })

  it('limits owner paths and total policy input work', () => {
    const paths = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`root-${index}`, ['team']])
    )
    expect(
      createPolicy({
        id: 'owner-paths',
        viewId: 'app',
        layers: [
          {
            id: 'base',
            roots: ['root-0'],
            values: 'either',
            references: ['base'],
          },
        ],
        ownership: { paths },
      }).diagnostics[0]?.code
    ).toBe('policy.invalid-ownership')
    expect(
      createPolicy({
        id: 'x'.repeat(1_000_001),
        viewId: 'app',
        layers: [
          {
            id: 'base',
            roots: ['color'],
            values: 'either',
            references: ['base'],
          },
        ],
      }).diagnostics[0]?.code
    ).toBe('policy.work-limit')
  })
})
