import { describe, expect, it } from 'vitest'
import { createDTCGGraphFragment } from '../src/index'

function requireValue<Value>(result: {
  readonly ok: boolean
  readonly value?: Value
}): Value {
  expect(result.ok).toBe(true)
  if (!result.ok || result.value === undefined) {
    throw new Error('Expected a successful result.')
  }
  return result.value
}

function readColor(value: unknown) {
  return createDTCGGraphFragment(
    {
      palette: {
        sample: { $type: 'color', $value: value },
      },
    },
    { source: 'brand' }
  )
}

function requireColorFailure(value: unknown) {
  const result = readColor(value)
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected an invalid color result.')
  }
  return result.diagnostics[0]
}

const supportedColors = [
  ['srgb', [0, 0.4, 1]],
  ['srgb-linear', [0, 0.4, 1]],
  ['hsl', [320, 80, 50]],
  ['hwb', [320, 10, 20]],
  ['lab', [50, -20, 30]],
  ['lch', [50, 30, 320]],
  ['oklab', [0.7, -0.1, 0.1]],
  ['oklch', [0.7, 0.2, 320]],
  ['display-p3', [0, 0.4, 1]],
  ['a98-rgb', [0, 0.4, 1]],
  ['prophoto-rgb', [0, 0.4, 1]],
  ['rec2020', [0, 0.4, 1]],
  ['xyz-d65', [0, 0.4, 1]],
  ['xyz-d50', [0, 0.4, 1]],
] as const

describe('DTCG graph color values', () => {
  it.each(supportedColors)(
    'accepts the %s color space',
    (colorSpace, components) => {
      const fragment = requireValue(
        readColor({ colorSpace, components: [...components] })
      )

      expect(fragment.tokens[0]?.values[0]?.value).toEqual({
        kind: 'literal',
        value: { colorSpace, components: [...components] },
      })
    }
  )

  it.each([
    [
      'none in the first and third components',
      'srgb',
      ['none', 0.4, 'none'],
      undefined,
      undefined,
    ],
    [
      'HSL hue 0, saturation 0, and lightness 100',
      'hsl',
      [0, 0, 100],
      undefined,
      undefined,
    ],
    [
      'HWB hue below 360, whiteness 100, and blackness 0',
      'hwb',
      [359.999, 100, 0],
      undefined,
      undefined,
    ],
    [
      'finite Lab a and b values',
      'lab',
      [100, -1_000_000, 1_000_000],
      undefined,
      undefined,
    ],
    [
      'LCH lightness 0, chroma 0, and hue below 360',
      'lch',
      [0, 0, 359.999],
      undefined,
      undefined,
    ],
    [
      'finite OKLab a and b values',
      'oklab',
      [1, -1_000_000, 1_000_000],
      undefined,
      undefined,
    ],
    [
      'OKLCH lightness 0, chroma 0, and hue below 360',
      'oklch',
      [0, 0, 359.999],
      undefined,
      undefined,
    ],
    ['LCH chroma above 100', 'lch', [50, 1_000, 180], undefined, undefined],
    ['alpha lower bound', 'srgb', [0, 0, 0], 0, undefined],
    ['alpha upper bound and lowercase hex', 'srgb', [1, 1, 1], 1, '#ffffff'],
    ['uppercase hex', 'srgb', [1, 0, 1], undefined, '#FF00FF'],
  ] as const)('accepts %s', (_label, colorSpace, components, alpha, hex) => {
    const value = {
      colorSpace,
      components: [...components],
      ...(alpha === undefined ? {} : { alpha }),
      ...(hex === undefined ? {} : { hex }),
    }
    const fragment = requireValue(readColor(value))

    expect(fragment.tokens[0]?.values[0]?.value).toEqual({
      kind: 'literal',
      value,
    })
  })

  it.each([
    ['a non-object value', 1, ['$value']],
    ['a missing colorSpace', { components: [0, 0, 0] }, ['$value']],
    ['missing components', { colorSpace: 'srgb' }, ['$value']],
    [
      'an extra field',
      { colorSpace: 'srgb', components: [0, 0, 0], note: 'blue' },
      ['$value'],
    ],
    [
      'an unknown color space',
      { colorSpace: 'device-cmyk', components: [0, 0, 0] },
      ['$value', 'colorSpace'],
    ],
    [
      'two components',
      { colorSpace: 'srgb', components: [0, 0] },
      ['$value', 'components'],
    ],
    [
      'four components',
      { colorSpace: 'srgb', components: [0, 0, 0, 0] },
      ['$value', 'components'],
    ],
    [
      'an undefined component',
      { colorSpace: 'srgb', components: [0, undefined, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'an unknown component string',
      { colorSpace: 'srgb', components: ['missing', 0, 0] },
      ['$value', 'components', '0'],
    ],
    [
      'an sRGB component above one',
      { colorSpace: 'srgb', components: [1.01, 0, 0] },
      ['$value', 'components', '0'],
    ],
    [
      'an XYZ component below zero',
      { colorSpace: 'xyz-d65', components: [0, -0.01, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'a hue of 360',
      { colorSpace: 'hsl', components: [360, 50, 50] },
      ['$value', 'components', '0'],
    ],
    [
      'a negative hue',
      { colorSpace: 'hsl', components: [-0.01, 50, 50] },
      ['$value', 'components', '0'],
    ],
    [
      'an HWB percentage above 100',
      { colorSpace: 'hwb', components: [0, 100.01, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'Lab lightness above 100',
      { colorSpace: 'lab', components: [100.01, 0, 0] },
      ['$value', 'components', '0'],
    ],
    [
      'a non-finite Lab axis',
      { colorSpace: 'lab', components: [50, Number.POSITIVE_INFINITY, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'negative LCH chroma',
      { colorSpace: 'lch', components: [50, -0.01, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'OKLab lightness above one',
      { colorSpace: 'oklab', components: [1.01, 0, 0] },
      ['$value', 'components', '0'],
    ],
    [
      'negative OKLCH chroma',
      { colorSpace: 'oklch', components: [0.5, -0.01, 0] },
      ['$value', 'components', '1'],
    ],
    [
      'alpha below zero',
      { colorSpace: 'srgb', components: [0, 0, 0], alpha: -0.01 },
      ['$value', 'alpha'],
    ],
    [
      'alpha above one',
      { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1.01 },
      ['$value', 'alpha'],
    ],
    [
      'a non-finite alpha',
      {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: Number.POSITIVE_INFINITY,
      },
      ['$value', 'alpha'],
    ],
    [
      'an eight-digit hex fallback',
      { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000ff' },
      ['$value', 'hex'],
    ],
    [
      'a hex fallback with non-hex text',
      { colorSpace: 'srgb', components: [0, 0, 0], hex: '#gg0000' },
      ['$value', 'hex'],
    ],
  ] as const)(
    'rejects %s at the nearest value field',
    (_label, value, pathSuffix) => {
      const diagnostic = requireColorFailure(value)

      expect(diagnostic).toMatchObject({
        code: 'dtcg.invalid-document',
        path: ['palette', 'sample', ...pathSuffix],
      })
    }
  )

  it('copies the color object and components before returning the fragment', () => {
    const components = [0.2, 0.4, 0.8]
    const value = {
      colorSpace: 'srgb',
      components,
      alpha: 0.75,
      hex: '#3366cc',
    }
    const fragment = requireValue(readColor(value))

    value.colorSpace = 'hsl'
    value.alpha = 0
    value.hex = '#000000'
    components[0] = 1

    expect(fragment.tokens[0]?.values[0]?.value).toEqual({
      kind: 'literal',
      value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.8],
        alpha: 0.75,
        hex: '#3366cc',
      },
    })
  })

  it('omits optional fields returned only by a proxy getter', () => {
    const value = new Proxy(
      { colorSpace: 'srgb', components: [0.2, 0.4, 0.8] },
      {
        get(target, property, receiver) {
          if (property === 'alpha') {
            return 0.5
          }
          if (property === 'hex') {
            return '#3366cc'
          }
          return Reflect.get(target, property, receiver)
        },
      }
    )
    const fragment = requireValue(readColor(value))

    expect(fragment.tokens[0]?.values[0]?.value).toEqual({
      kind: 'literal',
      value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.8],
      },
    })
  })

  it('reports the color $value path when literal scanning reaches the work limit', () => {
    const diagnostic = requireColorFailure({
      colorSpace: 'srgb',
      components: new Array(100_001),
    })

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['palette', 'sample', '$value'],
    })
  })

  it('reports the color $value path when a proxy returns NaN for array length', () => {
    const components = new Proxy([0, 0, 0], {
      get(target, property, receiver) {
        return property === 'length'
          ? Number.NaN
          : Reflect.get(target, property, receiver)
      },
    })
    const diagnostic = requireColorFailure({
      colorSpace: 'srgb',
      components,
    })

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['palette', 'sample', '$value'],
    })
  })

  it('reports the color $value path when reference scanning reaches the work limit', () => {
    const reference = `{${Array.from({ length: 100_001 }, () => 'a').join(
      '.'
    )}}`
    const diagnostic = requireColorFailure(reference)

    expect(diagnostic).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['palette', 'sample', '$value'],
    })
  })
})
