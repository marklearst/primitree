import * as dtcg from '../src/index'

describe('DTCG graph public API', () => {
  it('exports the graph and output builders and omits toGraphFragment', () => {
    expect(dtcgExports()).toContain('createDTCGGraphFragment')
    expect(dtcgExports()).toContain('buildDTCGOutputs')
    expect(dtcgExports()).toContain('DTCGOutputCapabilityError')
    expect(dtcgExports()).toContain('typedCssValue')
    expect(dtcgExports()).toContain('flattenTypedTokens')
    expect(dtcgExports()).toContain('validateResolverContexts')
    expect(dtcgExports()).not.toContain('toGraphFragment')

    const result = dtcg.createDTCGGraphFragment(
      {
        scale: {
          base: { $type: 'number', $value: 4 },
        },
      },
      { source: 'brand', uri: 'tokens.json' }
    )

    expect(result.ok).toBe(true)
  })

  it('formats resolved values with their effective token type', () => {
    expect(dtcg.typedCssValue('semi-bold', 'fontWeight')).toBe('600')
    expect(dtcg.typedCssValue('semi-bold', 'string')).toBe('semi-bold')
  })

  it('exports a discriminated Resolver context validation result', () => {
    const result = dtcg.validateResolverContexts(
      { 'tokens.tokens.json': { value: { $value: 1 } } },
      {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: './tokens.tokens.json' }] } },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      }
    )[0]

    expect(result?.ok).toBe(true)
    if (result?.ok === true) {
      const untypedTokenPaths: string[] = result.untypedTokenPaths
      expect(untypedTokenPaths).toEqual(['value'])
    } else if (result !== undefined) {
      const error: dtcg.ReferenceResolutionError = result.error
      expect(error).toBeInstanceOf(dtcg.ReferenceResolutionError)
    }
  })
})

function dtcgExports(): string[] {
  return Object.keys(dtcg)
}
