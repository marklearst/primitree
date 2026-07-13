import { afterEach, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeVariables,
  toLocalVariablesResponse,
  VariablesParseError,
} from '../../src/normalize/normalize'

const fixturePath = join(__dirname, '../fixtures/local-variables.json')
const fixtureRaw = readFileSync(fixturePath, 'utf8')
const fixture = JSON.parse(fixtureRaw)

afterEach(() => {
  Reflect.deleteProperty(Object.prototype, 'polluted')
})

describe('normalizeVariables', () => {
  it('normalizes a full REST local variables response', () => {
    const result = normalizeVariables(fixture)

    expect(result.collections).toHaveLength(3)
    expect(result.variables).toHaveLength(12)
    expect(result.warnings).toEqual([])

    const primitives = result.collectionsById['VariableCollectionId:1:100']
    expect(primitives?.name).toBe('Primitives')
    expect(primitives?.modes).toEqual([{ id: '1:0', name: 'Value' }])
    expect(primitives?.defaultModeId).toBe('1:0')
    expect(primitives?.variableIds).toHaveLength(7)

    const brand = result.variablesById['VariableID:2:201']
    expect(brand?.name).toBe('color/bg/brand')
    expect(brand?.collectionId).toBe('VariableCollectionId:2:200')
    expect(brand?.resolvedType).toBe('COLOR')
  })

  it('accepts a raw JSON string', () => {
    const result = normalizeVariables(fixtureRaw)
    expect(result.variables).toHaveLength(12)
  })

  it('accepts a bare meta object', () => {
    const result = normalizeVariables(fixture.meta)
    expect(result.collections).toHaveLength(3)
  })

  it('accepts plugin-style exports with arrays and collections key', () => {
    const pluginShape = {
      collections: Object.values(fixture.meta.variableCollections),
      variables: Object.values(fixture.meta.variables),
    }
    const result = normalizeVariables(pluginShape)
    expect(result.collections).toHaveLength(3)
    expect(result.variables).toHaveLength(12)
  })

  it('accepts plugin-style variables using type/collectionId field names', () => {
    const pluginShape = {
      collections: [
        {
          id: 'c1',
          name: 'Tokens',
          modes: [{ modeId: 'm1', name: 'Default' }],
          defaultModeId: 'm1',
        },
      ],
      variables: [
        {
          id: 'v1',
          name: 'size/base',
          collectionId: 'c1',
          type: 'FLOAT',
          valuesByMode: { m1: 16 },
        },
      ],
    }
    const result = normalizeVariables(pluginShape)
    expect(result.variables[0]?.resolvedType).toBe('FLOAT')
    expect(result.variables[0]?.collectionId).toBe('c1')
    expect(result.collectionsById['c1']?.variableIds).toEqual(['v1'])
  })

  it('preserves hostile IDs as own entries in null-prototype ID maps', () => {
    const result = normalizeVariables({
      collections: [
        {
          id: '__proto__',
          name: 'Theme',
          modes: [{ modeId: 'default', name: 'Default' }],
          defaultModeId: 'default',
          variableIds: ['__proto__'],
        },
      ],
      variables: [
        {
          id: '__proto__',
          name: '__proto__/polluted',
          collectionId: '__proto__',
          type: 'STRING',
          valuesByMode: { default: 'safe' },
        },
      ],
    })

    expect(Object.getPrototypeOf(result.collectionsById)).toBeNull()
    expect(Object.getPrototypeOf(result.variablesById)).toBeNull()
    expect(Object.hasOwn(result.collectionsById, '__proto__')).toBe(true)
    expect(Object.hasOwn(result.variablesById, '__proto__')).toBe(true)
    expect(Reflect.get(result.collectionsById, '__proto__')).toMatchObject({
      id: '__proto__',
    })
    expect(Reflect.get(result.variablesById, '__proto__')).toMatchObject({
      id: '__proto__',
    })

    const local = toLocalVariablesResponse(result)
    expect(Object.getPrototypeOf(local.meta.variableCollections)).toBeNull()
    expect(Object.getPrototypeOf(local.meta.variables)).toBeNull()
    expect(Object.hasOwn(local.meta.variableCollections, '__proto__')).toBe(
      true
    )
    expect(Object.hasOwn(local.meta.variables, '__proto__')).toBe(true)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('copies only own valuesByMode and codeSyntax entries into null-prototype records', () => {
    const valuesByMode = Object.assign(
      Object.create({ default: 'inherited' }) as Record<string, unknown>,
      { alternate: 'safe' }
    )
    const codeSyntax = Object.assign(
      Object.create({ ANDROID: 'inherited' }) as Record<string, unknown>,
      { WEB: 'var(--safe)' }
    )
    const result = normalizeVariables({
      collections: [
        {
          id: 'collection',
          name: 'Theme',
          modes: [{ modeId: 'default', name: 'Default' }],
          defaultModeId: 'default',
        },
      ],
      variables: [
        {
          id: 'variable',
          name: 'safe',
          collectionId: 'collection',
          type: 'STRING',
          valuesByMode,
          codeSyntax,
        },
      ],
    })
    const variable = result.variablesById.variable

    expect(Object.getPrototypeOf(variable?.valuesByMode)).toBeNull()
    expect(variable?.valuesByMode).toEqual({ alternate: 'safe' })
    expect(variable?.valuesByMode.default).toBeUndefined()
    expect(Object.getPrototypeOf(variable?.codeSyntax)).toBeNull()
    expect(variable?.codeSyntax).toEqual({ WEB: 'var(--safe)' })
    expect(variable?.codeSyntax.ANDROID).toBeUndefined()

    const localVariable =
      toLocalVariablesResponse(result).meta.variables.variable
    expect(Object.getPrototypeOf(localVariable?.valuesByMode)).toBeNull()
    expect(localVariable?.valuesByMode).toEqual({ alternate: 'safe' })
    expect(localVariable?.valuesByMode.default).toBeUndefined()
    expect(Object.getPrototypeOf(localVariable?.codeSyntax)).toBeNull()
    expect(localVariable?.codeSyntax).toEqual({ WEB: 'var(--safe)' })
    expect(localVariable?.codeSyntax.ANDROID).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('drops variables whose collection is missing, with a warning', () => {
    const mutated = structuredClone(fixture)
    mutated.meta.variables['VariableID:9:999'] = {
      id: 'VariableID:9:999',
      name: 'orphan/token',
      variableCollectionId: 'VariableCollectionId:9:900',
      resolvedType: 'FLOAT',
      valuesByMode: { '9:0': 1 },
    }
    const result = normalizeVariables(mutated)
    expect(result.variablesById['VariableID:9:999']).toBeUndefined()
    expect(result.warnings.some(w => w.includes('orphan/token'))).toBe(true)
  })

  it('recomputes collection variableIds from surviving variables', () => {
    const mutated = structuredClone(fixture)
    mutated.meta.variableCollections['VariableCollectionId:1:100'].variableIds =
      ['VariableID:stale']
    const result = normalizeVariables(mutated)
    expect(
      result.collectionsById['VariableCollectionId:1:100']?.variableIds
    ).toContain('VariableID:1:101')
    expect(
      result.collectionsById['VariableCollectionId:1:100']?.variableIds
    ).not.toContain('VariableID:stale')
  })

  it('falls back to the first mode when defaultModeId is invalid', () => {
    const mutated = structuredClone(fixture)
    mutated.meta.variableCollections[
      'VariableCollectionId:2:200'
    ].defaultModeId = 'nope'
    const result = normalizeVariables(mutated)
    expect(
      result.collectionsById['VariableCollectionId:2:200']?.defaultModeId
    ).toBe('2:0')
  })

  it('throws a clear error for published variables responses', () => {
    const published = {
      meta: {
        variableCollections: {
          c: { id: 'c', name: 'Lib', key: 'k', updatedAt: '' },
        },
        variables: {
          v: {
            id: 'v',
            subscribed_id: 'sub',
            name: 'color/x',
            key: 'k',
            variableCollectionId: 'c',
            resolvedType: 'COLOR',
            updatedAt: '',
          },
        },
      },
    }
    expect(() => normalizeVariables(published)).toThrow(VariablesParseError)
    expect(() => normalizeVariables(published)).toThrow(/published/i)
  })

  it('throws on unrecognizable input', () => {
    expect(() => normalizeVariables(42)).toThrow(VariablesParseError)
    expect(() => normalizeVariables({})).toThrow(VariablesParseError)
    expect(() => normalizeVariables('not json {')).toThrow(VariablesParseError)
  })

  it('round-trips through toLocalVariablesResponse', () => {
    const normalized = normalizeVariables(fixture)
    const roundTripped = normalizeVariables(
      toLocalVariablesResponse(normalized)
    )
    expect(roundTripped.variables).toHaveLength(normalized.variables.length)
    expect(roundTripped.collections).toEqual(normalized.collections)
  })
})
