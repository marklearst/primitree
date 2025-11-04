import { describe, it, expect, vi, afterEach } from 'vitest'
import { mutator } from './mutator'
import { FIGMA_API_BASE_URL, FIGMA_TOKEN_HEADER } from '../constants'

// Mock the global fetch function as it's a dependency
global.fetch = vi.fn()

describe('mutator', () => {
  const token = 'test-token'
  const url = '/variables'
  const body = { name: 'test' }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle CREATE action correctly', async () => {
    const mockResponse = { success: true }
    ;(fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
      json: () => Promise.resolve(mockResponse),
    })

    await mutator(url, token, 'CREATE', body)

    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    )
  })

  it('should handle UPDATE action correctly', async () => {
    const mockResponse = { success: true }
    ;(fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
      json: () => Promise.resolve(mockResponse),
    })

    await mutator(url, token, 'UPDATE', body)

    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) })
    )
  })

  it('should handle DELETE action correctly', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''), // Empty response for DELETE
    })

    await mutator(url, token, 'DELETE') // No body for delete

    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'DELETE', body: undefined })
    )
  })

  it('should throw an error with message from response `err` property', async () => {
    const errorResponse = { err: 'Invalid request' }
    ;(fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(errorResponse),
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Invalid request'
    )
  })

  it('should throw an error with message from response `message` property', async () => {
    const errorResponse = { message: 'Something failed' }
    ;(fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(errorResponse),
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Something failed'
    )
  })

  it('should throw a generic error if the response has no error message', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}), // Empty error object
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })
})
