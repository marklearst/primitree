import { describe, expect, it } from 'vitest'
import { allocateUniqueSlugs } from '../src/naming'
import { emitTailwind } from '../src/pipeline/tailwind'
import { emitTypescript } from '../src/pipeline/typescript'
import {
  applyResolverWithBudget,
  type ResolverWorkBudget,
} from '../src/resolve'
import type { DTCGDocument, ResolverDocument } from '../src/types'

const TYPESCRIPT_WORK_LIMIT_MESSAGE =
  'TypeScript output exceeds the 1,000,000-unit work limit.'

function repeatedSourceFixture(sourceCount: number): {
  files: Record<string, DTCGDocument>
  resolver: ResolverDocument
} {
  const shared = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [
      `value-${index}`,
      { $type: 'number' as const, $value: index },
    ])
  )

  return {
    files: { 'shared.tokens.json': { shared } },
    resolver: {
      version: '2025.10',
      sets: {
        repeated: {
          sources: Array.from({ length: sourceCount }, () => ({
            $ref: 'shared.tokens.json',
          })),
        },
      },
      resolutionOrder: [{ $ref: '#/sets/repeated' }],
    },
  }
}

describe('emitTypescript work bounds', () => {
  it('resolves 200,000 empty sources within the work budget', () => {
    const reference = { $ref: 'empty.tokens.json' } as const
    const resolver = {
      version: '2025.10',
      sets: {
        repeated: {
          sources: Array(200_000).fill(reference),
        },
      },
      resolutionOrder: [{ $ref: '#/sets/repeated' }],
    } satisfies ResolverDocument

    let output: string | undefined
    let failure: unknown
    try {
      output = emitTypescript({ 'empty.tokens.json': {} }, resolver)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeUndefined()
    expect(output).toContain('export type TokenPath = never')
  })

  it('rejects more than 64 token-group levels', () => {
    let nested: DTCGDocument = {
      value: { $type: 'number', $value: 1 },
    }
    for (let depth = 0; depth <= 64; depth += 1) {
      nested = { group: nested }
    }

    expect(() =>
      emitTypescript(
        {},
        {
          version: '2025.10',
          sets: { source: { sources: [nested] } },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    ).toThrow('TypeScript output can read at most 64 token-group levels.')
  })

  it('rejects Resolver work that exceeds the TypeScript call budget', () => {
    const { files, resolver } = repeatedSourceFixture(4_000)

    expect(() => emitTypescript(files, resolver)).toThrow(
      TYPESCRIPT_WORK_LIMIT_MESSAGE
    )
  })

  it('counts flattening and reference resolution in the Resolver budget', () => {
    const { files, resolver } = repeatedSourceFixture(3_259)
    const resolverOnlyBudget: ResolverWorkBudget = {
      remaining: 1_000_000,
      errorMessage: TYPESCRIPT_WORK_LIMIT_MESSAGE,
    }

    expect(() =>
      applyResolverWithBudget(files, resolver, {}, resolverOnlyBudget)
    ).not.toThrow()
    expect(resolverOnlyBudget.remaining).toBeGreaterThan(0)
    expect(() => emitTypescript(files, resolver)).toThrow(
      TYPESCRIPT_WORK_LIMIT_MESSAGE
    )
  })

  it('counts serialized token text in the TypeScript work budget', () => {
    expect(() =>
      emitTypescript(
        {},
        {
          version: '2025.10',
          sets: {
            source: {
              sources: [
                {
                  value: {
                    $type: 'string',
                    $value: 'x'.repeat(1_000_000),
                  },
                },
              ],
            },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    ).toThrow(TYPESCRIPT_WORK_LIMIT_MESSAGE)
  })

  it('counts reference text during TypeScript reference resolution', () => {
    const target = 'missing.'.repeat(125_000)

    expect(() =>
      emitTypescript(
        {},
        {
          version: '2025.10',
          sets: {
            source: {
              sources: [
                {
                  alias: {
                    $type: 'string',
                    $value: `{${target}}`,
                  },
                },
              ],
            },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    ).toThrow(TYPESCRIPT_WORK_LIMIT_MESSAGE)
  })

  it('caps generated TypeScript output at 20 MiB of UTF-8', () => {
    const value = '界'.repeat(50_000)
    const aliases = Object.fromEntries(
      Array.from({ length: 140 }, (_, index) => [
        `alias-${index}`,
        { $type: 'string' as const, $value: '{tokens.base}' },
      ])
    )

    expect(() =>
      emitTypescript(
        {},
        {
          version: '2025.10',
          sets: {
            source: {
              sources: [
                {
                  tokens: {
                    base: { $type: 'string', $value: value },
                    ...aliases,
                  },
                },
              ],
            },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    ).toThrow('TypeScript output can contain at most 20 MiB.')
  })
})

function tailwindCollisionTree(depth: number): DTCGDocument {
  if (depth === 0) {
    return {
      brand: { $type: 'color', $value: '#3366ff' },
    }
  }
  return {
    color: tailwindCollisionTree(depth - 1),
    colors: tailwindCollisionTree(depth - 1),
  }
}

describe('emitTailwind collision bounds', () => {
  it('allocates collision suffixes with linear membership work', () => {
    const NativeSet = globalThis.Set
    let membershipReads = 0
    class BoundedSet<T> extends NativeSet<T> {
      public override has(value: T): boolean {
        membershipReads += 1
        if (membershipReads > 1_000) {
          throw new Error('Tailwind collision allocation exceeded linear work')
        }
        return super.has(value)
      }
    }

    let output: string | undefined
    let failure: unknown
    Reflect.set(globalThis, 'Set', BoundedSet)
    try {
      output = emitTailwind(
        {},
        {
          version: '2025.10',
          sets: {
            source: {
              sources: [
                {
                  'brand palette': tailwindCollisionTree(7),
                },
              ],
            },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    } catch (error) {
      failure = error
    } finally {
      Reflect.set(globalThis, 'Set', NativeSet)
    }

    expect(failure).toBeUndefined()
    expect(output).toContain('--color-brand_20_palette-brand-127:')
  })
})

describe('emitTailwind text bounds', () => {
  it('counts token path text in the shared work budget', () => {
    const tokenName = 'x'.repeat(1_000_001)

    expect(() =>
      emitTailwind(
        {},
        {
          version: '2025.10',
          sets: {
            source: {
              sources: [
                {
                  palette: {
                    [tokenName]: { $type: 'color', $value: '#ffffff' },
                  },
                },
              ],
            },
          },
          resolutionOrder: [{ $ref: '#/sets/source' }],
        }
      )
    ).toThrow('Tailwind output exceeds the 1,000,000-unit work limit.')
  })
})

describe('allocateUniqueSlugs collision bounds', () => {
  it('allocates duplicate suffixes with linear membership work', () => {
    const NativeSet = globalThis.Set
    let membershipReads = 0
    class BoundedSet<T> extends NativeSet<T> {
      public override has(value: T): boolean {
        membershipReads += 1
        if (membershipReads > 1_000) {
          throw new Error('Slug collision allocation exceeded linear work')
        }
        return super.has(value)
      }
    }

    let slugs: string[] | undefined
    let failure: unknown
    Reflect.set(globalThis, 'Set', BoundedSet)
    try {
      slugs = allocateUniqueSlugs(
        Array.from({ length: 128 }, () => 'Theme'),
        name => name
      )
    } catch (error) {
      failure = error
    } finally {
      Reflect.set(globalThis, 'Set', NativeSet)
    }

    expect(failure).toBeUndefined()
    expect(slugs?.at(-1)).toBe('theme-128')
  })
})
