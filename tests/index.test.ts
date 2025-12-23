import { describe, it, expect } from 'vitest'

describe('main index barrel file', () => {
  it('should export all hooks, provider, utils, and types', async () => {
    const indexModule = await import('../src/index')

    // Check provider export
    expect(indexModule.FigmaVarsProvider).toBeDefined()
    expect(typeof indexModule.FigmaVarsProvider).toBe('function')

    // Check hooks exports
    expect(indexModule.useVariables).toBeDefined()
    expect(indexModule.useVariableCollections).toBeDefined()
    expect(indexModule.useVariableModes).toBeDefined()
    expect(indexModule.useCreateVariable).toBeDefined()
    expect(indexModule.useUpdateVariable).toBeDefined()
    expect(indexModule.useDeleteVariable).toBeDefined()
    expect(indexModule.useBulkUpdateVariables).toBeDefined()

    // Check utils export
    expect(indexModule.filterVariables).toBeDefined()
    expect(typeof indexModule.filterVariables).toBe('function')

    // Check that types are exported (they should be available as type exports)
    // We can't directly test type exports, but we can check the module structure
    expect(Object.keys(indexModule).length).toBeGreaterThan(8)
  })
})
