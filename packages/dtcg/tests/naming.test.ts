import { describe, it, expect } from 'vitest'
import {
  slugify,
  sanitizeSegment,
  toPathSegments,
  uniqueSlugs,
} from '../src/naming'
import { colorToHex, figmaColorToDTCG } from '../src/color'
import { inferTokenType } from '../src/inferType'
import type { NormalizedVariable } from '@figmavars/core'

describe('slugify', () => {
  it('kebab-cases arbitrary names', () => {
    expect(slugify('Brand Colors (Web)')).toBe('brand-colors-web')
    expect(slugify('  Semantic  ')).toBe('semantic')
    expect(slugify('___')).toBe('unnamed')
  })
})

describe('sanitizeSegment', () => {
  it('strips DTCG-forbidden characters', () => {
    expect(sanitizeSegment('bg.brand')).toBe('bg-brand')
    expect(sanitizeSegment('{weird}')).toBe('-weird-')
    expect(sanitizeSegment('$internal')).toBe('internal')
    expect(sanitizeSegment('')).toBe('unnamed')
  })
})

describe('toPathSegments', () => {
  it('splits Figma slash names', () => {
    expect(toPathSegments('color/bg/brand')).toEqual(['color', 'bg', 'brand'])
    expect(toPathSegments('single')).toEqual(['single'])
    expect(toPathSegments('')).toEqual(['unnamed'])
  })
})

describe('uniqueSlugs', () => {
  it('dedupes colliding slugs', () => {
    const slugs = uniqueSlugs(['Theme', 'theme', 'Theme!'])
    expect(slugs.get('Theme')).toBe('theme')
    expect(slugs.get('theme')).toBe('theme-2')
    expect(slugs.get('Theme!')).toBe('theme-3')
  })
})

describe('color conversion', () => {
  it('converts channels to hex', () => {
    expect(colorToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#ffffff')
    expect(colorToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
  })

  it('produces DTCG color objects with rounded components', () => {
    expect(figmaColorToDTCG({ r: 1 / 3, g: 0, b: 1, a: 1 })).toEqual({
      colorSpace: 'srgb',
      components: [0.3333, 0, 1],
      alpha: 1,
      hex: '#5500ff',
    })
  })
})

function floatVariable(
  name: string,
  scopes: NormalizedVariable['scopes'] = []
): NormalizedVariable {
  return {
    id: 'v',
    name,
    collectionId: 'c',
    resolvedType: 'FLOAT',
    valuesByMode: {},
    description: '',
    hiddenFromPublishing: false,
    scopes,
    codeSyntax: {},
  }
}

describe('inferTokenType fallbacks', () => {
  it('prefers scopes over names', () => {
    expect(inferTokenType(floatVariable('anything', ['OPACITY']))).toBe(
      'number'
    )
    expect(inferTokenType(floatVariable('anything', ['FONT_WEIGHT']))).toBe(
      'fontWeight'
    )
    expect(inferTokenType(floatVariable('anything', ['CORNER_RADIUS']))).toBe(
      'dimension'
    )
  })

  it('falls back to name heuristics', () => {
    expect(inferTokenType(floatVariable('motion/duration/fast'))).toBe(
      'duration'
    )
    expect(inferTokenType(floatVariable('font/weight/bold'))).toBe('fontWeight')
    expect(inferTokenType(floatVariable('layout/spacing/md'))).toBe('dimension')
    expect(inferTokenType(floatVariable('misc/count'))).toBe('number')
  })
})
