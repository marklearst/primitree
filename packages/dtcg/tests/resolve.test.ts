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

describe('mergeDocuments', () => {
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
})

describe('applyResolver + resolveTokenValues', () => {
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

  it('ignores resolver sets and modifiers found only through prototypes', () => {
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

    expect(flattenTokens(applyResolver({}, inheritedResolver))).toEqual([])
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

  it('does not follow an inherited $ref in the resolution order', () => {
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

    expect(flattenTokens(applyResolver({}, inheritedOrderResolver))).toEqual([])
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

  it('ignores top-level sets found only through the resolver prototype', () => {
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

    expect(flattenTokens(applyResolver({}, inheritedSetsResolver))).toEqual([])
  })

  it('ignores top-level modifiers found only through the resolver prototype', () => {
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

    expect(
      flattenTokens(applyResolver({}, inheritedModifiersResolver))
    ).toEqual([])
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
})
