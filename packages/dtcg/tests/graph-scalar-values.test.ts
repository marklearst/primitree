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
