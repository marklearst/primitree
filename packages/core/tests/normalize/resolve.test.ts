import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeVariables } from '../../src/normalize/normalize'
import {
  resolveVariableValue,
  resolveAllVariableValues,
  isVariableAlias,
  AliasResolutionError,
} from '../../src/normalize/resolve'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/local-variables.json'), 'utf8')
)
const normalized = normalizeVariables(fixture)

describe('isVariableAlias', () => {
  it('detects alias objects', () => {
    expect(isVariableAlias({ type: 'VARIABLE_ALIAS', id: 'x' })).toBe(true)
    expect(isVariableAlias({ r: 0, g: 0, b: 0, a: 1 })).toBe(false)
    expect(isVariableAlias(4)).toBe(false)
    expect(isVariableAlias(null)).toBe(false)
  })
})

describe('resolveVariableValue', () => {
  it('returns concrete values directly', () => {
    const result = resolveVariableValue(normalized, 'VariableID:1:103', '1:0')
    expect(result.value).toBe(4)
    expect(result.resolvedType).toBe('FLOAT')
    expect(result.aliasChain).toEqual(['VariableID:1:103'])
  })

  it('follows a cross-collection alias per mode', () => {
    const light = resolveVariableValue(normalized, 'VariableID:2:201', '2:0')
    expect(light.value).toEqual({ r: 0.2, g: 0.4, b: 1, a: 1 })
    expect(light.aliasChain).toEqual(['VariableID:2:201', 'VariableID:1:101'])

    const dark = resolveVariableValue(normalized, 'VariableID:2:201', '2:1')
    expect(dark.value).toEqual({ r: 0.55, g: 0.7, b: 1, a: 1 })
    expect(dark.aliasChain).toEqual(['VariableID:2:201', 'VariableID:1:102'])
  })

  it('follows chained aliases across collections', () => {
    const dark = resolveVariableValue(normalized, 'VariableID:2:203', '2:1')
    expect(dark.value).toEqual({ r: 0.55, g: 0.7, b: 1, a: 1 })
    expect(dark.aliasChain).toEqual([
      'VariableID:2:203',
      'VariableID:2:201',
      'VariableID:1:102',
    ])
  })

  it('falls back to the collection default mode when a mode has no value', () => {
    // space/page only defines a value in Light (2:0); Dark falls back to it.
    const dark = resolveVariableValue(normalized, 'VariableID:2:204', '2:1')
    expect(dark.value).toBe(8)
  })

  it('uses the default mode when no mode is given', () => {
    const result = resolveVariableValue(normalized, 'VariableID:3:301')
    expect(result.value).toBe(40)
  })

  it('throws on alias cycles with the chain in the error', () => {
    const cyclic = structuredClone(fixture)
    cyclic.meta.variables['VariableID:1:101'].valuesByMode['1:0'] = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:2:201',
    }
    const n = normalizeVariables(cyclic)
    try {
      resolveVariableValue(n, 'VariableID:2:201', '2:0')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AliasResolutionError)
      expect((err as AliasResolutionError).code).toBe('CYCLE')
      expect((err as AliasResolutionError).chain.length).toBeGreaterThan(2)
    }
  })

  it('throws MISSING_TARGET for dangling aliases', () => {
    const dangling = structuredClone(fixture)
    dangling.meta.variables['VariableID:2:201'].valuesByMode['2:0'] = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:404:404',
    }
    const n = normalizeVariables(dangling)
    try {
      resolveVariableValue(n, 'VariableID:2:201', '2:0')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AliasResolutionError)
      expect((err as AliasResolutionError).code).toBe('MISSING_TARGET')
    }
  })

  it('throws MISSING_VALUE when a variable has no values at all', () => {
    const empty = structuredClone(fixture)
    empty.meta.variables['VariableID:1:103'].valuesByMode = {}
    const n = normalizeVariables(empty)
    try {
      resolveVariableValue(n, 'VariableID:1:103', '1:0')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AliasResolutionError)
      expect((err as AliasResolutionError).code).toBe('MISSING_VALUE')
    }
  })
})

describe('resolveAllVariableValues', () => {
  it('resolves every variable for every mode of its collection', () => {
    const { values, errors } = resolveAllVariableValues(normalized)
    expect(errors).toEqual([])

    expect(values['VariableID:2:201']?.['2:0']?.value).toEqual({
      r: 0.2,
      g: 0.4,
      b: 1,
      a: 1,
    })
    expect(values['VariableID:2:201']?.['2:1']?.value).toEqual({
      r: 0.55,
      g: 0.7,
      b: 1,
      a: 1,
    })
    expect(values['VariableID:3:301']?.['3:1']?.value).toBe(32)
    // Single-mode primitives resolve for their only mode.
    expect(values['VariableID:1:105']?.['1:0']?.value).toBe('Inter')
  })

  it('collects alias errors instead of throwing', () => {
    const dangling = structuredClone(fixture)
    dangling.meta.variables['VariableID:2:201'].valuesByMode['2:0'] = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:404:404',
    }
    const n = normalizeVariables(dangling)
    const { errors } = resolveAllVariableValues(n)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.code).toBe('MISSING_TARGET')
  })
})
