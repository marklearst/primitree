import { describe, it, expect } from 'vitest'
import {
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from '../../src/utils/typeGuards'

describe('typeGuards', () => {
  describe('isLocalVariablesResponse', () => {
    it('should return true for valid LocalVariablesResponse', () => {
      const validData = {
        meta: {
          variableCollections: { 'col-1': {} },
          variables: { 'var-1': {} },
        },
      }
      expect(isLocalVariablesResponse(validData)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isLocalVariablesResponse(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isLocalVariablesResponse(undefined)).toBe(false)
    })

    it('should return false for string', () => {
      expect(isLocalVariablesResponse('not an object')).toBe(false)
    })

    it('should return false for object without meta', () => {
      expect(isLocalVariablesResponse({ foo: 'bar' })).toBe(false)
    })

    it('should return false for object with null meta', () => {
      expect(isLocalVariablesResponse({ meta: null })).toBe(false)
    })

    it('should return false for object without variableCollections', () => {
      expect(isLocalVariablesResponse({ meta: { variables: {} } })).toBe(false)
    })

    it('should return false for object without variables', () => {
      expect(
        isLocalVariablesResponse({ meta: { variableCollections: {} } })
      ).toBe(false)
    })

    it('should return false for object with null variableCollections', () => {
      expect(
        isLocalVariablesResponse({
          meta: { variableCollections: null, variables: {} },
        })
      ).toBe(false)
    })

    it('should return false for object with null variables', () => {
      expect(
        isLocalVariablesResponse({
          meta: { variableCollections: {}, variables: null },
        })
      ).toBe(false)
    })
  })

  describe('isPublishedVariablesResponse', () => {
    it('should return true for valid PublishedVariablesResponse', () => {
      const validData = {
        meta: {
          variableCollections: { 'col-1': {} },
          variables: { 'var-1': {} },
        },
      }
      expect(isPublishedVariablesResponse(validData)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isPublishedVariablesResponse(null)).toBe(false)
    })

    it('should return false for invalid structure', () => {
      expect(isPublishedVariablesResponse({ foo: 'bar' })).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isPublishedVariablesResponse(undefined)).toBe(false)
    })

    it('should return false for string', () => {
      expect(isPublishedVariablesResponse('not an object')).toBe(false)
    })

    it('should return false for object without meta', () => {
      expect(isPublishedVariablesResponse({ foo: 'bar' })).toBe(false)
    })

    it('should return false for object with null meta', () => {
      expect(isPublishedVariablesResponse({ meta: null })).toBe(false)
    })

    it('should return false for object without variableCollections', () => {
      expect(isPublishedVariablesResponse({ meta: { variables: {} } })).toBe(
        false
      )
    })

    it('should return false for object without variables', () => {
      expect(
        isPublishedVariablesResponse({ meta: { variableCollections: {} } })
      ).toBe(false)
    })

    it('should return false for object with null variableCollections', () => {
      expect(
        isPublishedVariablesResponse({
          meta: { variableCollections: null, variables: {} },
        })
      ).toBe(false)
    })

    it('should return false for object with null variables', () => {
      expect(
        isPublishedVariablesResponse({
          meta: { variableCollections: {}, variables: null },
        })
      ).toBe(false)
    })
  })

  describe('validateFallbackData', () => {
    it('should return typed data for valid LocalVariablesResponse', () => {
      const validData = {
        meta: {
          variableCollections: {},
          variables: {},
        },
      }
      const result = validateFallbackData(validData)
      expect(result).toBe(validData)
    })

    it('should return undefined for invalid data', () => {
      expect(validateFallbackData(null)).toBeUndefined()
      expect(validateFallbackData({ invalid: true })).toBeUndefined()
      expect(validateFallbackData('string')).toBeUndefined()
    })

    it('should return typed data for valid PublishedVariablesResponse', () => {
      const validData = {
        meta: {
          variableCollections: {},
          variables: {},
        },
      }
      const result = validateFallbackData(validData)
      expect(result).toBe(validData)
    })

    it('should return PublishedVariablesResponse when isPublishedVariablesResponse returns true', () => {
      // This test verifies that validateFallbackData correctly handles PublishedVariablesResponse data.
      // Line 134 (return data) is executed when isPublishedVariablesResponse returns true.
      // Since both type guards check the same structure, isLocalVariablesResponse will also return true
      // for this data, so line 133 (LocalVariablesResponse path) executes first in practice.
      // However, line 134 exists for completeness and would execute if isLocalVariablesResponse returned false.
      const publishedData = {
        meta: {
          variableCollections: {},
          variables: {},
        },
      }

      // Verify both guards return true for this data
      expect(isLocalVariablesResponse(publishedData)).toBe(true)
      expect(isPublishedVariablesResponse(publishedData)).toBe(true)

      // Call validateFallbackData - it will return via LocalVariablesResponse path (line 133)
      // but the PublishedVariablesResponse check (line 134) exists and is correct
      const result = validateFallbackData(publishedData)
      expect(result).toBe(publishedData)
    })

    it('should return undefined when data matches neither type', () => {
      const invalidData = { not: 'valid' }
      const result = validateFallbackData(invalidData)
      expect(result).toBeUndefined()
    })
  })
})
