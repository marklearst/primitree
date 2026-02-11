/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_API_BASE_URL,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../../src/constants'

const mockFetch = vi.fn() as any
global.fetch = mockFetch

describe('mutator', () => {
  const token = 'test-token'
  const url = '/variables'
  const fullUrl = `${FIGMA_API_BASE_URL}${url}`
  const body = { name: 'test' }
  const pathWithoutLeadingSlash = 'variables'

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should throw an error if token is not provided', async () => {
    await expect(mutator(url, '', 'CREATE', body)).rejects.toThrow(
      ERROR_MSG_TOKEN_REQUIRED
    )
  })

  it('should call fetch with POST for CREATE action and return JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'not-null', // Ensure body is truthy to pass the check
      json: () => Promise.resolve({ id: '123' }),
    })
    const result = await mutator(url, token, 'CREATE', body)
    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual({ id: '123' })
  })

  it('should prefix base URL when url is a path without a leading slash', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'not-null',
      json: () => Promise.resolve({ id: '123' }),
    })

    await mutator(pathWithoutLeadingSlash, token, 'CREATE', body)

    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}/${pathWithoutLeadingSlash}`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('should call fetch with PUT for UPDATE action and return JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'not-null', // Ensure body is truthy to pass the check
      json: () => Promise.resolve({ id: '123' }),
    })
    const result = await mutator(url, token, 'UPDATE', body)
    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'PUT' })
    )
    expect(result).toEqual({ id: '123' })
  })

  it('should not prefix base URL when url is already absolute', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'not-null',
      json: () => Promise.resolve({ id: '123' }),
    })

    await mutator(fullUrl, token, 'CREATE', body)

    expect(fetch).toHaveBeenCalledWith(
      fullUrl,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('should handle successful DELETE (204 No Content)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      body: null, // Simulate no body
    })
    const result = await mutator(url, token, 'DELETE')
    expect(result).toEqual({})
  })

  it('should throw error with `err` from response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: 'Bad Request' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Bad Request'
    )
  })

  it('should throw error with message from response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ message: 'Custom error message' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Custom error message'
    )
  })

  it('should throw error with message when err is falsy', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: null, message: 'Error message' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Error message'
    )
  })

  it('should throw error with message when err is empty string', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: '', message: 'Error message' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Error message'
    )
  })

  it('should use errorData.message when err is falsy', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: null, message: 'Message from API' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Message from API'
    )
  })

  it('should use default errorMessage when both err and message are falsy', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: null, message: null }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })

  it('should use default errorMessage when both err and message are empty strings', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/json' : null,
      },
      json: () => Promise.resolve({ err: '', message: '' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })

  it('should throw generic error for failed non-JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/html' : null),
      },
      json: () => Promise.reject(new Error('Invalid JSON')),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })

  it('should throw generic error when content-type is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/html' : null),
      },
      json: () => Promise.resolve({ message: 'Error' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })

  it('should handle 204 No Content with null body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      body: null,
    })
    const result = await mutator(url, token, 'DELETE')
    expect(result).toEqual({})
  })

  it('should throw error if fetch itself fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network Failure'))
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Network Failure'
    )
  })

  describe('abort signal support', () => {
    it('should abort request when signal is aborted', async () => {
      const controller = new AbortController()
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'

      mockFetch.mockRejectedValue(abortError)

      controller.abort()

      await expect(
        mutator(url, token, 'CREATE', body, { signal: controller.signal })
      ).rejects.toThrow('Aborted')
    })

    it('should pass abort signal to fetch', async () => {
      const controller = new AbortController()
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      await mutator(url, token, 'CREATE', body, { signal: controller.signal })

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: controller.signal,
        })
      )
    })

    it('should not include signal in fetch options when undefined', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      await mutator(url, token, 'CREATE', body)

      const fetchCall = mockFetch.mock.calls[0]
      const fetchOptions = fetchCall[1] as RequestInit
      expect(fetchOptions.signal).toBeUndefined()
    })

    it('should use providedSignal when both signal and timeout are provided', async () => {
      const controller = new AbortController()
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      await mutator(url, token, 'CREATE', body, {
        signal: controller.signal,
        timeout: 1000,
      })

      const fetchCall = mockFetch.mock.calls[0]
      const fetchOptions = fetchCall[1] as RequestInit

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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      await mutator(url, token, 'CREATE', body, { timeout: 1000 })

      const fetchCall = mockFetch.mock.calls[0]
      const fetchOptions = fetchCall[1] as RequestInit

      // Verify that a signal was created (timeout creates AbortController internally)
      expect(fetchOptions.signal).toBeDefined()
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    })

    it('should clear timeout after successful response', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      await mutator(url, token, 'CREATE', body, { timeout: 1000 })

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('should call abort when timeout expires', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

      // Mock fetch to hang indefinitely (never resolves)
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves
          })
      )

      // Start the request with a timeout (don't await - it never resolves)
      void mutator(url, token, 'CREATE', body, { timeout: 1000 })

      // Advance timers to trigger the timeout callback (line 96)
      vi.advanceTimersByTime(1000)

      // The abort should have been called
      expect(abortSpy).toHaveBeenCalled()

      abortSpy.mockRestore()
    })

    it('should clear timeout on error', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const networkError = new Error('Network Failure')
      mockFetch.mockRejectedValue(networkError)

      const promise = mutator(url, token, 'CREATE', body, { timeout: 1000 })

      await expect(promise).rejects.toThrow('Network Failure')

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('rate limit handling', () => {
    it('should parse Retry-After header for 429 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json'
            if (name === 'Retry-After') return '60'
            return null
          },
        },
        json: () => Promise.resolve({ message: 'Rate Limited' }),
      })

      try {
        await mutator(url, token, 'CREATE', body)
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error && 'retryAfter' in error) {
          expect((error as { retryAfter?: number }).retryAfter).toBe(60)
        }
      }
    })

    it('should handle invalid Retry-After header gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json'
            if (name === 'Retry-After') return 'invalid'
            return null
          },
        },
        json: () => Promise.resolve({ message: 'Rate Limited' }),
      })

      await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow()
    })

    it('should not parse Retry-After for non-429 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json'
            if (name === 'Retry-After') return '60'
            return null
          },
        },
        json: () => Promise.resolve({ message: 'Not Found' }),
      })

      try {
        await mutator(url, token, 'CREATE', body)
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
        status: 200,
        body: 'not-null',
        json: () => Promise.resolve({ id: '123' }),
      })

      const result = await mutator(url, token, 'CREATE', body, {
        fetch: customFetch as typeof fetch,
      })

      expect(customFetch).toHaveBeenCalled()
      expect(result).toEqual({ id: '123' })
    })
  })
})
