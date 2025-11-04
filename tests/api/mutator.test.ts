import { describe, it, expect, vi, afterEach } from 'vitest'
import { mutator } from '../../src/api/mutator'
import { FIGMA_API_BASE_URL } from '../../src/constants'

global.fetch = vi.fn()

describe('mutator', () => {
  const token = 'test-token'
  const url = '/variables'
  const body = { name: 'test' }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call fetch with POST for CREATE action', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: '123' }),
    })
    await mutator(url, token, 'CREATE', body)
    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('should call fetch with PUT for UPDATE action', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: '123' }),
    })
    await mutator(url, token, 'UPDATE', body)
    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('should handle successful DELETE (204 No Content)', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: true,
      status: 204, // No Content
      json: () => Promise.resolve({}), // Should not be called, but include for safety
    })
    const result = await mutator(url, token, 'DELETE')
    expect(fetch).toHaveBeenCalledWith(
      `${FIGMA_API_BASE_URL}${url}`,
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(result).toEqual({})
  })

  it('should throw error with `err` from response', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ err: 'Bad Request' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Bad Request'
    )
  })

  it('should throw error with `message` from response', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not Found' }),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Not Found'
    )
  })

  it('should throw generic error for failed requests with no message', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'An API error occurred'
    )
  })

  it('should throw error if fetch itself fails', async () => {
    ;(fetch as any).mockRejectedValue(new Error('Network Failure'))
    await expect(mutator(url, token, 'CREATE', body)).rejects.toThrow(
      'Network Failure'
    )
  })
})
