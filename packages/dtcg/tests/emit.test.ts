import { afterEach, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRIMITREE_EXTENSION_KEY, toDTCG } from '../src/index'
import {
  isToken,
  type DTCGGroup,
  type DTCGToken,
  type FigmaMetadataExtension,
} from '../src/index'
import {
  applyResolver,
  flattenTokens,
  resolveTokenValues,
} from '../src/resolve'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)

const duplicateNamesFixture = {
  meta: {
    variableCollections: {
      'collection-a': {
        id: 'collection-a',
        name: 'Theme',
        modes: [
          { modeId: 'a-default', name: 'Default' },
          { modeId: 'a-dark-1', name: 'Dark' },
          { modeId: 'a-dark-2', name: 'Dark' },
        ],
        defaultModeId: 'a-default',
        variableIds: ['variable-a'],
      },
      'collection-b': {
        id: 'collection-b',
        name: 'Theme',
        modes: [{ modeId: 'b-default', name: 'Default' }],
        defaultModeId: 'b-default',
        variableIds: ['variable-b'],
      },
    },
    variables: {
      'variable-a': {
        id: 'variable-a',
        name: 'collection-a-only',
        variableCollectionId: 'collection-a',
        resolvedType: 'STRING',
        valuesByMode: {
          'a-default': 'base-a',
          'a-dark-1': 'dark-a-1',
          'a-dark-2': 'dark-a-2',
        },
      },
      'variable-b': {
        id: 'variable-b',
        name: 'collection-b-only',
        variableCollectionId: 'collection-b',
        resolvedType: 'STRING',
        valuesByMode: { 'b-default': 'base-b' },
      },
    },
  },
}

afterEach(() => {
  Reflect.deleteProperty(Object.prototype, 'polluted')
  Reflect.deleteProperty(Object, 'value')
})

function rootCollisionFixture(order: Array<'short' | 'long'>) {
  const variables = {
    short: {
      id: 'short',
      name: 'color/blue',
      collectionId: 'primitives',
      type: 'COLOR',
      valuesByMode: {
        'primitives-default': { r: 0, g: 0, b: 1, a: 1 },
      },
    },
    long: {
      id: 'long',
      name: 'color/blue/500',
      collectionId: 'primitives',
      type: 'COLOR',
      valuesByMode: {
        'primitives-default': { r: 0.2, g: 0.4, b: 1, a: 1 },
      },
    },
  }

  return {
    collections: [
      {
        id: 'primitives',
        name: 'Primitives',
        modes: [{ modeId: 'primitives-default', name: 'Default' }],
        defaultModeId: 'primitives-default',
      },
      {
        id: 'semantic',
        name: 'Semantic',
        modes: [{ modeId: 'semantic-default', name: 'Default' }],
        defaultModeId: 'semantic-default',
      },
    ],
    variables: [
      ...order.map(key => variables[key]),
      {
        id: 'alias',
        name: 'alias',
        collectionId: 'semantic',
        type: 'COLOR',
        valuesByMode: {
          'semantic-default': { type: 'VARIABLE_ALIAS', id: 'short' },
        },
      },
    ],
  }
}

const hostileFixture = {
  collections: [
    {
      id: '__proto__',
      name: 'Theme',
      modes: [
        { modeId: 'default', name: 'Default' },
        { modeId: 'dark', name: 'Dark' },
      ],
      defaultModeId: 'default',
      variableIds: ['__proto__', 'constructor', 'prototype'],
    },
  ],
  variables: [
    {
      id: '__proto__',
      name: '__proto__/polluted',
      collectionId: '__proto__',
      type: 'STRING',
      valuesByMode: { default: 'safe', dark: 'safe-dark' },
    },
    {
      id: 'constructor',
      name: 'constructor/value',
      collectionId: '__proto__',
      type: 'STRING',
      valuesByMode: { default: 'constructor-safe' },
    },
    {
      id: 'prototype',
      name: 'prototype/value',
      collectionId: '__proto__',
      type: 'STRING',
      valuesByMode: { default: 'prototype-safe' },
    },
  ],
}

function tokenAt(group: DTCGGroup, path: string): DTCGToken {
  let node: unknown = group
  for (const segment of path.split('.')) {
    node = (node as DTCGGroup)[segment]
  }
  return node as DTCGToken
}

function expectNullPrototypeGroups(group: DTCGGroup): void {
  expect(Object.getPrototypeOf(group)).toBeNull()
  for (const value of Object.values(group)) {
    if (!isToken(value)) {
      expectNullPrototypeGroups(value)
    }
  }
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
    const ext = rounded.$extensions?.[
      PRIMITREE_EXTENSION_KEY
    ] as FigmaMetadataExtension
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

  it('records Figma metadata under the Primitree extension key', () => {
    const semantic = result.files['semantic.tokens.json'] as DTCGGroup
    const brand = tokenAt(semantic, 'semantic.color.bg.brand')
    const ext = brand.$extensions?.[
      PRIMITREE_EXTENSION_KEY
    ] as FigmaMetadataExtension
    expect(brand.$extensions).toMatchObject({
      'com.primitree': { variableId: 'VariableID:2:201' },
    })
    expect(Object.keys(brand.$extensions ?? {})).toEqual([
      PRIMITREE_EXTENSION_KEY,
    ])
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

  it('preserves duplicate collection and mode names by identity', () => {
    const output = toDTCG(duplicateNamesFixture, {
      includeFigmaExtensions: false,
    })

    expect(output.files['theme.tokens.json']).toEqual({
      theme: {
        'collection-a-only': { $type: 'string', $value: 'base-a' },
      },
    })
    expect(output.files['theme-2.tokens.json']).toEqual({
      'theme-2': {
        'collection-b-only': { $type: 'string', $value: 'base-b' },
      },
    })
    expect(output.resolver.sets).toEqual({
      theme: { sources: [{ $ref: './theme.tokens.json' }] },
      'theme-2': { sources: [{ $ref: './theme-2.tokens.json' }] },
    })

    expect(output.files['theme.dark.tokens.json']).toEqual({
      theme: {
        'collection-a-only': { $type: 'string', $value: 'dark-a-1' },
      },
    })
    expect(output.files['theme.dark-2.tokens.json']).toEqual({
      theme: {
        'collection-a-only': { $type: 'string', $value: 'dark-a-2' },
      },
    })
    expect(output.resolver.modifiers?.theme).toEqual({
      description: 'Figma modes for the "Theme" collection',
      default: 'default',
      contexts: {
        default: [],
        dark: [{ $ref: './theme.dark.tokens.json' }],
        'dark-2': [{ $ref: './theme.dark-2.tokens.json' }],
      },
    })
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

  it.each([
    ['shorter token first', ['short', 'long'] as Array<'short' | 'long'>],
    ['longer token first', ['long', 'short'] as Array<'short' | 'long'>],
  ])('moves a strict-prefix token to $root with %s', (_, order) => {
    const output = toDTCG(rootCollisionFixture(order), {
      includeFigmaExtensions: false,
    })
    const primitives = output.files['primitives.tokens.json'] as DTCGGroup
    const semantic = output.files['semantic.tokens.json'] as DTCGGroup
    const document = applyResolver(output.files, output.resolver)

    expect(tokenAt(primitives, 'primitives.color.blue.$root').$type).toBe(
      'color'
    )
    expect(tokenAt(primitives, 'primitives.color.blue.500').$type).toBe('color')
    expect(tokenAt(semantic, 'semantic.alias').$value).toBe(
      '{primitives.color.blue.$root}'
    )
    expect(
      resolveTokenValues(flattenTokens(document)).get('semantic.alias')
    ).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 1],
      alpha: 1,
      hex: '#0000ff',
    })
    expect(output.warnings).toEqual([
      'Token path "primitives.color.blue" is a group. Primitree moved the token to "$root".',
    ])
  })

  it('emits hostile names as safe own properties in null-prototype dictionaries', () => {
    const output = toDTCG(hostileFixture, {
      includeFigmaExtensions: false,
    })
    const document = output.files['theme.tokens.json'] as DTCGGroup
    const modeDocument = output.files['theme.dark.tokens.json'] as DTCGGroup

    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(Object.getPrototypeOf(output.files)).toBeNull()
    expectNullPrototypeGroups(document)
    expectNullPrototypeGroups(modeDocument)
    expect(tokenAt(document, 'theme.___proto___.polluted').$value).toBe('safe')
    expect(tokenAt(document, 'theme._constructor_.value').$value).toBe(
      'constructor-safe'
    )
    expect(tokenAt(document, 'theme._prototype_.value').$value).toBe(
      'prototype-safe'
    )
    expect(Object.getPrototypeOf(output.resolver.sets)).toBeNull()
    expect(Object.getPrototypeOf(output.resolver.modifiers)).toBeNull()
    expect(
      Object.getPrototypeOf(output.resolver.modifiers?.theme?.contexts)
    ).toBeNull()
  })
})
