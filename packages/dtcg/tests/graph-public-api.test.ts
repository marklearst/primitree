import * as dtcg from '../src/index'

describe('DTCG graph public API', () => {
  it('exports the graph and output builders and omits toGraphFragment', () => {
    expect(dtcgExports()).toContain('createDTCGGraphFragment')
    expect(dtcgExports()).toContain('buildDTCGOutputs')
    expect(dtcgExports()).toContain('DTCGOutputCapabilityError')
    expect(dtcgExports()).toContain('typedCssValue')
    expect(dtcgExports()).toContain('flattenTypedTokens')
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
})

function dtcgExports(): string[] {
  return Object.keys(dtcg)
}
