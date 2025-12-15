import { describe, it, expect } from 'vitest'

describe('Core barrel file', () => {
  it('should export core APIs from the core entrypoint', async () => {
    const Core = await import('../src/core')

    expect(Core).toBeDefined()
    expect(typeof Core).toBe('object')
  })
})
