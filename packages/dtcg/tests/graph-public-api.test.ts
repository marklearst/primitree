import * as dtcg from '../src/index'

describe('DTCG graph public API', () => {
  it('exports createDTCGGraphFragment and omits toGraphFragment', () => {
    expect(dtcgExports()).toContain('createDTCGGraphFragment')
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
