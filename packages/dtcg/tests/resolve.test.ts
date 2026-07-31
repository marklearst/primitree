import { afterEach, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toDTCG } from '../src/emit'
import {
  applyResolver,
  flattenTokens,
  listContexts,
  listPermutations,
  mergeDocuments,
  resolveTokenValues,
  resolveTokenValuesSafe,
  ReferenceResolutionError,
} from '../src/resolve'
import {
  isToken,
  type DTCGColorValue,
  type DTCGDocument,
  type DTCGGroup,
  type DTCGRef,
  type DTCGToken,
  type ResolverDocument,
  type ResolverModifier,
  type ResolverSet,
} from '../src/types'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)
const { files, resolver } = toDTCG(fixture)

afterEach(() => {
  Reflect.deleteProperty(Object.prototype, 'polluted')
})

function arrayWithInheritedIndex<T>(value: T): T[] {
  const prototype = Object.create(Array.prototype) as Record<number, T>
  Object.defineProperty(prototype, '0', {
    configurable: true,
    enumerable: true,
    value,
  })
  const array = new Array<T>(1)
  Object.setPrototypeOf(array, prototype)
  return array
}

function expectResolutionFailure(
  action: () => unknown,
  path: string,
  message: RegExp
): void {
  let thrown: unknown
  try {
    action()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(ReferenceResolutionError)
  expect(thrown).toMatchObject({ path })
  expect((thrown as Error).message).toMatch(message)
}

describe('mergeDocuments', () => {
  function nestedDocument(groupLevels: number): DTCGDocument {
    let document: DTCGDocument = {
      value: { $type: 'number', $value: 1 },
    }
    for (let depth = 0; depth < groupLevels; depth += 1) {
      document = { group: document }
    }
    return document
  }

  it('later documents override earlier tokens', () => {
    const merged = mergeDocuments([
      { a: { $type: 'number', $value: 1 } },
      { a: { $type: 'number', $value: 2 } },
    ])
    expect((merged.a as DTCGToken).$value).toBe(2)
  })

  it('merges sibling groups without clobbering', () => {
    const merged = mergeDocuments([
      { g: { a: { $type: 'number', $value: 1 } } },
      { g: { b: { $type: 'number', $value: 2 } } },
    ])
    const group = merged.g as Record<string, DTCGToken>
    expect(group.a?.$value).toBe(1)
    expect(group.b?.$value).toBe(2)
  })

  it('creates null-prototype dictionaries for every merged group', () => {
    const hostile = Object.create(null) as DTCGDocument
    hostile.safe = {
      nested: { token: { $type: 'string', $value: 'safe' } },
    }
    Reflect.set(hostile, '__proto__', {
      polluted: { $type: 'string', $value: 'still data' },
    })

    const merged = mergeDocuments([hostile])
    const safe = merged.safe as DTCGGroup
    const nested = safe.nested as DTCGGroup
    const proto = Reflect.get(merged, '__proto__') as DTCGGroup

    expect(Object.getPrototypeOf(merged)).toBeNull()
    expect(Object.getPrototypeOf(safe)).toBeNull()
    expect(Object.getPrototypeOf(nested)).toBeNull()
    expect(Object.getPrototypeOf(proto)).toBeNull()
    expect((proto.polluted as DTCGToken).$value).toBe('still data')
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('rejects malformed nested group children with an actionable path', () => {
    const malformed = {
      group: { child: null },
    } as unknown as DTCGDocument

    expectResolutionFailure(
      () => mergeDocuments([malformed]),
      '#/documents/0/group/child',
      /group child.*object/i
    )
  })

  it('rejects cyclic groups with an actionable path', () => {
    const cyclic = Object.create(null) as DTCGDocument
    cyclic.loop = cyclic

    expectResolutionFailure(
      () => mergeDocuments([cyclic]),
      '#/documents/0/loop',
      /cycle/i
    )
  })

  it('preserves reserved group metadata and $root tokens', () => {
    const document = {
      theme: {
        $description: 'Theme tokens',
        $extensions: { example: { enabled: true } },
        $root: { $type: 'string', $value: 'default' },
      },
    } as unknown as DTCGDocument

    const merged = mergeDocuments([document])
    const theme = merged.theme as unknown as Record<string, unknown>

    expect(theme.$description).toBe('Theme tokens')
    expect(theme.$extensions).toEqual({ example: { enabled: true } })
    expect((theme.$root as DTCGToken).$value).toBe('default')
  })

  it('merges 64 token-group levels', () => {
    const merged = mergeDocuments([nestedDocument(64)])
    let group: DTCGGroup = merged
    for (let depth = 0; depth < 64; depth += 1) {
      group = group.group as DTCGGroup
    }

    expect((group.value as DTCGToken).$value).toBe(1)
  })

  it('rejects more than 64 token-group levels', () => {
    const merge = () => mergeDocuments([nestedDocument(65)])

    expect(merge).toThrow(TypeError)
    expect(merge).toThrow(
      'Token document merging can read at most 64 token-group levels.'
    )
  })

  it('bounds merge work before copying an oversized group path', () => {
    const key = 'x'.repeat(1_000_001)
    const document = {
      [key]: { value: { $type: 'number', $value: 1 } },
    } as DTCGDocument

    expect(() => mergeDocuments([document])).toThrow(
      'Token document merging exceeds the 1,000,000-unit work limit.'
    )
  })
})

describe('flattenTokens', () => {
  it('flattens nested groups to dot paths', () => {
    const flat = flattenTokens(files['primitives.tokens.json'] ?? {})
    const paths = flat.map(f => f.path)
    expect(paths).toContain('primitives.color.blue.500')
    expect(paths).toContain('primitives.radius.sm')
    expect(paths).toHaveLength(7)
  })

  it('includes $root tokens while skipping other DTCG properties', () => {
    const flat = flattenTokens({
      color: {
        accent: {
          $description: { ignored: { $type: 'string', $value: 'metadata' } },
          $root: { $type: 'color', $value: '#ff00ff' },
        },
      },
    })

    expect(flat.map(entry => entry.path)).toEqual(['color.accent.$root'])
  })

  it('requires tokens to have an own $value property', () => {
    expect(isToken(Object.create({ $value: 'inherited' }))).toBe(false)
    expect(isToken({ $value: 'own' })).toBe(true)
    expect(isToken(Object.assign(Object.create(null), { $value: 'own' }))).toBe(
      true
    )
    expect(isToken({ $value: 'own', hasOwnProperty: () => false })).toBe(true)
  })

  it('rejects a non-group child allowed by group metadata types', () => {
    const invalid: DTCGDocument = { bad: undefined }

    expectResolutionFailure(
      () => flattenTokens(invalid),
      '#/document/bad',
      /group child.*object or token/i
    )
  })

  it('rejects a group cycle without recursive failure', () => {
    const cyclic = Object.create(null) as DTCGDocument
    cyclic.loop = cyclic

    expectResolutionFailure(
      () => flattenTokens(cyclic),
      '#/document/loop',
      /group cycle/i
    )
  })

  it('rejects more than 64 token-group levels', () => {
    let nested: DTCGDocument = {
      value: { $type: 'number', $value: 1 },
    }
    for (let depth = 0; depth <= 64; depth += 1) {
      nested = { group: nested }
    }

    expect(() => flattenTokens(nested)).toThrow(
      'Token flattening can read at most 64 token-group levels.'
    )
  })
})

describe('applyResolver + resolveTokenValues', () => {
  function aliasChain(length: number): Array<{
    path: string
    token: DTCGToken
  }> {
    return Array.from({ length }, (_, index) => ({
      path: `token-${index}`,
      token: {
        $type: 'number',
        $value: index === length - 1 ? 1 : `{token-${index + 1}}`,
      },
    }))
  }

  it('bounds work across repeated Resolver sources', () => {
    const source = { $ref: 'empty.tokens.json' } as const
    const repeatedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        repeated: { sources: Array(200_000).fill(source) },
      },
      resolutionOrder: [{ $ref: '#/sets/repeated' }],
    }

    expect(() =>
      applyResolver({ 'empty.tokens.json': {} }, repeatedResolver)
    ).toThrow('Resolver application exceeds the 1,000,000-unit work limit.')
  })

  it('resolves the default contexts (light, comfortable)', () => {
    const merged = applyResolver(files, resolver)
    const values = resolveTokenValues(flattenTokens(merged))

    const brand = values.get('semantic.color.bg.brand') as DTCGColorValue
    expect(brand.hex).toBe('#3366ff')
    expect(values.get('density.control.height')).toEqual({
      value: 40,
      unit: 'px',
    })
  })

  it('resolves the dark context through alias chains', () => {
    const merged = applyResolver(files, resolver, { semantic: 'dark' })
    const values = resolveTokenValues(flattenTokens(merged))

    const brand = values.get('semantic.color.bg.brand') as DTCGColorValue
    expect(brand.components).toEqual([0.55, 0.7, 1])
    const accent = values.get('semantic.color.bg.accent') as DTCGColorValue
    expect(accent.components).toEqual([0.55, 0.7, 1])
    // Unchanged in dark: falls through to the base (light) value.
    expect(values.get('semantic.space.page')).toEqual({ value: 8, unit: 'px' })
  })

  it('resolves combined permutations (dark + compact)', () => {
    const merged = applyResolver(files, resolver, {
      semantic: 'dark',
      density: 'compact',
    })
    const values = resolveTokenValues(flattenTokens(merged))
    expect(values.get('density.control.height')).toEqual({
      value: 32,
      unit: 'px',
    })
  })

  it('throws on unknown contexts', () => {
    expect(() => applyResolver(files, resolver, { semantic: 'sepia' })).toThrow(
      ReferenceResolutionError
    )
  })

  it('throws on missing reference targets', () => {
    const flat = flattenTokens({
      a: { $type: 'color', $value: '{does.not.exist}' },
    })
    expect(() => resolveTokenValues(flat)).toThrow(ReferenceResolutionError)
  })

  it('throws on reference cycles', () => {
    const flat = flattenTokens({
      a: { $type: 'number', $value: '{b}' },
      b: { $type: 'number', $value: '{a}' },
    })
    expect(() => resolveTokenValues(flat)).toThrow(/cycle/i)
  })

  it('resolves a long alias chain without recursive calls', () => {
    const values = resolveTokenValues(aliasChain(10_000))

    expect(values.get('token-0')).toBe(1)
    expect(values.get('token-9999')).toBe(1)
  })

  it('reports a long alias cycle without recursive calls', () => {
    const flat = aliasChain(10_000)
    flat[9_999] = {
      path: 'token-9999',
      token: { $type: 'number', $value: '{token-0}' },
    }

    expectResolutionFailure(
      () => resolveTokenValues(flat),
      'token-0',
      /^Reference cycle: token-0 -> token-1/
    )
  })

  it('collects one rotated cycle error for each failed token', () => {
    const result = resolveTokenValuesSafe(
      flattenTokens({
        a: { $type: 'number', $value: '{b}' },
        b: { $type: 'number', $value: '{a}' },
      })
    )

    expect(result.values).toHaveLength(0)
    expect(
      result.errors.map(error => ({
        message: error.message,
        path: error.path,
      }))
    ).toEqual([
      { message: 'Reference cycle: a -> b -> a', path: 'a' },
      { message: 'Reference cycle: b -> a -> b', path: 'b' },
    ])
  })

  it('adds a resolved target before aliases that point to it', () => {
    const values = resolveTokenValues(
      flattenTokens({
        a: { $type: 'number', $value: '{b}' },
        b: { $type: 'number', $value: '{c}' },
        c: { $type: 'number', $value: 1 },
      })
    )

    expect([...values.keys()]).toEqual(['c', 'b', 'a'])
  })

  it.each([resolveTokenValues, resolveTokenValuesSafe])(
    'bounds work before copying a long reference',
    resolve => {
      const target = 'x'.repeat(1_000_001)
      expect(() =>
        resolve([
          {
            path: 'alias',
            token: { $type: 'number', $value: `{${target}}` },
          },
        ])
      ).toThrow(
        'Token reference resolution exceeds the 1,000,000-unit work limit.'
      )
    }
  )

  it('keeps the path leading into a cycle in the error', () => {
    expectResolutionFailure(
      () =>
        resolveTokenValues(
          flattenTokens({
            tail: { $type: 'number', $value: '{a}' },
            a: { $type: 'number', $value: '{b}' },
            b: { $type: 'number', $value: '{a}' },
          })
        ),
      'a',
      /^Reference cycle: tail -> a -> b -> a$/
    )
  })

  it('resolves own dangerous file, set, modifier, and context keys', () => {
    const hostileFiles = Object.create(null) as Record<string, DTCGDocument>
    hostileFiles['__proto__.tokens.json'] = {
      base: { $type: 'string', $value: 'base' },
    }
    hostileFiles['constructor.tokens.json'] = {
      override: { $type: 'string', $value: 'override' },
    }

    const sets = Object.create(null) as Record<string, ResolverSet>
    Reflect.set(sets, '__proto__', {
      sources: [{ $ref: './__proto__.tokens.json' }],
    })
    const contexts = Object.create(null) as ResolverModifier['contexts']
    Reflect.set(contexts, 'prototype', [{ $ref: './constructor.tokens.json' }])
    const modifiers = Object.create(null) as Record<string, ResolverModifier>
    Reflect.set(modifiers, 'constructor', { default: 'prototype', contexts })
    const hostileResolver: ResolverDocument = {
      version: '2025.10',
      sets,
      modifiers,
      resolutionOrder: [
        { $ref: '#/sets/__proto__' },
        { $ref: '#/modifiers/constructor' },
      ],
    }
    const input = Object.create(null) as Record<string, string>
    Reflect.set(input, 'constructor', 'prototype')

    const merged = applyResolver(hostileFiles, hostileResolver, input)

    expect((merged.base as DTCGToken).$value).toBe('base')
    expect((merged.override as DTCGToken).$value).toBe('override')
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('rejects token files found only through the files prototype', () => {
    const inheritedFiles = Object.create({
      'inherited.tokens.json': {
        inherited: { $type: 'string', $value: 'unsafe' },
      },
    }) as Record<string, DTCGDocument>
    const inheritedFileResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './inherited.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(() => applyResolver(inheritedFiles, inheritedFileResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('rejects resolver targets found only through prototypes', () => {
    const inheritedSets = Object.create({
      inherited: {
        sources: [{ fromSet: { $type: 'string', $value: 'unsafe' } }],
      },
    }) as Record<string, ResolverSet>
    const inheritedModifiers = Object.create({
      inherited: {
        default: 'default',
        contexts: {
          default: [{ fromModifier: { $type: 'string', $value: 'unsafe' } }],
        },
      },
    }) as Record<string, ResolverModifier>
    const inheritedResolver: ResolverDocument = {
      version: '2025.10',
      sets: inheritedSets,
      modifiers: inheritedModifiers,
      resolutionOrder: [
        { $ref: '#/sets/inherited' },
        { $ref: '#/modifiers/inherited' },
      ],
    }

    expectResolutionFailure(
      () => applyResolver({}, inheritedResolver),
      '#/resolutionOrder/0',
      /missing set "inherited"/i
    )
  })

  it('rejects modifier contexts found only through the contexts prototype', () => {
    const contexts = Object.create({
      inherited: [{ unsafe: { $type: 'string', $value: 'inherited context' } }],
    }) as ResolverModifier['contexts']
    const inheritedContextResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: { default: 'inherited', contexts },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expect(() => applyResolver({}, inheritedContextResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('ignores context selections found only through the input prototype', () => {
    const inheritedInput = Object.create({ theme: 'dark' }) as Record<
      string,
      string
    >
    const selectionResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ selected: { $type: 'string', $value: 'light' } }],
            dark: [{ selected: { $type: 'string', $value: 'dark' } }],
          },
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    const merged = applyResolver({}, selectionResolver, inheritedInput)
    expect((merged.selected as DTCGToken).$value).toBe('light')
  })

  it('does not treat an inherited $ref as a file reference', () => {
    const inheritedRef = Object.create({
      $ref: './secret.tokens.json',
    }) as DTCGRef
    const inheritedRefResolver: ResolverDocument = {
      version: '2025.10',
      sets: { base: { sources: [inheritedRef] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }
    const secretFiles: Record<string, DTCGDocument> = {
      'secret.tokens.json': {
        secret: { $type: 'string', $value: 'unsafe' },
      },
    }

    expect(
      flattenTokens(applyResolver(secretFiles, inheritedRefResolver))
    ).toEqual([])
  })

  it('decodes unreserved, space, and Unicode text in local source references', () => {
    const encodedRefResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './%62ase%20%E8%89%B2.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(
      flattenTokens(
        applyResolver(
          {
            'base 色.tokens.json': {
              value: { $type: 'number', $value: 1 },
            },
          },
          encodedRefResolver
        )
      )
    ).toEqual([{ path: 'value', token: { $type: 'number', $value: 1 } }])
  })

  it('keeps an escaped slash in a local source file name', () => {
    const encodedRefResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './folder%2Ftokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(
      flattenTokens(
        applyResolver(
          {
            'folder%2Ftokens.json': {
              selected: { $type: 'string', $value: 'encoded file name' },
            },
            'folder/tokens.json': {
              selected: { $type: 'string', $value: 'nested path' },
            },
          },
          encodedRefResolver
        )
      )
    ).toEqual([
      {
        path: 'selected',
        token: { $type: 'string', $value: 'encoded file name' },
      },
    ])
  })

  it('rejects malformed URI text in a local source reference', () => {
    const malformedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './base%2.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, malformedResolver),
      '#/sets/base/sources/0',
      /invalid URI encoding/i
    )
  })

  it('reads a source $ref accessor once', () => {
    let reads = 0
    const source = Object.create(null) as DTCGRef
    Object.defineProperty(source, '$ref', {
      enumerable: true,
      get() {
        reads += 1
        return reads === 1 ? './base.tokens.json' : './missing.tokens.json'
      },
    })
    const accessorResolver: ResolverDocument = {
      version: '2025.10',
      sets: { base: { sources: [source] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(
      flattenTokens(
        applyResolver(
          {
            'base.tokens.json': {
              value: { $type: 'number', $value: 1 },
            },
          },
          accessorResolver
        )
      )
    ).toEqual([{ path: 'value', token: { $type: 'number', $value: 1 } }])
    expect(reads).toBe(1)
  })

  it('rejects an inherited $ref in the resolution order', () => {
    const inheritedOrderEntry = Object.create({
      $ref: '#/sets/base',
    }) as DTCGRef
    const inheritedOrderResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: {
          sources: [{ selected: { $type: 'string', $value: 'unsafe' } }],
        },
      },
      resolutionOrder: [inheritedOrderEntry],
    }

    expectResolutionFailure(
      () => applyResolver({}, inheritedOrderResolver),
      '#/resolutionOrder/0',
      /set or modifier reference/i
    )
  })

  it.each([
    ['missing set', '#/sets/missing', /missing set "missing"/i],
    ['missing modifier', '#/modifiers/missing', /missing modifier "missing"/i],
    ['unsupported target', '#/other/name', /set or modifier reference/i],
  ])('rejects a %s in resolutionOrder', (_, ref, message) => {
    const invalidResolver: ResolverDocument = {
      version: '2025.10',
      resolutionOrder: [{ $ref: ref }],
    }

    expectResolutionFailure(
      () => applyResolver({}, invalidResolver),
      '#/resolutionOrder/0',
      message
    )
  })

  it('decodes JSON Pointer escapes in resolutionOrder names', () => {
    const escapedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        'base/~tokens': {
          sources: [{ value: { $type: 'number', $value: 1 } }],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base~1~0tokens' }],
    }

    expect(flattenTokens(applyResolver({}, escapedResolver))).toEqual([
      { path: 'value', token: { $type: 'number', $value: 1 } },
    ])
  })

  it('decodes URI text in resolutionOrder JSON Pointer fragments', () => {
    const encodedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        'base tokens 色': {
          sources: [{ value: { $type: 'number', $value: 1 } }],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base%20tokens%20%E8%89%B2' }],
    }

    expect(flattenTokens(applyResolver({}, encodedResolver))).toEqual([
      { path: 'value', token: { $type: 'number', $value: 1 } },
    ])
  })

  it('rejects malformed URI text in a resolutionOrder reference', () => {
    const malformedResolver: ResolverDocument = {
      version: '2025.10',
      resolutionOrder: [{ $ref: '#/sets/base%2' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, malformedResolver),
      '#/resolutionOrder/0',
      /invalid URI encoding/i
    )
  })

  it('reads a resolutionOrder $ref accessor once', () => {
    let reads = 0
    const entry = Object.create(null) as DTCGRef
    Object.defineProperty(entry, '$ref', {
      enumerable: true,
      get() {
        reads += 1
        return reads === 1 ? '#/sets/base' : '#/sets/missing'
      },
    })
    const accessorResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ value: { $type: 'number', $value: 1 } }] },
      },
      resolutionOrder: [entry],
    }

    expect(flattenTokens(applyResolver({}, accessorResolver))).toEqual([
      { path: 'value', token: { $type: 'number', $value: 1 } },
    ])
    expect(reads).toBe(1)
  })

  it.each([
    ['sparse', new Array<DTCGRef | DTCGDocument>(1)],
    [
      'inherited',
      arrayWithInheritedIndex<DTCGRef | DTCGDocument>({
        inherited: { $value: 'unsafe' },
      }),
    ],
  ])('rejects %s indices in set source arrays', (_, sources) => {
    const invalidResolver: ResolverDocument = {
      version: '2025.10',
      sets: { base: { sources } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, invalidResolver),
      '#/sets/base/sources/0',
      /own element/i
    )
  })

  it.each([
    ['sparse', new Array<DTCGRef | DTCGDocument>(1)],
    [
      'inherited',
      arrayWithInheritedIndex<DTCGRef | DTCGDocument>({
        inherited: { $value: 'unsafe' },
      }),
    ],
  ])('rejects %s indices in context source arrays', (_, sources) => {
    const invalidResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: {
          default: 'light',
          contexts: { light: sources },
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, invalidResolver),
      '#/modifiers/theme/contexts/light/0',
      /own element/i
    )
  })

  it.each([
    ['sparse', new Array<DTCGRef>(1)],
    ['inherited', arrayWithInheritedIndex<DTCGRef>({ $ref: '#/sets/base' })],
  ])('rejects %s indices in resolutionOrder', (_, resolutionOrder) => {
    const invalidResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ inherited: { $value: 'unsafe' } }] },
      },
      resolutionOrder,
    }

    expectResolutionFailure(
      () => applyResolver({}, invalidResolver),
      '#/resolutionOrder/0',
      /own element/i
    )
  })

  it('rejects primitive group children in referenced documents', () => {
    const referencedFiles = {
      'malformed.tokens.json': {
        group: { child: 'not a group' },
      } as unknown as DTCGDocument,
    }
    const referencedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './malformed.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver(referencedFiles, referencedResolver),
      './malformed.tokens.json/group/child',
      /group child.*object/i
    )
  })

  it('rejects primitive group children in inline documents', () => {
    const inlineResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: {
          sources: [
            {
              group: { child: null },
            } as unknown as DTCGDocument,
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, inlineResolver),
      '#/sets/base/sources/0/group/child',
      /group child.*object/i
    )
  })

  it('rejects cyclic groups in referenced documents', () => {
    const cyclic = Object.create(null) as DTCGDocument
    cyclic.loop = cyclic
    const referencedResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: { sources: [{ $ref: './cyclic.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver({ 'cyclic.tokens.json': cyclic }, referencedResolver),
      './cyclic.tokens.json/loop',
      /cycle/i
    )
  })

  it('rejects cyclic groups in inline documents', () => {
    const cyclic = Object.create(null) as DTCGDocument
    cyclic.loop = cyclic
    const inlineResolver: ResolverDocument = {
      version: '2025.10',
      sets: { base: { sources: [cyclic] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, inlineResolver),
      '#/sets/base/sources/0/loop',
      /cycle/i
    )
  })

  it.each([
    [
      'inherited',
      Object.assign(
        Object.create({
          resolutionOrder: [{ $ref: '#/sets/attacker' }],
        }),
        {
          version: '2025.10',
          sets: {
            attacker: { sources: [{ attacker: { $value: 'unsafe' } }] },
          },
        }
      ) as ResolverDocument,
    ],
    [
      'missing',
      {
        version: '2025.10',
        sets: {
          attacker: { sources: [{ attacker: { $value: 'unsafe' } }] },
        },
      } as unknown as ResolverDocument,
    ],
  ])('rejects an %s top-level resolutionOrder', (_, invalidResolver) => {
    expect(() => applyResolver({}, invalidResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, invalidResolver)).toThrow(
      /resolutionOrder.*own array/i
    )
  })

  it('rejects top-level sets found only through the resolver prototype', () => {
    const inheritedSetsResolver = Object.assign(
      Object.create({
        sets: {
          attacker: { sources: [{ attacker: { $value: 'unsafe' } }] },
        },
      }),
      {
        version: '2025.10',
        resolutionOrder: [{ $ref: '#/sets/attacker' }],
      }
    ) as ResolverDocument

    expectResolutionFailure(
      () => applyResolver({}, inheritedSetsResolver),
      '#/resolutionOrder/0',
      /missing set "attacker"/i
    )
  })

  it('rejects top-level modifiers found only through the resolver prototype', () => {
    const inheritedModifiersResolver = Object.assign(
      Object.create({
        modifiers: {
          attacker: {
            default: 'unsafe',
            contexts: {
              unsafe: [{ attacker: { $value: 'unsafe' } }],
            },
          },
        },
      }),
      {
        version: '2025.10',
        resolutionOrder: [{ $ref: '#/modifiers/attacker' }],
      }
    ) as ResolverDocument

    expectResolutionFailure(
      () => applyResolver({}, inheritedModifiersResolver),
      '#/resolutionOrder/0',
      /missing modifier "attacker"/i
    )
    expect(listContexts(inheritedModifiersResolver)).toEqual({})
  })

  it('rejects a set whose sources exist only on its prototype', () => {
    const inheritedSources = Object.create({
      sources: [{ attacker: { $value: 'unsafe' } }],
    }) as ResolverSet
    const inheritedSourcesResolver: ResolverDocument = {
      version: '2025.10',
      sets: { base: inheritedSources },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(() => applyResolver({}, inheritedSourcesResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, inheritedSourcesResolver)).toThrow(
      /set "base".*sources.*own array/i
    )
  })

  it('rejects a set with a malformed own sources value', () => {
    const malformedSourcesResolver: ResolverDocument = {
      version: '2025.10',
      sets: {
        base: {
          sources: { attacker: { $value: 'unsafe' } },
        } as unknown as ResolverSet,
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }

    expect(() => applyResolver({}, malformedSourcesResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, malformedSourcesResolver)).toThrow(
      /set "base".*sources.*own array/i
    )
  })

  it('rejects a modifier whose contexts exist only on its prototype', () => {
    const inheritedContexts = Object.assign(
      Object.create({
        contexts: {
          unsafe: [{ attacker: { $value: 'unsafe' } }],
        },
      }),
      { default: 'unsafe' }
    ) as ResolverModifier
    const inheritedContextsResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: { theme: inheritedContexts },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expect(() => applyResolver({}, inheritedContextsResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, inheritedContextsResolver)).toThrow(
      /modifier "theme".*contexts.*own object/i
    )
    expect(() => listContexts(inheritedContextsResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('rejects a modifier with a malformed own contexts value', () => {
    const malformedContextsResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: { contexts: [] } as unknown as ResolverModifier,
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expect(() => applyResolver({}, malformedContextsResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, malformedContextsResolver)).toThrow(
      /modifier "theme".*contexts.*own object/i
    )
    expect(() => listContexts(malformedContextsResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('rejects a modifier without contexts', () => {
    const emptyResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: { theme: { contexts: {} } },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, emptyResolver),
      '#/modifiers/theme/contexts',
      /define at least one context/i
    )
    expect(() => listContexts(emptyResolver)).toThrow(ReferenceResolutionError)
    expect(() => listPermutations(emptyResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('rejects a modifier default that is not one of its contexts', () => {
    const missingDefaultResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: {
          default: 'missing',
          contexts: { light: [] },
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expectResolutionFailure(
      () => applyResolver({}, missingDefaultResolver),
      '#/modifiers/theme/default',
      /name one of its own contexts/i
    )
    expect(() => listContexts(missingDefaultResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => listPermutations(missingDefaultResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('rejects a modifier context with malformed own sources', () => {
    const malformedContextSourcesResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: {
        theme: {
          default: 'dark',
          contexts: {
            dark: { attacker: { $value: 'unsafe' } } as unknown as Array<
              DTCGRef | DTCGDocument
            >,
          },
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    expect(() => applyResolver({}, malformedContextSourcesResolver)).toThrow(
      ReferenceResolutionError
    )
    expect(() => applyResolver({}, malformedContextSourcesResolver)).toThrow(
      /context "dark".*sources.*array/i
    )
    expect(() => listContexts(malformedContextSourcesResolver)).toThrow(
      ReferenceResolutionError
    )
  })

  it('ignores a default context found only through the modifier prototype', () => {
    const inheritedDefault = Object.assign(Object.create({ default: 'dark' }), {
      contexts: {
        light: [{ selected: { $value: 'light' } }],
        dark: [{ selected: { $value: 'unsafe' } }],
      },
    }) as ResolverModifier
    const inheritedDefaultResolver: ResolverDocument = {
      version: '2025.10',
      modifiers: { theme: inheritedDefault },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    }

    const merged = applyResolver({}, inheritedDefaultResolver)
    expect((merged.selected as DTCGToken).$value).toBe('light')
  })

  it.each([
    [
      'sets',
      {
        version: '2025.10',
        sets: [],
        resolutionOrder: [],
      } as unknown as ResolverDocument,
    ],
    [
      'modifiers',
      {
        version: '2025.10',
        modifiers: [],
        resolutionOrder: [],
      } as unknown as ResolverDocument,
    ],
  ])(
    'rejects a malformed own top-level %s container',
    (name, invalidResolver) => {
      expect(() => applyResolver({}, invalidResolver)).toThrow(
        ReferenceResolutionError
      )
      expect(() => applyResolver({}, invalidResolver)).toThrow(
        new RegExp(`${name}.*object`, 'i')
      )
    }
  )
})

describe('listContexts / listPermutations', () => {
  it('lists modifier axes and contexts', () => {
    const contexts = listContexts(resolver)
    expect(contexts).toEqual({
      semantic: ['light', 'dark'],
      density: ['comfortable', 'compact'],
    })
    expect(Object.getPrototypeOf(contexts)).toBeNull()
  })

  it('bounds modifier names before building context paths', () => {
    const modifier = 'x'.repeat(1_000_001)

    expect(() =>
      listContexts({
        version: '2025.10',
        modifiers: { [modifier]: { contexts: { only: [] } } },
        resolutionOrder: [],
      })
    ).toThrow('Resolver contexts exceed the 1,000,000-unit work limit.')
  })

  it('lists only own modifier and context entries', () => {
    const contexts = Object.assign(Object.create({ inherited: [] }), {
      own: [],
    }) as ResolverModifier['contexts']
    const modifiers = Object.assign(
      Object.create({
        inherited: { contexts: { unsafe: [] } },
      }) as Record<string, ResolverModifier>,
      { theme: { contexts } }
    )
    const ownOnly = listContexts({
      version: '2025.10',
      modifiers,
      resolutionOrder: [],
    })

    expect(ownOnly).toEqual({ theme: ['own'] })
    expect(Object.getPrototypeOf(ownOnly)).toBeNull()
  })

  it('enumerates the full cross-product of contexts', () => {
    const permutations = listPermutations(resolver)
    expect(permutations).toHaveLength(4)
    expect(permutations).toContainEqual({
      semantic: 'dark',
      density: 'compact',
    })
  })

  it('returns a single empty permutation when there are no modifiers', () => {
    expect(
      listPermutations({ version: '2025.10', resolutionOrder: [] })
    ).toEqual([{}])
  })

  it('allows exactly 1,000 context permutations', () => {
    const contexts = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`context-${index}`, []])
    )
    const modifiers = Object.fromEntries(
      Array.from({ length: 3 }, (_, index) => [`axis-${index}`, { contexts }])
    )

    expect(
      listPermutations({
        version: '2025.10',
        modifiers,
        resolutionOrder: [],
      })
    ).toHaveLength(1_000)
  })

  it('rejects more than 1,000 context permutations before allocation', () => {
    const modifiers = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `axis-${index}`,
        { contexts: { first: [], second: [] } },
      ])
    )

    expect(() =>
      listPermutations({
        version: '2025.10',
        modifiers,
        resolutionOrder: [],
      })
    ).toThrow('Resolver can contain at most 1,000 context permutations.')
  })

  it('bounds the work needed to copy many modifier selections', () => {
    const modifiers = Object.fromEntries(
      Array.from({ length: 1_500 }, (_, index) => [
        `axis-${index}`,
        { contexts: { only: [] } },
      ])
    )

    expect(() =>
      listPermutations({
        version: '2025.10',
        modifiers,
        resolutionOrder: [],
      })
    ).toThrow(
      'Resolver context permutations exceed the 1,000,000-unit work limit.'
    )
  })
})
