import fs from 'node:fs/promises'
import path from 'node:path'
import { toDTCG } from '@primitree/dtcg'
import { describe, expect, it, vi } from 'vitest'
import type { TokenSource } from '../src/source'
import {
  diffTokens,
  getToken,
  listCollections,
  resolveContext,
  searchTokens,
} from '../src/tools'

const validationPreparationProbe = vi.hoisted(() => ({
  enabled: false,
  tokenEnabled: false,
  tokenExtraReads: 0,
  untouchedOwnKeys: 0,
}))

vi.mock('@primitree/dtcg', async importOriginal => {
  const actual = await importOriginal<typeof import('@primitree/dtcg')>()
  return {
    ...actual,
    applyResolver(...args: Parameters<typeof actual.applyResolver>) {
      const document = actual.applyResolver(...args)
      if (validationPreparationProbe.tokenEnabled) {
        const token = document.untyped
        if (
          typeof token === 'object' &&
          token !== null &&
          !Array.isArray(token)
        ) {
          document.untyped = new Proxy(token, {
            get(target, property, receiver) {
              if (
                typeof property === 'string' &&
                property.startsWith('$extra')
              ) {
                validationPreparationProbe.tokenExtraReads += 1
              }
              return Reflect.get(target, property, receiver)
            },
          })
        }
      }
      if (validationPreparationProbe.enabled) {
        const untouched = document.untouched
        if (
          typeof untouched === 'object' &&
          untouched !== null &&
          !Array.isArray(untouched)
        ) {
          document.untouched = new Proxy(untouched, {
            ownKeys(target) {
              validationPreparationProbe.untouchedOwnKeys += 1
              return Reflect.ownKeys(target)
            },
          })
        }
      }
      return document
    },
  }
})

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))

const built = toDTCG(fixture)
const source: TokenSource = {
  files: built.files,
  resolver: built.resolver,
  origin: 'test',
  variablesJson: fixture,
}

const namedWeightSource: TokenSource = {
  files: {
    'source.tokens.json': {
      explicitWeight: { $type: 'fontWeight', $value: 'semi-bold' },
      inheritedWeights: {
        $type: 'fontWeight',
        base: { $value: 'semi-bold' },
      },
      aliasWeight: { $value: '{inheritedWeights.base}' },
      stringValue: { $type: 'string', $value: 'semi-bold' },
    },
  },
  resolver: {
    version: '2025.10',
    sets: {
      source: { sources: [{ $ref: 'source.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/source' }],
  },
  origin: 'test',
}

const untypedSource: TokenSource = {
  files: {
    'source.tokens.json': {
      untyped: {
        $value: 'plain',
        $description: 'No declared type',
      },
    },
  },
  resolver: {
    version: '2025.10',
    sets: {
      source: { sources: [{ $ref: 'source.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/source' }],
  },
  origin: 'test',
}

const untypedKindsSource: TokenSource = {
  files: {
    'source.tokens.json': {
      number: { $value: 4 },
      boolean: { $value: true },
      color: {
        $value: {
          colorSpace: 'srgb',
          components: [0.2, 0.4, 1],
        },
      },
      curve: { $value: [0.25, 0.1, 0.75, 0.9] },
      dimension: { $value: { value: 8, unit: 'px' } },
      duration: { $value: { value: 200, unit: 'ms' } },
      fontFamily: { $value: ['Inter', 'sans-serif'] },
      aliasBase: { $value: 'aliased' },
      aliasMiddle: { $value: '{aliasBase}' },
      alias: { $value: '{aliasMiddle}' },
    },
  },
  resolver: {
    version: '2025.10',
    sets: {
      source: { sources: [{ $ref: 'source.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/source' }],
  },
  origin: 'test',
}

const malformedUntypedSource: TokenSource = {
  files: {
    'source.tokens.json': {
      malformed: {
        $value: {
          colorSpace: 'srgb',
          components: [],
        },
      },
    },
  },
  resolver: {
    version: '2025.10',
    sets: {
      source: { sources: [{ $ref: 'source.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/source' }],
  },
  origin: 'test',
}

const sharedOccurrenceSource: TokenSource = (() => {
  const shared = { $value: 'plain' }
  return {
    files: {
      'source.tokens.json': {
        typed: {
          $type: 'number',
          bad: shared,
        },
        untyped: shared,
      },
    },
    resolver: {
      version: '2025.10',
      sets: {
        source: { sources: [{ $ref: 'source.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/source' }],
    },
    origin: 'test',
  }
})()

describe('listCollections', () => {
  it('lists collection groups with counts and contexts', () => {
    const result = listCollections(source)
    expect(result.collections).toContainEqual({
      name: 'primitives',
      tokens: 7,
    })
    expect(result.collections).toContainEqual({ name: 'semantic', tokens: 4 })
    expect(result.contexts).toEqual({
      semantic: ['light', 'dark'],
      density: ['comfortable', 'compact'],
    })
  })

  it('counts a collection that contains an untyped literal token', () => {
    expect(listCollections(untypedSource).collections).toEqual([
      { name: 'untyped', tokens: 1 },
    ])
  })
})

describe('getToken', () => {
  it('returns the token, resolved value, css, and figma metadata', () => {
    const result = getToken(source, 'semantic.color.bg.brand')
    expect(result.found).toBe(true)
    expect(result.css).toBe('color(srgb 0.2 0.4 1)')
    expect(result.cssVar).toBe('var(--semantic-color-bg-brand)')
    expect(result.token?.$value).toBe('{primitives.color.blue.500}')
    expect(result.token?.$extensions).toMatchObject({
      'com.primitree': { variableId: 'VariableID:2:201' },
    })
    expect((result.figma as { variableId: string }).variableId).toBe(
      'VariableID:2:201'
    )
  })

  it('resolves under an explicit context', () => {
    const result = getToken(source, 'semantic.color.bg.brand', {
      semantic: 'dark',
    })
    expect(result.css).toBe('color(srgb 0.55 0.7 1)')
  })

  it('reports missing tokens', () => {
    expect(getToken(source, 'nope').found).toBe(false)
  })

  it('formats an explicit named font weight as CSS', () => {
    expect(getToken(namedWeightSource, 'explicitWeight').css).toBe('600')
  })

  it('preserves an ordinary string that resembles a font weight', () => {
    expect(getToken(namedWeightSource, 'stringValue').css).toBe('semi-bold')
  })

  it('returns a literal token without an effective type', () => {
    expect(getToken(untypedSource, 'untyped')).toMatchObject({
      path: 'untyped',
      found: true,
      value: 'plain',
      css: 'plain',
      cssVar: 'var(--untyped)',
    })
  })

  it.each([
    ['number', 4, '4'],
    ['boolean', true, 'true'],
    [
      'color',
      { colorSpace: 'srgb', components: [0.2, 0.4, 1] },
      'color(srgb 0.2 0.4 1)',
    ],
    ['curve', [0.25, 0.1, 0.75, 0.9], 'cubic-bezier(0.25, 0.1, 0.75, 0.9)'],
    ['dimension', { value: 8, unit: 'px' }, '8px'],
    ['duration', { value: 200, unit: 'ms' }, '200ms'],
    ['fontFamily', ['Inter', 'sans-serif'], 'Inter, sans-serif'],
    ['alias', 'aliased', 'aliased'],
  ])('returns an untyped %s value', (path, expectedValue, expectedCss) => {
    expect(getToken(untypedKindsSource, path)).toMatchObject({
      path,
      found: true,
      value: expectedValue,
      css: expectedCss,
    })
  })
})

describe('resolveContext', () => {
  it('resolves all tokens under a context selection', () => {
    const result = resolveContext(source, {
      semantic: 'dark',
      density: 'compact',
    })
    const byPath = new Map(result.tokens.map(t => [t.path, t]))
    expect(byPath.get('semantic.color.bg.brand')?.css).toBe(
      'color(srgb 0.55 0.7 1)'
    )
    expect(byPath.get('density.control.height')?.css).toBe('32px')
    expect(result.truncated).toBe(false)
    expect(result.total).toBe(12)
  })

  it('truncates at the limit', () => {
    const result = resolveContext(source, {}, 3)
    expect(result.tokens).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it('formats a group-inherited named font weight as CSS', () => {
    const result = resolveContext(namedWeightSource, {})

    expect(result.tokens).toContainEqual({
      path: 'inheritedWeights.base',
      type: 'fontWeight',
      css: '600',
    })
  })

  it('omits the type for a literal token without an effective type', () => {
    expect(resolveContext(untypedSource, {}).tokens).toEqual([
      { path: 'untyped', css: 'plain' },
    ])
  })

  it('reports group-inherited and alias-inferred token types', () => {
    const typedSource: TokenSource = {
      files: {
        'source.tokens.json': {
          color: {
            $type: 'color',
            base: {
              $value: {
                colorSpace: 'srgb',
                components: [0.2, 0.4, 1],
              },
            },
          },
          alias: { $value: '{color.base}' },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    expect(searchTokens(typedSource, '', 'color').results).toHaveLength(2)
    expect(resolveContext(typedSource, {}).tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'alias', type: 'color' }),
        expect.objectContaining({ path: 'color.base', type: 'color' }),
      ])
    )
  })

  it('reports missing references instead of returning null CSS', () => {
    const brokenSource: TokenSource = {
      files: {
        'source.tokens.json': {
          alias: { $type: 'string', $value: '{missing}' },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    let failure: unknown
    try {
      resolveContext(brokenSource, {})
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      name: 'TokenSourceResolutionError',
      errors: [expect.objectContaining({ path: 'missing' })],
    })
    expect((failure as Error).message).toMatch(
      /Token source resolution failed.*alias.*missing/s
    )
  })

  it('reports reference cycles instead of returning null CSS', () => {
    const cyclicSource: TokenSource = {
      files: {
        'source.tokens.json': {
          first: { $type: 'string', $value: '{second}' },
          second: { $type: 'string', $value: '{first}' },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    expect(() => resolveContext(cyclicSource, {})).toThrow(
      /Token source resolution failed.*cycle/s
    )
  })

  it('keeps graph diagnostic codes and paths in source errors', () => {
    const invalidSource: TokenSource = {
      files: {
        'source.tokens.json': {
          aUntyped: { $value: 'plain' },
          zScale: {
            $type: 'number',
            invalid: { $value: 'not a number' },
          },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    let failure: unknown
    try {
      resolveContext(invalidSource, {})
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      name: 'TokenSourceCheckError',
      diagnostics: [
        expect.objectContaining({
          code: 'dtcg.invalid-document',
          path: ['zScale', 'invalid', '$value'],
        }),
      ],
    })
    expect((failure as Error).message).toMatch(
      /Token source check failed.*dtcg\.invalid-document.*zScale\.invalid/s
    )
  })

  it('keeps graph validation for an untyped literal value', () => {
    const invalidSource: TokenSource = {
      files: {
        'source.tokens.json': {
          invalid: {
            $value: {
              colorSpace: 'srgb',
              components: [0, '{duration.fast}', 0],
            },
          },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    expect(() => resolveContext(invalidSource, {})).toThrow(
      /Token source check failed.*nested brace reference/s
    )
  })

  it('bounds Resolver work before building an MCP result', () => {
    const repeated = { $ref: 'empty.tokens.json' } as const
    const largeSource: TokenSource = {
      files: { 'empty.tokens.json': {} },
      resolver: {
        version: '2025.10',
        sets: {
          repeated: { sources: Array(200_000).fill(repeated) },
        },
        resolutionOrder: [{ $ref: '#/sets/repeated' }],
      },
      origin: 'test',
    }

    expect(() => resolveContext(largeSource, {})).toThrow(
      'Resolver application exceeds the 1,000,000-unit work limit.'
    )
  })

  it('does not scan a large untyped array before the graph work limit', () => {
    let itemReads = 0
    const family = new Proxy(Array(100_001).fill('Inter'), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          itemReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const largeSource: TokenSource = {
      files: {
        'source.tokens.json': {
          family: { $value: family },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    expect(() => resolveContext(largeSource, {})).toThrow(
      /Token source check failed.*100,000-unit work limit/s
    )
    expect(itemReads).toBe(1)
  })

  it(
    'does not revisit an untouched subtree before the graph work limit',
    { timeout: 10_000 },
    () => {
      const document: TokenSource['files'][string] = {}
      for (let index = 0; index < 100_001; index += 1) {
        document[`n${index.toString(36)}`] = {
          $type: 'number',
          $value: index,
        }
      }
      document.untyped = { $value: 'plain' }
      document.untouched = {
        nested: { $type: 'string', $value: 'preserved' },
      }
      const largeSource: TokenSource = {
        files: { 'source.tokens.json': document },
        resolver: {
          version: '2025.10',
          sets: {
            source: { sources: [{ $ref: 'source.tokens.json' }] },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        },
        origin: 'test',
      }

      validationPreparationProbe.untouchedOwnKeys = 0
      validationPreparationProbe.enabled = true
      try {
        expect(() => resolveContext(largeSource, {})).toThrow(
          /Token source check failed.*100,000-unit work limit/s
        )
      } finally {
        validationPreparationProbe.enabled = false
      }
      expect(validationPreparationProbe.untouchedOwnKeys).toBe(2)
    }
  )

  it('does not copy untyped token properties before graph validation', () => {
    const token: Record<string, unknown> = { $value: 'plain' }
    for (let index = 0; index < 100_001; index += 1) {
      token[`$extra${index.toString(36)}`] = index
    }
    const largeSource: TokenSource = {
      files: {
        'source.tokens.json': { untyped: token },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    validationPreparationProbe.tokenExtraReads = 0
    validationPreparationProbe.tokenEnabled = true
    try {
      expect(() => resolveContext(largeSource, {})).toThrow(
        /Token source check failed.*unknown reserved property/s
      )
    } finally {
      validationPreparationProbe.tokenEnabled = false
    }
    expect(validationPreparationProbe.tokenExtraReads).toBe(0)
  })

  it('does not normalize a non-plain untyped token for graph validation', () => {
    const token = Object.assign(Object.create({ inherited: true }), {
      $value: 'plain',
    }) as Record<string, unknown>
    const invalidSource: TokenSource = {
      files: {
        'source.tokens.json': { untyped: token },
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      origin: 'test',
    }

    expect(() => resolveContext(invalidSource, {})).toThrow(
      /Token source check failed.*group or token/s
    )
  })
})

describe('searchTokens', () => {
  it('matches paths and descriptions', () => {
    const byPath = searchTokens(source, 'bg')
    expect(byPath.results.map(r => r.path)).toContain('semantic.color.bg.brand')

    const byDescription = searchTokens(source, 'corner radius')
    expect(byDescription.results.map(r => r.path)).toContain(
      'primitives.radius.sm'
    )
  })

  it('filters by type', () => {
    const colors = searchTokens(source, 'color', 'color')
    expect(colors.results.every(r => r.type === 'color')).toBe(true)
    const dimensions = searchTokens(source, '', 'dimension')
    expect(dimensions.results.map(r => r.path)).toContain('primitives.space.2')
  })

  it('formats an alias-inferred named font weight as CSS', () => {
    expect(searchTokens(namedWeightSource, 'aliasWeight').results).toEqual([
      {
        path: 'aliasWeight',
        type: 'fontWeight',
        css: '600',
      },
    ])
  })

  it('searches a literal token without treating it as a typed token', () => {
    expect(searchTokens(untypedSource, 'untyped').results).toEqual([
      {
        path: 'untyped',
        css: 'plain',
        description: 'No declared type',
      },
    ])
    expect(searchTokens(untypedSource, '', 'string').results).toEqual([])
  })

  it('keeps an untyped alias chain out of type-filtered results', () => {
    expect(searchTokens(untypedKindsSource, 'alias').results).toEqual([
      { path: 'aliasBase', css: 'aliased' },
      { path: 'aliasMiddle', css: 'aliased' },
      { path: 'alias', css: 'aliased' },
    ])
    expect(searchTokens(untypedKindsSource, 'alias', 'string').results).toEqual(
      []
    )
  })
})

describe('untyped token validation', () => {
  it.each([
    ['listCollections', () => listCollections(malformedUntypedSource)],
    ['getToken', () => getToken(malformedUntypedSource, 'malformed')],
    ['resolveContext', () => resolveContext(malformedUntypedSource, {})],
    ['searchTokens', () => searchTokens(malformedUntypedSource, '')],
  ])('rejects a malformed structured value through %s', (_name, read) => {
    let failure: unknown
    try {
      read()
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      name: 'TokenSourceCheckError',
      diagnostics: [
        expect.objectContaining({
          code: 'dtcg.invalid-document',
          path: ['malformed', '$value', 'components'],
        }),
      ],
    })
  })

  it.each([
    ['listCollections', () => listCollections(sharedOccurrenceSource)],
    ['getToken', () => getToken(sharedOccurrenceSource, 'untyped')],
    ['resolveContext', () => resolveContext(sharedOccurrenceSource, {})],
    ['searchTokens', () => searchTokens(sharedOccurrenceSource, '')],
  ])('rejects an invalid shared token occurrence through %s', (_name, read) => {
    let failure: unknown
    try {
      read()
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      name: 'TokenSourceCheckError',
      diagnostics: [
        expect.objectContaining({
          code: 'dtcg.invalid-document',
          path: ['typed', 'bad', '$value'],
        }),
      ],
    })
  })
})

describe('diffTokens', () => {
  it('produces the markdown changelog', () => {
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:2:201'].name = 'color/bg/primary'
    const markdown = diffTokens(fixture, next)
    expect(markdown).toContain('**The diff contains breaking changes.**')
    expect(markdown).toContain('`color/bg/brand` -> `color/bg/primary`')
  })
})
