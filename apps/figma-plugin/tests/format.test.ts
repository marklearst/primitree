import { describe, expect, it } from 'vitest'
import { formatCount } from '../src/format'

describe('formatCount', () => {
  it('uses singular and plural count labels', () => {
    expect(formatCount(0, 'variable')).toBe('0 variables')
    expect(formatCount(1, 'variable')).toBe('1 variable')
    expect(formatCount(2, 'variable')).toBe('2 variables')
  })
})
