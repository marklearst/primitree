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
  })
})
