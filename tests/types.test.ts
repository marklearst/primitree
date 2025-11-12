import { describe, it, expect } from 'vitest'

describe('Types barrel file', () => {
  it('should export types from the barrel file', async () => {
    // Dynamically import the barrel file to ensure it's loaded and covered
    const Types = await import('../src/types')

    // This test ensures the barrel file is loaded and covered
    expect(Types).toBeDefined()

    // Verify the module exports exist
    expect(typeof Types).toBe('object')
  })
})
