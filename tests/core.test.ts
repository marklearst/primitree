import { describe, it, expect } from 'vitest'

describe('Core barrel file', () => {
  it('should export core APIs from the core entrypoint', async () => {
    const Core = await import('../src/core')

    expect(Core).toBeDefined()
    expect(typeof Core).toBe('object')

    expect(typeof Core.fetcher).toBe('function')
    expect(typeof Core.mutator).toBe('function')
    expect(typeof Core.filterVariables).toBe('function')

    expect(Core.FIGMA_API_BASE_URL).toBe('https://api.figma.com')
  })
})
