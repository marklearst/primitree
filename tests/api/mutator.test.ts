import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mutator } from '../../src/api/mutator'

const DUMMY_URL = 'https://api.example.com/test'
const DUMMY_TOKEN = 'dummy-token'
const DUMMY_BODY = { foo: 'bar' }

describe('mutator', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('throws if token is missing', async () => {
    await expect(mutator(DUMMY_URL, '', 'POST', DUMMY_BODY)).rejects.toThrow(
      /token/i
    )
  })

  it('returns JSON on success (POST)', async () => {
    const data = { success: true }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
    const result = await mutator(DUMMY_URL, DUMMY_TOKEN, 'POST', DUMMY_BODY)
    expect(result).toEqual(data)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      DUMMY_URL,
      {
        method: 'POST',
        headers: {
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(DUMMY_BODY),
      }
    )
  })

  it('returns JSON on success (PUT)', async () => {
    const data = { updated: true }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
    const result = await mutator(DUMMY_URL, DUMMY_TOKEN, 'PUT', DUMMY_BODY)
    expect(result).toEqual(data)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      DUMMY_URL,
      {
        method: 'PUT',
        headers: {
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(DUMMY_BODY),
      }
    )
  })

  it('returns JSON on success (DELETE)', async () => {
    const data = { deleted: true }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
    const result = await mutator(DUMMY_URL, DUMMY_TOKEN, 'DELETE')
    expect(result).toEqual(data)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      DUMMY_URL,
      {
        method: 'DELETE',
        headers: {
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    )
  })

  it('throws with error message if response is not ok and error message exists', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'fail!' }),
    })
    await expect(
      mutator(DUMMY_URL, DUMMY_TOKEN, 'POST', DUMMY_BODY)
    ).rejects.toThrow('fail!')
  })

  it('throws with fallback error if response is not ok and no message', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })
    await expect(
      mutator(DUMMY_URL, DUMMY_TOKEN, 'POST', DUMMY_BODY)
    ).rejects.toThrow(/fetch/i)
  })

  it('returns undefined for 204 No Content response', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
    })
    const result = await mutator(DUMMY_URL, DUMMY_TOKEN, 'DELETE')
    expect(result).toBeUndefined()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      DUMMY_URL,
      {
        method: 'DELETE',
        headers: {
          'X-FIGMA-TOKEN': DUMMY_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    )
  })
})
