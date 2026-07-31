import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { toDTCG } from '@primitree/dtcg'
import { loadTokenSource, type TokenSource } from '../src/source'
import {
  diffTokens,
  getToken,
  listCollections,
  resolveContext,
  searchTokens,
} from '../src/tools'

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))

const built = toDTCG(fixture)
const source: TokenSource = {
  files: built.files,
  resolver: built.resolver,
  origin: 'test',
  variablesJson: fixture,
}

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
          scale: {
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
          path: ['scale', 'invalid', '$value'],
        }),
      ],
    })
    expect((failure as Error).message).toMatch(
      /Token source check failed.*dtcg\.invalid-document.*scale\.invalid/s
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

describe('loadTokenSource', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-mcp-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('loads a variables.json file', async () => {
    const loaded = await loadTokenSource(fixturePath)
    expect(Object.keys(loaded.files)).toContain('semantic.tokens.json')
    expect(loaded.variablesJson).toBeDefined()
  })

  it('loads a built tokens directory', async () => {
    const dir = path.join(tmpDir, 'tokens')
    await fs.mkdir(dir, { recursive: true })
    for (const [name, doc] of Object.entries(built.files)) {
      await fs.writeFile(path.join(dir, name), JSON.stringify(doc))
    }
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify(built.resolver)
    )

    const direct = await loadTokenSource(dir)
    expect(Object.keys(direct.files).length).toBe(5)

    // Parent directory with tokens/ subdirectory also works.
    const viaParent = await loadTokenSource(tmpDir)
    expect(Object.keys(viaParent.files).length).toBe(5)
  })

  it('fails clearly on unusable paths', async () => {
    await expect(loadTokenSource(path.join(tmpDir, 'missing'))).rejects.toThrow(
      /does not exist/
    )
    const emptyDir = path.join(tmpDir, 'empty')
    await fs.mkdir(emptyDir, { recursive: true })
    await expect(loadTokenSource(emptyDir)).rejects.toThrow(
      /contains no tokens\.resolver\.json/
    )
  })
})
