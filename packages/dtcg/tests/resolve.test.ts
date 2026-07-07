import { describe, it, expect } from 'vitest'
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
import type { DTCGColorValue, DTCGToken } from '../src/types'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)
const { files, resolver } = toDTCG(fixture)

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
})

describe('flattenTokens', () => {
  it('flattens nested groups to dot paths', () => {
    const flat = flattenTokens(files['primitives.tokens.json'] ?? {})
    const paths = flat.map(f => f.path)
    expect(paths).toContain('primitives.color.blue.500')
    expect(paths).toContain('primitives.radius.sm')
    expect(paths).toHaveLength(7)
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
})

describe('listContexts / listPermutations', () => {
  it('lists modifier axes and contexts', () => {
    expect(listContexts(resolver)).toEqual({
      semantic: ['light', 'dark'],
      density: ['comfortable', 'compact'],
    })
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
