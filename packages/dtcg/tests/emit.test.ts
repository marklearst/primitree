import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toDTCG, FIGMA_EXTENSION_KEY } from '../src/emit'
import type { DTCGGroup, DTCGToken } from '../src/types'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)

function tokenAt(group: DTCGGroup, path: string): DTCGToken {
  let node: unknown = group
  for (const segment of path.split('.')) {
    node = (node as DTCGGroup)[segment]
  }
  return node as DTCGToken
}

describe('toDTCG', () => {
  const result = toDTCG(fixture, { resolverName: 'Acme Tokens' })

  it('emits one base file per collection and one file per extra mode', () => {
    expect(Object.keys(result.files).sort()).toEqual([
      'density.compact.tokens.json',
      'density.tokens.json',
      'primitives.tokens.json',
      'semantic.dark.tokens.json',
      'semantic.tokens.json',
    ])
    expect(result.warnings).toEqual([])
  })

  it('wraps tokens in a collection group and builds nested paths', () => {
    const primitives = result.files['primitives.tokens.json'] as DTCGGroup
    const blue = tokenAt(primitives, 'primitives.color.blue.500')
    expect(blue.$type).toBe('color')
    expect(blue.$value).toEqual({
      colorSpace: 'srgb',
      components: [0.2, 0.4, 1],
      alpha: 1,
      hex: '#3366ff',
    })
    expect(blue.$description).toBe('Primary blue')
  })

  it('applies FLOAT type heuristics from scopes', () => {
    const primitives = result.files['primitives.tokens.json'] as DTCGGroup
    expect(tokenAt(primitives, 'primitives.radius.sm')).toMatchObject({
      $type: 'dimension',
      $value: { value: 4, unit: 'px' },
    })
    expect(tokenAt(primitives, 'primitives.space.2')).toMatchObject({
      $type: 'dimension',
      $value: { value: 8, unit: 'px' },
    })
    expect(tokenAt(primitives, 'primitives.opacity.disabled')).toMatchObject({
      $type: 'number',
      $value: 0.4,
    })
  })

  it('maps STRING with FONT_FAMILY scope to fontFamily', () => {
    const primitives = result.files['primitives.tokens.json'] as DTCGGroup
    expect(tokenAt(primitives, 'primitives.font.family.sans')).toMatchObject({
      $type: 'fontFamily',
      $value: 'Inter',
    })
  })

  it('keeps booleans with the non-standard boolean type and records the Figma type', () => {
    const primitives = result.files['primitives.tokens.json'] as DTCGGroup
    const rounded = tokenAt(primitives, 'primitives.feature.rounded')
    expect(rounded.$type).toBe('boolean')
    expect(rounded.$value).toBe(true)
    const ext = rounded.$extensions?.[FIGMA_EXTENSION_KEY] as Record<
      string,
      unknown
    >
    expect(ext.resolvedType).toBe('BOOLEAN')
    expect(ext.hiddenFromPublishing).toBe(true)
  })

  it('preserves aliases as DTCG references with collection-prefixed paths', () => {
    const semantic = result.files['semantic.tokens.json'] as DTCGGroup
    expect(tokenAt(semantic, 'semantic.color.bg.brand').$value).toBe(
      '{primitives.color.blue.500}'
    )
    expect(tokenAt(semantic, 'semantic.color.bg.accent').$value).toBe(
      '{semantic.color.bg.brand}'
    )
    expect(tokenAt(semantic, 'semantic.space.page').$value).toBe(
      '{primitives.space.2}'
    )
  })

  it('emits mode override files containing only explicitly defined values', () => {
    const dark = result.files['semantic.dark.tokens.json'] as DTCGGroup
    expect(tokenAt(dark, 'semantic.color.bg.brand').$value).toBe(
      '{primitives.color.blue.300}'
    )
    // space/page has no Dark value, so it must not appear in the override.
    const semanticGroup = dark.semantic as DTCGGroup
    expect((semanticGroup as DTCGGroup).space).toBeUndefined()
  })

  it('records Figma metadata under $extensions', () => {
    const semantic = result.files['semantic.tokens.json'] as DTCGGroup
    const brand = tokenAt(semantic, 'semantic.color.bg.brand')
    const ext = brand.$extensions?.[FIGMA_EXTENSION_KEY] as Record<
      string,
      unknown
    >
    expect(ext.variableId).toBe('VariableID:2:201')
    expect(ext.collectionName).toBe('Semantic')
    expect(ext.scopes).toEqual(['FRAME_FILL', 'SHAPE_FILL'])
  })

  it('omits extensions when includeFigmaExtensions is false', () => {
    const bare = toDTCG(fixture, { includeFigmaExtensions: false })
    const semantic = bare.files['semantic.tokens.json'] as DTCGGroup
    expect(
      tokenAt(semantic, 'semantic.color.bg.brand').$extensions
    ).toBeUndefined()
  })

  it('builds a 2025.10 resolver with sets and per-collection modifiers', () => {
    const { resolver } = result
    expect(resolver.version).toBe('2025.10')
    expect(resolver.name).toBe('Acme Tokens')
    expect(Object.keys(resolver.sets ?? {})).toEqual([
      'primitives',
      'semantic',
      'density',
    ])
    expect(Object.keys(resolver.modifiers ?? {})).toEqual([
      'semantic',
      'density',
    ])

    const semantic = resolver.modifiers?.semantic
    expect(semantic?.default).toBe('light')
    expect(semantic?.contexts.light).toEqual([])
    expect(semantic?.contexts.dark).toEqual([
      { $ref: './semantic.dark.tokens.json' },
    ])

    expect(resolver.resolutionOrder).toEqual([
      { $ref: '#/sets/primitives' },
      { $ref: '#/sets/semantic' },
      { $ref: '#/sets/density' },
      { $ref: '#/modifiers/semantic' },
      { $ref: '#/modifiers/density' },
    ])
  })

  it('warns when a variable aliases a missing target', () => {
    const broken = structuredClone(fixture)
    broken.meta.variables['VariableID:2:201'].valuesByMode['2:0'] = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:404:404',
    }
    const output = toDTCG(broken)
    expect(output.warnings.some(w => w.includes('aliases missing'))).toBe(true)
  })

  it('moves colliding token/group names into a base token', () => {
    const colliding = structuredClone(fixture)
    colliding.meta.variables['VariableID:1:108'] = {
      id: 'VariableID:1:108',
      name: 'color/blue',
      variableCollectionId: 'VariableCollectionId:1:100',
      resolvedType: 'COLOR',
      valuesByMode: { '1:0': { r: 0, g: 0, b: 1, a: 1 } },
      description: '',
      hiddenFromPublishing: false,
      scopes: [],
      codeSyntax: {},
    }
    const output = toDTCG(colliding)
    const primitives = output.files['primitives.tokens.json'] as DTCGGroup
    const blueGroup = tokenAt(
      primitives,
      'primitives.color.blue'
    ) as unknown as DTCGGroup
    expect((blueGroup.base as DTCGToken).$type).toBe('color')
    expect((blueGroup['500'] as DTCGToken).$type).toBe('color')
    expect(
      output.warnings.some(w => w.includes('both a token and a group'))
    ).toBe(true)
  })
})
