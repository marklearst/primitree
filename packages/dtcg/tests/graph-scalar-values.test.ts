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

function requireFailure(result: ReturnType<typeof createDTCGGraphFragment>) {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected a failed DTCG graph result.')
  }
  return result.diagnostics[0]
}

function readLiteral(type: string, value: unknown) {
  const fragment = requireValue(
    createDTCGGraphFragment(
      { token: { $type: type, $value: value } },
      { source: 'brand' }
    )
  )
  return fragment.tokens[0]?.values[0]?.value
}

describe('DTCG cubic Bezier values', () => {
  it.each([[[0, -1, 1, 2]], [[0.25, 0.1, 0.75, 0.9]]])(
    'keeps a four-number curve',
    value => {
      expect(readLiteral('cubicBezier', value)).toEqual({
        kind: 'literal',
        value,
      })
    }
  )

  it('inherits the curve type from its group', () => {
    const fragment = requireValue(
      createDTCGGraphFragment(
        {
          motion: {
            $type: 'cubicBezier',
            standard: { $value: [0, -1, 1, 2] },
          },
        },
        { source: 'brand' }
      )
    )

    expect(fragment.tokens[0]).toMatchObject({
      type: 'cubicBezier',
      values: [{ value: { kind: 'literal', value: [0, -1, 1, 2] } }],
    })
  })

  it.each([
    ['first x below zero', [-0.01, 0, 0.5, 1], '0'],
    ['first x above one', [1.01, 0, 0.5, 1], '0'],
    ['second x below zero', [0.5, 0, -0.01, 1], '2'],
    ['second x above one', [0.5, 0, 1.01, 1], '2'],
    ['non-finite first x', [Number.NaN, 0, 0.5, 1], '0'],
    ['non-finite first y', [0.5, Number.NaN, 0.5, 1], '1'],
    ['non-finite second y', [0.5, 0, 0.5, Number.POSITIVE_INFINITY], '3'],
    ['text component', [0.5, 0, 0.5, '1'], '3'],
  ])('reports the %s component', (_label, value, index) => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'cubicBezier', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "cubicBezier".',
      path: ['token', '$value', index],
    })
  })

  it.each([
    ['three entries', [0, 0, 1]],
    ['five entries', [0, 0, 1, 1, 2]],
    ['object', { 0: 0, 1: 0, 2: 1, 3: 1 }],
  ])('rejects a %s value at the value path', (_label, value) => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'cubicBezier', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "cubicBezier".',
      path: ['token', '$value'],
    })
  })

  it('rejects a sparse curve at the missing entry', () => {
    const value = [0, 0, 1, 1]
    delete value[2]

    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'cubicBezier', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "cubicBezier".',
      path: ['token', '$value', '2'],
    })
  })

  it('copies a curve before returning the graph', () => {
    const value = [0.25, 0.1, 0.75, 0.9]
    const literal = readLiteral('cubicBezier', value)

    value[0] = 1

    expect(literal).toEqual({
      kind: 'literal',
      value: [0.25, 0.1, 0.75, 0.9],
    })
  })
})

describe('DTCG duration values', () => {
  it.each([[{ value: 100, unit: 'ms' }], [{ value: 1.5, unit: 's' }]])(
    'keeps a duration literal',
    value => {
      expect(readLiteral('duration', value)).toEqual({
        kind: 'literal',
        value,
      })
    }
  )

  it('keeps a negative value allowed by DTCG 2025.10', () => {
    expect(readLiteral('duration', { value: -100, unit: 'ms' })).toEqual({
      kind: 'literal',
      value: { value: -100, unit: 'ms' },
    })
  })

  it.each([
    ['value', { value: '100', unit: 'ms' }, ['token', '$value', 'value']],
    ['unit', { value: 100, unit: 'minutes' }, ['token', '$value', 'unit']],
    ['shape', [100, 'ms'], ['token', '$value']],
  ])('reports an invalid duration %s path', (_label, value, path) => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'duration', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "duration".',
      path,
    })
  })

  it('rejects duration fields hidden from JSON serialization', () => {
    const value = {}
    Object.defineProperties(value, {
      value: { enumerable: false, value: 100 },
      unit: { enumerable: false, value: 'ms' },
    })

    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'duration', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "duration".',
      path: ['token', '$value'],
    })
  })
})

describe('DTCG font family values', () => {
  it.each([['Inter'], [['Helvetica', 'Arial', 'sans-serif']]])(
    'keeps one font name or an ordered fallback list',
    value => {
      expect(readLiteral('fontFamily', value)).toEqual({
        kind: 'literal',
        value,
      })
    }
  )

  it('rejects an empty fallback list at the value path', () => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'fontFamily', $value: [] } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "fontFamily".',
      path: ['token', '$value'],
    })
  })

  it('reports the invalid fallback entry', () => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          {
            token: {
              $type: 'fontFamily',
              $value: ['Inter', 400, 'sans-serif'],
            },
          },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "fontFamily".',
      path: ['token', '$value', '1'],
    })
  })

  it('rejects a sparse fallback list at the missing entry', () => {
    const value = ['Inter']
    value.length = 2

    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'fontFamily', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "fontFamily".',
      path: ['token', '$value', '1'],
    })
  })

  it('copies a fallback list before returning the graph', () => {
    const value = ['Inter', 'sans-serif']
    const literal = readLiteral('fontFamily', value)

    value[0] = 'Arial'

    expect(literal).toEqual({
      kind: 'literal',
      value: ['Inter', 'sans-serif'],
    })
  })

  it('copies a fallback list when its length changes between reads', () => {
    let lengthReads = 0
    const value = new Proxy(['Inter'], {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads += 1
          if (lengthReads === 1) {
            return 1
          }
          if (lengthReads === 2) {
            return 2
          }
          throw new Error('The font family length was read more than twice.')
        }
        if (property === '1') {
          return 'sans-serif'
        }
        return Reflect.get(target, property, receiver)
      },
      getOwnPropertyDescriptor(target, property) {
        if (property === '1') {
          return {
            configurable: true,
            enumerable: true,
            value: 'sans-serif',
            writable: true,
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })

    expect(readLiteral('fontFamily', value)).toEqual({
      kind: 'literal',
      value: ['Inter', 'sans-serif'],
    })
    expect(lengthReads).toBe(2)
  })

  it('reports the value path before reading an oversized fallback list', () => {
    let reads = 0
    const value = new Proxy(new Array(100_001).fill('Inter'), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          reads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })

    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'fontFamily', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'The DTCG adapter reached its 100,000-item work limit.',
      path: ['token', '$value'],
    })
    expect(reads).toBe(0)
  })
})

const FONT_WEIGHT_NAMES = [
  'thin',
  'hairline',
  'extra-light',
  'ultra-light',
  'light',
  'normal',
  'regular',
  'book',
  'medium',
  'semi-bold',
  'demi-bold',
  'bold',
  'extra-bold',
  'ultra-bold',
  'black',
  'heavy',
  'extra-black',
  'ultra-black',
] as const

describe('DTCG font weight values', () => {
  it.each([1, 350, 650.5, 1000])('keeps numeric weight %s', value => {
    expect(readLiteral('fontWeight', value)).toEqual({
      kind: 'literal',
      value,
    })
  })

  it.each(FONT_WEIGHT_NAMES)('keeps named weight %s', value => {
    expect(readLiteral('fontWeight', value)).toEqual({
      kind: 'literal',
      value,
    })
  })

  it.each([
    ['below the range', 0],
    ['above the range', 1000.1],
    ['non-finite', Number.POSITIVE_INFINITY],
    ['wrong case', 'Bold'],
    ['numeric text', '400'],
    ['unknown name', 'semibold'],
    ['null', null],
  ])('rejects a %s weight at the value path', (_label, value) => {
    expect(
      requireFailure(
        createDTCGGraphFragment(
          { token: { $type: 'fontWeight', $value: value } },
          { source: 'brand' }
        )
      )
    ).toEqual({
      phase: 'source',
      code: 'dtcg.invalid-document',
      message: 'A DTCG token value does not match type "fontWeight".',
      path: ['token', '$value'],
    })
  })
})
