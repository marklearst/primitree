import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry } from '../../src/utils/retry'
import { FigmaApiError } from '../../src/types/figma'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('successful execution', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const wrapped = withRetry(fn)

      const result = await wrapped()

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should return result after retry succeeds', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const wrapped = withRetry(fn)
      const promise = wrapped()

      // Advance timer to trigger retry
      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('rate limit handling', () => {
    it('should retry on 429 errors by default', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const wrapped = withRetry(fn)
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should not retry non-429 errors by default', async () => {
      const fn = vi.fn().mockRejectedValue(new FigmaApiError('Not found', 404))

      const wrapped = withRetry(fn)

      await expect(wrapped()).rejects.toThrow('Not found')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should use Retry-After header when present', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429, 5))
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, { onRetry })
      const promise = wrapped()

      // Should wait 5 seconds (from Retry-After)
      await vi.advanceTimersByTimeAsync(5000)

      await promise
      expect(onRetry).toHaveBeenCalledWith(1, 5000, expect.any(Error))
    })
  })

  describe('retry options', () => {
    it('should respect maxRetries option', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new FigmaApiError('Rate limited', 429))

      const wrapped = withRetry(fn, { maxRetries: 2 })

      // Use Promise.allSettled to handle both timer advancement and promise rejection
      const resultPromise = wrapped().catch((e: Error) => e)

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(1000) // retry 1
      await vi.advanceTimersByTimeAsync(2000) // retry 2

      const result = await resultPromise
      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toBe('Rate limited')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('should use custom initialDelayMs', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, { initialDelayMs: 500, onRetry })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(500)

      await promise
      expect(onRetry).toHaveBeenCalledWith(1, 500, expect.any(Error))
    })

    it('should apply exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, {
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        onRetry,
      })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000) // first retry: 1000ms
      await vi.advanceTimersByTimeAsync(2000) // second retry: 2000ms

      await promise
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 1000, expect.any(Error))
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 2000, expect.any(Error))
    })

    it('should cap delay at maxDelayMs', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, {
        initialDelayMs: 50000,
        maxDelayMs: 5000,
        onRetry,
      })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(5000)

      await promise
      expect(onRetry).toHaveBeenCalledWith(1, 5000, expect.any(Error))
    })

    it('should retry all errors when retryOnlyRateLimits is false', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Server error', 500))
        .mockResolvedValueOnce('success')

      const wrapped = withRetry(fn, { retryOnlyRateLimits: false })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('onRetry callback', () => {
    it('should call onRetry with attempt, delay, and error', async () => {
      const rateLimitError = new FigmaApiError('Rate limited', 429)
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, { onRetry })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000)

      await promise
      expect(onRetry).toHaveBeenCalledWith(1, 1000, rateLimitError)
    })
  })

  describe('edge cases', () => {
    it('should handle non-FigmaApiError errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network error'))

      const wrapped = withRetry(fn)

      // Should not retry since it's not a rate limit error
      await expect(wrapped()).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry non-FigmaApiError when retryOnlyRateLimits is false', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success')

      const wrapped = withRetry(fn, { retryOnlyRateLimits: false })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise
      expect(result).toBe('success')
    })

    it('should handle zero maxRetries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new FigmaApiError('Rate limited', 429))

      const wrapped = withRetry(fn, { maxRetries: 0 })

      await expect(wrapped()).rejects.toThrow('Rate limited')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should cap exponential backoff at maxDelayMs after multiple retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      const onRetry = vi.fn()
      const wrapped = withRetry(fn, {
        initialDelayMs: 1000,
        backoffMultiplier: 10, // Would grow to 10000, then 100000
        maxDelayMs: 5000,
        maxRetries: 3,
        onRetry,
      })
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000) // retry 1: 1000ms
      await vi.advanceTimersByTimeAsync(5000) // retry 2: capped at 5000ms (not 10000)
      await vi.advanceTimersByTimeAsync(5000) // retry 3: still capped at 5000ms

      await promise
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 1000, expect.any(Error))
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 5000, expect.any(Error)) // capped
      expect(onRetry).toHaveBeenNthCalledWith(3, 3, 5000, expect.any(Error)) // capped
    })

    it('should work without onRetry callback', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new FigmaApiError('Rate limited', 429))
        .mockResolvedValueOnce('success')

      // No onRetry provided
      const wrapped = withRetry(fn)
      const promise = wrapped()

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
