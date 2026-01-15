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
})
