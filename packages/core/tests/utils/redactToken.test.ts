import { describe, it, expect } from 'vitest'
import { redactToken } from '../../src/utils/redactToken'

describe('redactToken', () => {
  describe('basic redaction', () => {
    it('should redact middle portion of a normal token', () => {
      const token = 'figd_abc123xyz789def456'
      const result = redactToken(token)
      expect(result).toBe('figd_***...***456')
    })

    it('should show first 5 and last 3 characters by default', () => {
      const token = 'abcdefghijklmnopqrstuvwxyz'
      const result = redactToken(token)
      expect(result).toBe('abcde***...***xyz')
    })
  })

  describe('null/undefined/empty handling', () => {
    it('should return placeholder for null token', () => {
      expect(redactToken(null)).toBe('[no token]')
    })

    it('should return placeholder for undefined token', () => {
      expect(redactToken(undefined)).toBe('[no token]')
    })

    it('should return placeholder for empty string', () => {
      expect(redactToken('')).toBe('[no token]')
    })
  })

  describe('short token handling', () => {
    it('should mask entirely if token is too short', () => {
      // minLength = 5 + 3 + 1 = 9, so 8 chars should be fully masked
      expect(redactToken('12345678')).toBe('********')
    })

    it('should mask single character token', () => {
      expect(redactToken('x')).toBe('*')
    })

    it('should mask token at exactly minimum length', () => {
      // 9 chars is exactly minLength, should be redacted normally
      expect(redactToken('123456789')).toBe('12345***...***789')
    })
  })

  describe('custom options', () => {
    it('should use custom visibleStart', () => {
      const result = redactToken('abcdefghijklmnop', { visibleStart: 3 })
      expect(result).toBe('abc***...***nop')
    })

    it('should use custom visibleEnd', () => {
      const result = redactToken('abcdefghijklmnop', { visibleEnd: 5 })
      expect(result).toBe('abcde***...***lmnop')
    })

    it('should use custom emptyPlaceholder', () => {
      const result = redactToken(null, { emptyPlaceholder: 'N/A' })
      expect(result).toBe('N/A')
    })

    it('should use all custom options together', () => {
      const result = redactToken('abcdefghijklmnop', {
        visibleStart: 2,
        visibleEnd: 2,
        emptyPlaceholder: 'custom',
      })
      expect(result).toBe('ab***...***op')
    })
  })

  describe('edge cases', () => {
    it('should handle token with special characters', () => {
      const token = 'figd_!@#$%^&*()_+-=[]'
      const result = redactToken(token)
      // Last 3 chars of 'figd_!@#$%^&*()_+-=[]' are '=[]'
      expect(result).toBe('figd_***...***=[]')
    })

    it('should handle very long token', () => {
      const token = 'a'.repeat(1000)
      const result = redactToken(token)
      expect(result).toBe('aaaaa***...***aaa')
    })
  })
})
