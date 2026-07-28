import { describe, it, expect } from 'vitest'

describe('contexts barrel file', () => {
  it('exports FigmaVariablesProvider and useFigmaTokenContext', async () => {
    const contextsModule = await import('../../src/contexts')

    // Check that all expected exports are present
    expect(contextsModule.FigmaVariablesProvider).toBeDefined()
    expect(contextsModule.useFigmaTokenContext).toBeDefined()

    // Check that they are functions/components
    expect(typeof contextsModule.FigmaVariablesProvider).toBe('function')
    expect(typeof contextsModule.useFigmaTokenContext).toBe('function')
  })
})
