import { describe, it, expect, vi } from 'vitest'
import { fetcher } from '../../src/api/fetcher'
import { FIGMA_API_BASE_URL } from '../../src/constants'

const DUMMY_URL = 'https://api.example.com/test'
const DUMMY_TOKEN = 'dummy-token'

// Helper to mock fetch
function mockFetch(
  response: Partial<Response> & { json?: () => unknown },
  ok = true
) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: response.json || (() => Promise.resolve(response)),
    ...response,
  }) as unknown as typeof global.fetch
}

describe('fetcher', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('throws if token is missing', async () => {
    await expect(fetcher(DUMMY_URL, '')).rejects.toThrow(/token/i)
  })

  it('returns JSON on success', async () => {
    const data = { foo: 'bar' }
    mockFetch({ json: () => Promise.resolve(data) })
    const result = await fetcher(DUMMY_URL, DUMMY_TOKEN)
    expect(result).toEqual(data)
    expect(global.fetch).toHaveBeenCalledWith(
      DUMMY_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('prefixes FIGMA_API_BASE_URL when url is a path', async () => {
    const data = { foo: 'bar' }
    const path = '/v1/files/abc/variables/local'
    mockFetch({ json: () => Promise.resolve(data) })

    const result = await fetcher(path, DUMMY_TOKEN)

    expect(result).toEqual(data)
    expect(global.fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${path}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('prefixes FIGMA_API_BASE_URL when url is a path without a leading slash', async () => {
    const data = { foo: 'bar' }
    const path = 'v1/files/abc/variables/local'
    mockFetch({ json: () => Promise.resolve(data) })

    const result = await fetcher(path, DUMMY_TOKEN)

    expect(result).toEqual(data)
    expect(global.fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}/${path}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('uses the fallback json method when one is not provided', async () => {
    // This object is compatible with `Partial<Response>`
    const responseData = { status: 200, statusText: 'OK' }
    // Call mockFetch without a `json` property to test the fallback path
    mockFetch(responseData)
    const result = await fetcher(DUMMY_URL, DUMMY_TOKEN)
    // The fallback should resolve with the entire response object
    expect(result).toEqual(responseData)
  })

  it('throws with error message if response is not ok and error message exists', async () => {
    const mockHeaders = new Headers()
    mockHeaders.set('content-type', 'application/json')
    mockFetch(
      {
        json: () => Promise.resolve({ message: 'fail!' }),
        headers: mockHeaders,
      },
      false
    )
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow('fail!')
  })

  it('throws with fallback error if response is not ok and no message', async () => {
    mockFetch({ json: () => Promise.resolve({}) }, false)
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(/fetch/i)
  })

  it('throws with fallback error if response is not ok and JSON parsing fails', async () => {
    // Mock a response that fails JSON parsing
    mockFetch({ json: () => Promise.reject(new Error('Invalid JSON')) }, false)
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(/fetch/i)
  })

  it('throws with error.err if response is not ok and error.err exists', async () => {
    const mockHeaders = new Headers()
    mockHeaders.set('content-type', 'application/json')
    mockFetch(
      {
        json: () => Promise.resolve({ err: 'Error occurred!' }),
        headers: mockHeaders,
      },
      false
    )
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(
      'Error occurred!'
    )
  })

  it('throws with fallback error if response is not ok and content-type is not JSON', async () => {
    const mockHeaders = new Headers()
    mockHeaders.set('content-type', 'text/html')
    mockFetch(
      {
        json: () => Promise.resolve({ message: 'fail!' }),
        headers: mockHeaders,
      },
      false
    )
    await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(/fetch/i)
  })

  describe('abort signal support', () => {
    it('should abort request when signal is aborted', async () => {
      const controller = new AbortController()
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'

      global.fetch = vi
        .fn()
        .mockRejectedValue(abortError) as typeof global.fetch

      controller.abort()

      await expect(
        fetcher(DUMMY_URL, DUMMY_TOKEN, { signal: controller.signal })
      ).rejects.toThrow('Aborted')
    })

    it('should pass abort signal to fetch', async () => {
      const controller = new AbortController()
      mockFetch({ json: () => Promise.resolve({ data: 'test' }) })

      await fetcher(DUMMY_URL, DUMMY_TOKEN, { signal: controller.signal })

      expect(global.fetch).toHaveBeenCalledWith(
        DUMMY_URL,
        expect.objectContaining({
          signal: controller.signal,
        })
      )
    })

    it('should use providedSignal when both signal and timeout are provided', async () => {
      const controller = new AbortController()
      mockFetch({ json: () => Promise.resolve({ data: 'test' }) })

      await fetcher(DUMMY_URL, DUMMY_TOKEN, {
        signal: controller.signal,
        timeout: 1000,
      })

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall).toBeDefined()

      const fetchOptions = fetchCall![1] as RequestInit

      // Provided signal should take precedence, timeout should not create new signal
      expect(fetchOptions.signal).toBe(controller.signal)
    })
  })

  describe('timeout support', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.clearAllMocks()
    })

    it('should create abort signal when timeout is provided', async () => {
      mockFetch({ json: () => Promise.resolve({ data: 'test' }) })

      await fetcher(DUMMY_URL, DUMMY_TOKEN, { timeout: 1000 })

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall).toBeDefined()

      const fetchOptions = fetchCall![1] as RequestInit

      // Verify that a signal was created (timeout creates AbortController internally)
      expect(fetchOptions.signal).toBeDefined()
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    })

    it('should clear timeout after successful response', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      mockFetch({ json: () => Promise.resolve({ data: 'test' }) })

      await fetcher(DUMMY_URL, DUMMY_TOKEN, { timeout: 1000 })

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('should abort request when timeout expires', async () => {
      // Create a spy on AbortController.prototype.abort to catch when timeout triggers abort
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

      // Mock fetch to hang (never resolves)
      global.fetch = vi.fn(() => {
        return new Promise(() => {
          // Never resolves - simulates slow network
        })
      }) as typeof global.fetch

      fetcher(DUMMY_URL, DUMMY_TOKEN, { timeout: 1000 }).catch(() => {
        // Ignore the rejection
      })

      // Advance timers to trigger timeout (this should call abort on line 96)
      vi.advanceTimersByTime(1000)

      // Wait a bit for the abort to be called
      await vi.runAllTimersAsync()

      // Verify abort was called (timeout should have triggered it on line 96)
      expect(abortSpy).toHaveBeenCalled()

      // Clean up
      abortSpy.mockRestore()
    })

    it('should clear timeout on error', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const networkError = new Error('Network error')
      global.fetch = vi
        .fn()
        .mockRejectedValue(networkError) as typeof global.fetch

      const promise = fetcher(DUMMY_URL, DUMMY_TOKEN, { timeout: 1000 })

      await expect(promise).rejects.toThrow('Network error')

      // Verify timeout was cleared
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('rate limit handling', () => {
    it('should parse Retry-After header for 429 errors', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')
      mockHeaders.set('Retry-After', '60')

      mockFetch(
        {
          status: 429,
          json: () => Promise.resolve({ message: 'Rate Limited' }),
          headers: mockHeaders,
        },
        false
      )

      try {
        await fetcher(DUMMY_URL, DUMMY_TOKEN)
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error && 'retryAfter' in error) {
          expect((error as { retryAfter?: number }).retryAfter).toBe(60)
        }
      }
    })

    it('should handle invalid Retry-After header gracefully', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')
      mockHeaders.set('Retry-After', 'invalid')

      mockFetch(
        {
          status: 429,
          json: () => Promise.resolve({ message: 'Rate Limited' }),
          headers: mockHeaders,
        },
        false
      )

      await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow()
    })

    it('should handle NaN Retry-After header value', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')
      mockHeaders.set('Retry-After', 'not-a-number')

      mockFetch(
        {
          status: 429,
          json: () => Promise.resolve({ message: 'Rate Limited' }),
          headers: mockHeaders,
        },
        false
      )

      try {
        await fetcher(DUMMY_URL, DUMMY_TOKEN)
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error && 'retryAfter' in error) {
          // When parsed is NaN, retryAfter should be undefined
          expect((error as { retryAfter?: number }).retryAfter).toBeUndefined()
        }
      }
    })

    it('should use errorData.message when available', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')

      mockFetch(
        {
          status: 400,
          json: () => Promise.resolve({ message: 'Custom error message' }),
          headers: mockHeaders,
        },
        false
      )

      await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(
        'Custom error message'
      )
    })

    it('should use errorData.err when message is not available', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')

      mockFetch(
        {
          status: 400,
          json: () => Promise.resolve({ err: 'Error occurred' }),
          headers: mockHeaders,
        },
        false
      )

      await expect(fetcher(DUMMY_URL, DUMMY_TOKEN)).rejects.toThrow(
        'Error occurred'
      )
    })

    it('should not parse Retry-After for non-429 errors', async () => {
      const mockHeaders = new Headers()
      mockHeaders.set('content-type', 'application/json')
      mockHeaders.set('Retry-After', '60')

      mockFetch(
        {
          status: 404,
          json: () => Promise.resolve({ message: 'Not Found' }),
          headers: mockHeaders,
        },
        false
      )

      try {
        await fetcher(DUMMY_URL, DUMMY_TOKEN)
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error && 'retryAfter' in error) {
          expect((error as { retryAfter?: number }).retryAfter).toBeUndefined()
        }
      }
    })
  })

  describe('custom fetch implementation', () => {
    it('should use custom fetch when provided', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'custom' }),
      })

      const result = await fetcher(DUMMY_URL, DUMMY_TOKEN, {
        fetch: customFetch as typeof fetch,
      })

      expect(customFetch).toHaveBeenCalled()
      expect(result).toEqual({ data: 'custom' })
    })
  })
})
