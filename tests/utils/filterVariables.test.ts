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
    expect(result.every((v) => v.resolvedType === 'COLOR')).toBe(true)
  })

  it('should filter by name substring', () => {
    const result = filterVariables(mockVariables, { name: 'Color' })
    expect(result).toHaveLength(2)
    expect(result.every((v) => v.name.includes('Color'))).toBe(true)
  })

  it('should filter by both resolvedType and name', () => {
    const result = filterVariables(mockVariables, {
      resolvedType: 'COLOR',
      name: 'Primary',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Primary Color')
    expect(result[0].resolvedType).toBe('COLOR')
  })

  it('should return empty array when no matches found', () => {
    const result = filterVariables(mockVariables, { name: 'NonExistent' })
    expect(result).toHaveLength(0)
  })
})
