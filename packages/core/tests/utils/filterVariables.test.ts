import { describe, it, expect } from 'vitest'
import { filterVariables } from '../../src/utils/filterVariables'
import type { FigmaVariable } from '../../src/types/figma'

const mockVariables: FigmaVariable[] = [
  {
    id: 'var1',
    name: 'Primary Color',
    resolvedType: 'COLOR',
    valuesByMode: {},
    variableCollectionId: 'collection1',
    description: '',
    hiddenFromPublishing: false,
    scopes: ['ALL_FILLS'],
    codeSyntax: {},
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'var2',
    name: 'Font Size Large',
    resolvedType: 'FLOAT',
    valuesByMode: {},
    variableCollectionId: 'collection1',
    description: '',
    hiddenFromPublishing: false,
    scopes: ['FONT_SIZE'],
    codeSyntax: {},
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'var3',
    name: 'Secondary Color',
    resolvedType: 'COLOR',
    valuesByMode: {},
    variableCollectionId: 'collection1',
    description: '',
    hiddenFromPublishing: false,
    scopes: ['ALL_FILLS'],
    codeSyntax: {},
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

describe('filterVariables', () => {
  it('should return all variables when no criteria provided', () => {
    const result = filterVariables(mockVariables, {})
    expect(result).toHaveLength(3)
    expect(result).toEqual(mockVariables)
  })

  it('should filter by resolvedType', () => {
    const result = filterVariables(mockVariables, { resolvedType: 'COLOR' })
    expect(result).toHaveLength(2)
    expect(result.every(v => v.resolvedType === 'COLOR')).toBe(true)
  })

  it('should filter by name substring', () => {
    const result = filterVariables(mockVariables, { name: 'Color' })
    expect(result).toHaveLength(2)
    expect(result.every(v => v.name.includes('Color'))).toBe(true)
  })

  it('should filter by both resolvedType and name', () => {
    const result = filterVariables(mockVariables, {
      resolvedType: 'COLOR',
      name: 'Primary',
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Primary Color')
    expect(result[0]!.resolvedType).toBe('COLOR')
  })

  it('should return empty array when no matches found', () => {
    const result = filterVariables(mockVariables, { name: 'NonExistent' })
    expect(result).toHaveLength(0)
  })

  describe('caseInsensitive option', () => {
    it('should match case-insensitively when caseInsensitive is true', () => {
      const result = filterVariables(mockVariables, {
        name: 'color',
        caseInsensitive: true,
      })
      expect(result).toHaveLength(2)
      expect(result.map(v => v.name)).toEqual([
        'Primary Color',
        'Secondary Color',
      ])
    })

    it('should match uppercase search against lowercase names', () => {
      const result = filterVariables(mockVariables, {
        name: 'COLOR',
        caseInsensitive: true,
      })
      expect(result).toHaveLength(2)
    })

    it('should match mixed case search', () => {
      const result = filterVariables(mockVariables, {
        name: 'CoLoR',
        caseInsensitive: true,
      })
      expect(result).toHaveLength(2)
    })

    it('should be case-sensitive by default', () => {
      const result = filterVariables(mockVariables, { name: 'color' })
      expect(result).toHaveLength(0) // No match because 'Color' !== 'color'
    })

    it('should be case-sensitive when caseInsensitive is false', () => {
      const result = filterVariables(mockVariables, {
        name: 'color',
        caseInsensitive: false,
      })
      expect(result).toHaveLength(0)
    })

    it('should combine caseInsensitive with resolvedType filter', () => {
      const result = filterVariables(mockVariables, {
        resolvedType: 'COLOR',
        name: 'primary',
        caseInsensitive: true,
      })
      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('Primary Color')
    })
  })
})
