import * as dtcg from '../src/index'

describe('DTCG graph public API', () => {
  it('exports the graph and output builders and omits toGraphFragment', () => {
    expect(dtcgExports()).toContain('createDTCGGraphFragment')
    expect(dtcgExports()).toContain('buildDTCGOutputs')
    expect(dtcgExports()).toContain('DTCGOutputCapabilityError')
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
})

function dtcgExports(): string[] {
  return Object.keys(dtcg)
}
