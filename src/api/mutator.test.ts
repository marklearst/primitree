import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { mutator } from './mutator'
import { FIGMA_API_BASE_URL } from '../constants'

// Mock the global fetch function as it's a dependency
global.fetch = vi.fn() as unknown as Mock
const fetchMock = fetch as unknown as Mock

describe('mutator', () => {
  const token = 'test-token'
  const url = '/variables'
  const body = { name: 'test' }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle CREATE action correctly', async () => {
    const mockResponse = { success: true }
    fetchMock.mockResolvedValue({
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
    fetchMock.mockResolvedValue({
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
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''), // Empty response for DELETE
    })

    await mutator(url, token, 'DELETE') // No body for delete

    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('should throw an error with message from response `err` property', async () => {
    const errorResponse = { err: 'Invalid request' }
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(errorResponse),
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Invalid request'
    )
  })

  it('should throw an error with message from response `message` property', async () => {
    const errorResponse = { message: 'Something failed' }
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(errorResponse),
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Something failed'
    )
  })

  it('should throw a generic error if the response has no error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}), // Empty error object
    })

    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })
})
