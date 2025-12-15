import { describe, it, expect } from 'vitest'
import {
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
} from '../../src/utils/errorHelpers'
import { FigmaApiError } from '../../src/types/figma'

describe('errorHelpers', () => {
  describe('isFigmaApiError', () => {
    it('should return true for FigmaApiError instances', () => {
      const error = new FigmaApiError('API Error', 404)
      expect(isFigmaApiError(error)).toBe(true)
    })

    it('should return false for generic Error instances', () => {
      const error = new Error('Generic error')
      expect(isFigmaApiError(error)).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isFigmaApiError(null)).toBe(false)
      expect(isFigmaApiError(undefined)).toBe(false)
      expect(isFigmaApiError('string')).toBe(false)
      expect(isFigmaApiError(123)).toBe(false)
      expect(isFigmaApiError({})).toBe(false)
      expect(isFigmaApiError([])).toBe(false)
    })

    it('should return false for error-like objects without FigmaApiError prototype', () => {
      const errorLike = {
        message: 'Error',
        statusCode: 404,
      }
      expect(isFigmaApiError(errorLike)).toBe(false)
    })
  })

  describe('getErrorStatus', () => {
    it('should return status code for FigmaApiError instances', () => {
      const error = new FigmaApiError('Not Found', 404)
      expect(getErrorStatus(error)).toBe(404)
    })

    it('should return different status codes correctly', () => {
      expect(getErrorStatus(new FigmaApiError('Unauthorized', 401))).toBe(401)
      expect(getErrorStatus(new FigmaApiError('Forbidden', 403))).toBe(403)
      expect(getErrorStatus(new FigmaApiError('Rate Limited', 429))).toBe(429)
      expect(getErrorStatus(new FigmaApiError('Server Error', 500))).toBe(500)
    })

    it('should return null for generic Error instances', () => {
      const error = new Error('Generic error')
      expect(getErrorStatus(error)).toBeNull()
    })

    it('should return null for non-error values', () => {
      expect(getErrorStatus(null)).toBeNull()
      expect(getErrorStatus(undefined)).toBeNull()
      expect(getErrorStatus('string')).toBeNull()
      expect(getErrorStatus(123)).toBeNull()
      expect(getErrorStatus({})).toBeNull()
    })
  })

  describe('getErrorMessage', () => {
    it('should return message from Error instances', () => {
      const error = new Error('Error message')
      expect(getErrorMessage(error)).toBe('Error message')
    })

    it('should return message from FigmaApiError instances', () => {
      const error = new FigmaApiError('API Error', 404)
      expect(getErrorMessage(error)).toBe('API Error')
    })

    it('should return default message when Error has empty message', () => {
      const error = new Error('')
      // Empty string is falsy, so it falls back to default
      expect(getErrorMessage(error)).toBe('An error occurred')
      expect(getErrorMessage(error, 'Custom default')).toBe('Custom default')
    })

    it('should return default message when Error message is undefined', () => {
      const error = { message: undefined } as unknown as Error
      expect(getErrorMessage(error)).toBe('An error occurred')
      expect(getErrorMessage(error, 'Custom default')).toBe('Custom default')
    })

    it('should return string values directly', () => {
      expect(getErrorMessage('String error')).toBe('String error')
      expect(getErrorMessage('Another string')).toBe('Another string')
    })

    it('should return default message for non-string, non-Error values', () => {
      expect(getErrorMessage(null)).toBe('An error occurred')
      expect(getErrorMessage(undefined)).toBe('An error occurred')
      expect(getErrorMessage(123)).toBe('An error occurred')
      expect(getErrorMessage({})).toBe('An error occurred')
      expect(getErrorMessage([])).toBe('An error occurred')
    })

    it('should use custom default message when provided', () => {
      expect(getErrorMessage(null, 'Custom default')).toBe('Custom default')
      expect(getErrorMessage(undefined, 'Custom default')).toBe(
        'Custom default'
      )
      expect(getErrorMessage(123, 'Custom default')).toBe('Custom default')
    })
  })

  describe('hasErrorStatus', () => {
    it('should return true when error has matching status code', () => {
      const error = new FigmaApiError('Not Found', 404)
      expect(hasErrorStatus(error, 404)).toBe(true)
    })

    it('should return false when error has different status code', () => {
      const error = new FigmaApiError('Unauthorized', 401)
      expect(hasErrorStatus(error, 404)).toBe(false)
      expect(hasErrorStatus(error, 403)).toBe(false)
      expect(hasErrorStatus(error, 500)).toBe(false)
    })

    it('should return false for generic Error instances', () => {
      const error = new Error('Generic error')
      expect(hasErrorStatus(error, 404)).toBe(false)
      expect(hasErrorStatus(error, 401)).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(hasErrorStatus(null, 404)).toBe(false)
      expect(hasErrorStatus(undefined, 404)).toBe(false)
      expect(hasErrorStatus('string', 404)).toBe(false)
      expect(hasErrorStatus(123, 404)).toBe(false)
      expect(hasErrorStatus({}, 404)).toBe(false)
    })

    it('should work with various status codes', () => {
      expect(hasErrorStatus(new FigmaApiError('Bad Request', 400), 400)).toBe(
        true
      )
      expect(hasErrorStatus(new FigmaApiError('Unauthorized', 401), 401)).toBe(
        true
      )
      expect(hasErrorStatus(new FigmaApiError('Forbidden', 403), 403)).toBe(
        true
      )
      expect(hasErrorStatus(new FigmaApiError('Not Found', 404), 404)).toBe(
        true
      )
      expect(hasErrorStatus(new FigmaApiError('Rate Limited', 429), 429)).toBe(
        true
      )
      expect(hasErrorStatus(new FigmaApiError('Server Error', 500), 500)).toBe(
        true
      )
    })
  })
})
