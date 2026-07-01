import { describe, it, expect } from 'vitest'

describe('main index barrel file', () => {
  it('exports the Figma variables provider without the old provider name', async () => {
    const indexModule = await import('../src/index')

    expect(indexModule.FigmaVariablesProvider).toBeDefined()
    expect(typeof indexModule.FigmaVariablesProvider).toBe('function')
    expect(indexModule).not.toHaveProperty(['Figma', 'Vars', 'Provider'].join(''))
  })

  it('should export all hooks, utils, and types', async () => {
    const indexModule = await import('../src/index')

    // Check hooks exports
    expect(indexModule.useVariables).toBeDefined()
    expect(indexModule.useVariableCollections).toBeDefined()
    expect(indexModule.useVariableModes).toBeDefined()
    expect(indexModule.useCreateVariable).toBeDefined()
    expect(indexModule.useUpdateVariable).toBeDefined()
    expect(indexModule.useDeleteVariable).toBeDefined()
    expect(indexModule.useBulkUpdateVariables).toBeDefined()

    // Granular selector + auth hooks (documented in README, added in 4.2.0)
    expect(indexModule.useVariableById).toBeDefined()
    expect(indexModule.useCollectionById).toBeDefined()
    expect(indexModule.useModesByCollection).toBeDefined()
    expect(indexModule.useFigmaToken).toBeDefined()
    expect(indexModule.useFigmaTokenContext).toBeDefined()

    // Check utils export
    expect(indexModule.filterVariables).toBeDefined()
    expect(typeof indexModule.filterVariables).toBe('function')
    expect(indexModule.withRetry).toBeDefined()
    expect(indexModule.redactToken).toBeDefined()
    expect(indexModule.isRateLimited).toBeDefined()
    expect(indexModule.getRetryAfter).toBeDefined()
    expect(indexModule.isLocalVariablesResponse).toBeDefined()
    expect(indexModule.isPublishedVariablesResponse).toBeDefined()
    expect(indexModule.validateFallbackData).toBeDefined()

    // Check that types are exported (they should be available as type exports)
    // We can't directly test type exports, but we can check the module structure
    expect(Object.keys(indexModule).length).toBeGreaterThan(8)
  })
})
