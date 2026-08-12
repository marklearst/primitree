import { describe, expect, it } from 'vitest'
import { parse as parseCss } from 'postcss'
import { cssVarName, emitCss } from '../src/pipeline/css'
import { emitTailwind } from '../src/pipeline/tailwind'
import { emitTypescript } from '../src/pipeline/typescript'
import type { DTCGDocument, ResolverDocument } from '../src/types'

describe('CSS custom property names', () => {
  it.each([
    ['question mark', 'a?b', '--a_3f_b'],
    ['exclamation mark', 'a!b', '--a_21_b'],
    ['punctuation-only name', '?!', '--_3f__21_'],
    ['underscore', 'a_b', '--a_5f_b'],
    ['space', 'a b', '--a_20_b'],
  ])('escapes an ASCII %s without removing it', (_label, path, expected) => {
    const name = cssVarName(path)

    expect(name).toBe(expected)
    expect(() => parseCss(`:root { ${name}: 1; }`)).not.toThrow()
  })

  it('keeps punctuation variants distinct', () => {
    expect(cssVarName('a?b')).not.toBe(cssVarName('a!b'))
  })

  it('keeps case-sensitive DTCG names distinct', () => {
    expect(cssVarName('color.brand')).not.toBe(cssVarName('Color.Brand'))
  })

  it('keeps distinct Unicode sequences distinct', () => {
    expect(cssVarName('e\u0301')).not.toBe(cssVarName('\u00e9'))
  })

  it('keeps authored hyphens distinct from path separators', () => {
    expect(cssVarName('a-b.c')).toBe('--a_2d_b-c')
    expect(cssVarName('a.b-c')).toBe('--a-b_2d_c')
    expect(cssVarName('a-b.c')).not.toBe(cssVarName('a.b-c'))
  })

  it('keeps an encoded marker distinct from authored marker text', () => {
    expect(cssVarName('?')).toBe('--_3f_')
    expect(cssVarName('_3f_')).toBe('--_5f_3f_5f_')
  })

  it('encodes an unpaired surrogate as ASCII text', () => {
    const name = cssVarName('\ud800')

    expect(name).toBe('--_d800_')
    expect(() => parseCss(`:root { ${name}: 1; }`)).not.toThrow()
  })

  it('uses one encoded name for declarations and references', () => {
    const files = {
      'brand.tokens.json': {
        color: {
          'brand?': {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [0.2, 0.4, 1],
              hex: '#3366ff',
            },
          },
          alias: { $type: 'color', $value: '{color.brand?}' },
        },
      },
    } satisfies Record<string, DTCGDocument>
    const resolver = {
      version: '2025.10',
      sets: {
        brand: { sources: [{ $ref: 'brand.tokens.json' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/brand' }],
    } satisfies ResolverDocument
    const encoded = '--color-brand_3f_'

    const css = emitCss(files, resolver)
    const tailwind = emitTailwind(files, resolver)
    const typescript = emitTypescript(files, resolver)

    expect(css).toContain(`${encoded}:`)
    expect(css).toContain(`--color-alias: var(${encoded});`)
    expect(tailwind).toContain(`var(${encoded})`)
    expect(typescript).toContain(`var(${encoded})`)
    expect(() => parseCss(css)).not.toThrow()
  })
})
