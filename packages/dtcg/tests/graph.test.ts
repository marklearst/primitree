import {
  composeGraph,
  createSourceView,
  resolveToken,
  type GraphFragment,
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

function requireFailure(result: ReturnType<typeof toGraphFragment>) {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected a failed DTCG graph result.')
  }
  return result.diagnostics[0]
}

function requireToken(
  fragment: GraphFragment,
  predicate: (token: GraphFragment['tokens'][number]) => boolean
) {
  const token = fragment.tokens.find(predicate)
  expect(token).toBeDefined()
  if (token === undefined) {
    throw new Error('Expected a token in the DTCG graph fragment.')
  }
  return token
}

function nestedDocument(groupCount: number): Record<string, unknown> {
  const document: Record<string, unknown> = {}
  let group = document
  for (let index = 0; index < groupCount; index += 1) {
    const child: Record<string, unknown> = {}
    group.g = child
    group = child
  }
  group.token = { $type: 'number', $value: 1 }
  return document
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
    const space = requireToken(fragment, token => token.name === 'space')
    const base = requireToken(fragment, token => token.name === 'base')
    const resolved = requireValue(resolveToken(graph, view, space.id))

    expect(resolved.value).toBe(8)
    expect(resolved.referenceChain).toEqual([space.id, base.id])
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

  it('keeps $root as the final token path segment', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          $root: { $type: 'number', $value: 1 },
          color: {
            accent: {
              $type: 'number',
              $root: { $value: 2 },
              choice: { $value: '{color.accent.$root}' },
            },
          },
        },
        { source: 'brand', uri: 'tokens.json' }
      )
    )

    const topRoot = requireToken(fragment, token => token.path.length === 1)
    const nestedRoot = requireToken(
      fragment,
      token => token.path.join('.') === 'color.accent.$root'
    )
    const choice = requireToken(fragment, token => token.name === 'choice')

    expect(topRoot).toMatchObject({
      id: 'source:brand/token:%24root',
      name: '$root',
      path: ['$root'],
    })
    expect(topRoot.provenance).toEqual([
      { uri: 'tokens.json', pointer: '/$root' },
    ])
    expect(nestedRoot).toMatchObject({
      id: 'source:brand/token:color.accent.%24root',
      name: '$root',
      path: ['color', 'accent', '$root'],
    })
    expect(nestedRoot.provenance).toEqual([
      { uri: 'tokens.json', pointer: '/color/accent/$root' },
    ])

    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'brand' }))
    expect(requireValue(resolveToken(graph, view, choice.id)).value).toBe(2)
  })

  it.each([
    ['nested group', { $root: { child: { $value: 1 } } }],
    ['scalar', { $root: 1 }],
  ])('rejects a %s used as $root instead of a token', (_label, document) => {
    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic.code).toBe('dtcg.invalid-document')
    expect(diagnostic.message).toContain('$root')
  })

  it('returns the exact invalid-reference diagnostic', () => {
    const diagnostic = requireFailure(
      toGraphFragment(
        {
          alias: { $type: 'number', $value: '{ scale.base}' },
        },
        { source: 'brand' }
      )
    )

    expect(diagnostic).toMatchObject({
      code: 'dtcg.invalid-document',
      message: 'A DTCG reference path is invalid.',
    })
  })

  it.each([
    [
      '$extends',
      {
        base: { token: { $type: 'number', $value: 1 } },
        next: {
          $extends: '{base}',
          token: { $type: 'number', $value: 2 },
        },
      },
    ],
    [
      'JSON Pointer reference',
      {
        alias: {
          $type: 'number',
          $value: { $ref: '#/scale/base/$value' },
        },
      },
    ],
    [
      'token type outside the package value set',
      {
        transition: {
          $type: 'transition',
          $value: { duration: 200 },
        },
      },
    ],
  ])('rejects unsupported %s input', (_label, document) => {
    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic.code).toBe('dtcg.unsupported-feature')
  })

  it('rejects a nested brace reference with the exact diagnostic', () => {
    const diagnostic = requireFailure(
      toGraphFragment(
        {
          color: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [0, '{duration.fast}', 0],
              alpha: 1,
            },
          },
        },
        { source: 'brand' }
      )
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.unsupported-feature',
      message: 'A DTCG token value cannot contain a nested brace reference.',
    })
  })

  it.each([
    [
      'color',
      {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 1],
        alpha: 0.8,
        hex: '#3366ff',
      },
    ],
    ['dimension', { value: 8, unit: 'px' }],
    ['duration', { value: 200, unit: 'ms' }],
    ['number', 1.25],
    ['fontWeight', 600],
    ['fontFamily', 'Inter'],
    ['string', 'button'],
    ['boolean', true],
  ])('accepts emitted %s values', (type, value) => {
    const fragment = requireValue(
      toGraphFragment(
        { token: { $type: type, $value: value } },
        { source: 'brand' }
      )
    )

    expect(fragment.tokens[0]).toMatchObject({ type })
  })

  it.each([
    ['color', { colorSpace: 'srgb', components: [0, 1] }],
    ['dimension', { value: 8, unit: 'em' }],
    ['duration', { value: '200', unit: 'ms' }],
    ['number', '1'],
    ['fontWeight', 'bold'],
    ['fontFamily', ['Inter']],
    ['string', 1],
    ['boolean', 1],
  ])('rejects a value that does not match %s', (type, value) => {
    const diagnostic = requireFailure(
      toGraphFragment(
        { token: { $type: type, $value: value } },
        { source: 'brand' }
      )
    )

    expect(diagnostic.code).toBe('dtcg.invalid-document')
    expect(diagnostic.message).toContain(`type "${type}"`)
  })

  it('accepts a negative dimension value', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          space: {
            offset: {
              $type: 'dimension',
              $value: { value: -0.5, unit: 'rem' },
            },
          },
        },
        { source: 'brand' }
      )
    )

    expect(fragment.tokens[0]?.values[0]?.value).toEqual({
      kind: 'literal',
      value: { value: -0.5, unit: 'rem' },
    })
  })

  it('rejects dimension fields hidden from object-key enumeration', () => {
    const value = new Proxy(Object.create(null) as Record<string, unknown>, {
      ownKeys() {
        return []
      },
      getOwnPropertyDescriptor(_target, property) {
        return property === 'value' || property === 'unit'
          ? { configurable: true, enumerable: true }
          : undefined
      },
      get(_target, property) {
        return property === 'value' ? 8 : property === 'unit' ? 'px' : undefined
      },
    })

    const diagnostic = requireFailure(
      toGraphFragment(
        {
          space: {
            base: { $type: 'dimension', $value: value },
          },
        },
        { source: 'brand' }
      )
    )

    expect(diagnostic).toMatchObject({
      code: 'dtcg.invalid-document',
      path: ['space', 'base', '$value'],
    })
  })

  it.each([
    ['a non-object value', 8, ['space', 'base', '$value']],
    ['a missing value field', { unit: 'px' }, ['space', 'base', '$value']],
    ['a missing unit field', { value: 8 }, ['space', 'base', '$value']],
    [
      'an extra field',
      { value: 8, unit: 'px', note: 'base space' },
      ['space', 'base', '$value'],
    ],
    [
      'a non-finite value field',
      { value: Number.POSITIVE_INFINITY, unit: 'px' },
      ['space', 'base', '$value', 'value'],
    ],
    [
      'an unsupported unit field',
      { value: 8, unit: 'em' },
      ['space', 'base', '$value', 'unit'],
    ],
  ])(
    'rejects a dimension with %s and reports the closest invalid path',
    (_label, value, path) => {
      const diagnostic = requireFailure(
        toGraphFragment(
          {
            space: {
              base: { $type: 'dimension', $value: value },
            },
          },
          { source: 'brand' }
        )
      )

      expect(diagnostic).toMatchObject({
        code: 'dtcg.invalid-document',
        path,
      })
    }
  )

  it('reports the dimension $value path when validation exceeds the work limit', () => {
    const diagnostic = requireFailure(
      toGraphFragment(
        {
          space: {
            base: {
              $type: 'dimension',
              $value: new Array(100_001),
            },
          },
        },
        { source: 'brand' }
      )
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['space', 'base', '$value'],
    })
  })

  it('validates metadata that the Core graph result does not store', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          scale: {
            $type: 'number',
            $description: 'Spacing scale.',
            $deprecated: false,
            $extensions: { vendor: { source: 'figma' } },
            base: {
              $value: 8,
              $description: 'Base space.',
              $deprecated: 'Use scale.medium.',
              $extensions: { vendor: { id: 'VariableID:1' } },
            },
          },
        },
        { source: 'brand' }
      )
    )

    expect(fragment.tokens[0]).toMatchObject({
      path: ['scale', 'base'],
      type: 'number',
    })
    expect(fragment.groups[0]).not.toHaveProperty('$description')
    expect(fragment.groups[0]).not.toHaveProperty('$deprecated')
    expect(fragment.groups[0]).not.toHaveProperty('$extensions')
    expect(fragment.tokens[0]).not.toHaveProperty('$description')
    expect(fragment.tokens[0]).not.toHaveProperty('$deprecated')
    expect(fragment.tokens[0]).not.toHaveProperty('$extensions')
  })

  it.each([
    ['empty name', { '': { $type: 'number', $value: 1 } }],
    ['dot in a name', { 'scale.base': { $type: 'number', $value: 1 } }],
    ['brace in a name', { '{base}': { $type: 'number', $value: 1 } }],
    [
      'unknown group property',
      { $future: true, token: { $type: 'number', $value: 1 } },
    ],
    [
      'unknown token property',
      { token: { $type: 'number', $value: 1, $future: true } },
    ],
    [
      'token mixed with a child',
      {
        token: {
          $type: 'number',
          $value: 1,
          child: { $type: 'number', $value: 2 },
        },
      },
    ],
  ])('rejects %s', (_label, document) => {
    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic.code).toBe('dtcg.invalid-document')
  })

  it('rejects group cycles and reused group objects', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const shared = {
      token: { $type: 'number', $value: 1 },
    }

    for (const document of [{ cyclic }, { first: shared, second: shared }]) {
      const diagnostic = requireFailure(
        toGraphFragment(document, { source: 'brand' })
      )
      expect(diagnostic.code).toBe('dtcg.invalid-document')
      expect(diagnostic.message).toContain('group object')
    }
  })

  it('accepts 64 path segments and rejects 65', () => {
    expect(toGraphFragment(nestedDocument(63), { source: 'brand' }).ok).toBe(
      true
    )

    const diagnostic = requireFailure(
      toGraphFragment(nestedDocument(64), { source: 'brand' })
    )
    expect(diagnostic.code).toBe('dtcg.invalid-document')
    expect(diagnostic.message).toContain('64 path segments')
  })

  it('rejects token and group paths longer than 256 joined characters', () => {
    const segment = 'a'.repeat(128)
    const cases = [
      {
        document: {
          [segment]: {
            [segment]: { $type: 'number', $value: 1 },
          },
        },
        message: 'A DTCG token path can contain at most 256 characters.',
      },
      {
        document: {
          [segment]: {
            [segment]: {},
          },
        },
        message: 'A DTCG group path can contain at most 256 characters.',
      },
    ]

    for (const { document, message } of cases) {
      expect(
        requireFailure(toGraphFragment(document, { source: 'brand' }))
      ).toEqual({
        phase: 'source',
        code: 'dtcg.invalid-document',
        message,
      })
    }
  })

  it('accepts token and group paths with 256 joined characters', () => {
    const first = 'a'.repeat(127)
    const second = 'b'.repeat(128)

    expect(
      toGraphFragment(
        {
          [first]: {
            [second]: { $type: 'number', $value: 1 },
          },
        },
        { source: 'brand' }
      ).ok
    ).toBe(true)
    expect(
      toGraphFragment(
        {
          [first]: {
            [second]: {},
          },
        },
        { source: 'brand' }
      ).ok
    ).toBe(true)
  })

  it('uses one shared work limit for the document and token values', () => {
    const document: Record<string, unknown> = {}
    for (let index = 0; index < 14_286; index += 1) {
      document[`color-${index}`] = {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
        },
      }
    }

    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['color-9999', '$value'],
    })
  })

  it('rejects a wide document before reading its token values', () => {
    const keys = Array.from({ length: 100_001 }, (_, index) => `t${index}`)
    let valueReads = 0
    const document = new Proxy(Object.create(null) as Record<string, unknown>, {
      ownKeys() {
        return keys
      },
      getOwnPropertyDescriptor(_target, property) {
        return typeof property === 'string' && property.startsWith('t')
          ? { configurable: true, enumerable: true }
          : undefined
      },
      get() {
        valueReads += 1
        return { $type: 'number', $value: 1 }
      },
    })

    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
    })
    expect(valueReads).toBe(0)
  })

  it('counts each segment in a long token reference toward the work limit', () => {
    const reference = `{${Array.from({ length: 100_001 }, () => 'a').join(
      '.'
    )}}`
    const diagnostic = requireFailure(
      toGraphFragment({ alias: { $value: reference } }, { source: 'brand' })
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
    })
  })

  it('rejects a wide sparse value before reading array entries', () => {
    let indexReads = 0
    const sparse = new Proxy(new Array(100_001), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          indexReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })

    const diagnostic = requireFailure(
      toGraphFragment(
        { token: { $type: 'string', $value: sparse } },
        { source: 'brand' }
      )
    )

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
    })
    expect(indexReads).toBe(0)
  })

  it('reads the length of a proxied array once', () => {
    let lengthReads = 0
    let indexReads = 0
    const value = new Proxy([0, 0, 0], {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads += 1
          return lengthReads === 1 ? 3 : 100_001
        }
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          indexReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })

    requireFailure(
      toGraphFragment(
        { token: { $type: 'string', $value: value } },
        { source: 'brand' }
      )
    )

    expect(lengthReads).toBe(1)
    expect(indexReads).toBe(3)
  })

  it('infers an alias type through forward references', () => {
    const fragment = requireValue(
      toGraphFragment(
        {
          scale: {
            alias: { $value: '{scale.middle}' },
            middle: { $value: '{scale.base}' },
            base: { $type: 'number', $value: 8 },
          },
        },
        { source: 'brand' }
      )
    )

    expect(fragment.tokens.map(token => token.type)).toEqual([
      'number',
      'number',
      'number',
    ])
    const graph = requireValue(composeGraph([fragment]))
    const view = requireValue(createSourceView(graph, { id: 'brand' }))
    const alias = requireToken(fragment, token => token.name === 'alias')
    expect(requireValue(resolveToken(graph, view, alias.id)).value).toBe(8)
  })

  it.each([
    [
      'missing target',
      { alias: { $value: '{scale.missing}' } },
      'typed reference target',
    ],
    [
      'reference cycle',
      {
        first: { $value: '{second}' },
        second: { $value: '{first}' },
      },
      'reference cycle',
    ],
  ])('rejects an untyped alias with a %s', (_label, document, text) => {
    const diagnostic = requireFailure(
      toGraphFragment(document, { source: 'brand' })
    )

    expect(diagnostic.code).toBe('dtcg.invalid-document')
    expect(diagnostic.message).toContain(text)
  })
})
