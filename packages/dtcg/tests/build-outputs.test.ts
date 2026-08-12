import { describe, expect, it } from 'vitest'
import {
  buildDTCGOutputs,
  DTCGOutputCapabilityError,
  type DTCGOutputSet,
} from '../src/pipeline/build'
import { createDTCGGraphFragment } from '../src/index'
import type { DTCGDocument, ResolverDocument } from '../src/types'

const document = {
  primitive: {
    color: {
      blue: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.2, 0.4, 1],
          hex: '#3366ff',
        },
      },
    },
  },
  semantic: {
    color: {
      action: {
        $type: 'color',
        $value: '{primitive.color.blue}',
      },
    },
  },
} satisfies DTCGDocument

const input: DTCGOutputSet = {
  files: { 'brand.tokens.json': document },
  resolver: {
    version: '2025.10',
    sets: {
      brand: { sources: [{ $ref: 'brand.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/brand' }],
  },
  resolverFileName: 'tokens.resolver.json',
}

describe('buildDTCGOutputs', () => {
  it('returns only token JSON, Resolver, CSS, Tailwind, and TypeScript files', () => {
    const result = buildDTCGOutputs(input)

    expect(result.files.map(file => file.path)).toEqual([
      'tokens/brand.tokens.json',
      'tokens/tokens.resolver.json',
      'css/tokens.css',
      'css/tokens.tailwind.css',
      'ts/tokens.ts',
    ])
    expect(result.warnings).toEqual([])
    expect(result.summary).toMatchObject({
      collections: 1,
      variables: 2,
      tokenFiles: 2,
      contexts: {},
    })
    expect(result.files.map(file => file.path).join('\n')).not.toMatch(
      /style-dictionary|terrazzo|workflow|README/u
    )
  })

  it('sorts JSON object keys while preserving array order', () => {
    const result = buildDTCGOutputs({
      ...input,
      files: {
        'brand.tokens.json': {
          zebra: { $value: 1, $type: 'number' },
          alpha: { $value: ['z', 'a'], $type: 'fontFamily' },
        } satisfies DTCGDocument,
      },
    })
    const text = result.files.find(
      file => file.path === 'tokens/brand.tokens.json'
    )?.contents

    expect(text?.indexOf('"alpha"')).toBeLessThan(text?.indexOf('"zebra"') ?? 0)
    expect(text).toContain('[\n      "z",\n      "a"\n    ]')
  })

  it('keeps Resolver context order when generated output is read again', () => {
    const contextInput: DTCGOutputSet = {
      files: {
        'zeta.tokens.json': {
          value: { $type: 'number', $value: 2 },
        },
        'alpha.tokens.json': {
          value: { $type: 'number', $value: 1 },
        },
      },
      resolver: {
        version: '2025.10',
        modifiers: {
          theme: {
            contexts: {
              zeta: [{ $ref: 'zeta.tokens.json' }],
              alpha: [{ $ref: 'alpha.tokens.json' }],
            },
          },
        },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }],
      },
      resolverFileName: 'tokens.resolver.json',
    }
    const first = buildDTCGOutputs(contextInput)
    const resolverText = first.files.find(
      file => file.path === 'tokens/tokens.resolver.json'
    )?.contents
    const writtenResolver = JSON.parse(resolverText ?? '') as ResolverDocument

    expect(
      Object.keys(writtenResolver.modifiers?.theme?.contexts ?? {})
    ).toEqual(['zeta', 'alpha'])

    const second = buildDTCGOutputs({
      ...contextInput,
      resolver: writtenResolver,
    })
    for (const path of ['css/tokens.css', 'ts/tokens.ts']) {
      expect(second.files.find(file => file.path === path)?.contents).toBe(
        first.files.find(file => file.path === path)?.contents
      )
    }
  })

  it('can emit Tailwind without emitting Primitree CSS', () => {
    const result = buildDTCGOutputs(input, {
      css: false,
      tailwind: true,
      typescript: false,
    })

    expect(result.files.map(file => file.path)).toEqual([
      'tokens/brand.tokens.json',
      'tokens/tokens.resolver.json',
      'css/tokens.tailwind.css',
    ])
    expect(
      result.files.find(file => file.path === 'css/tokens.tailwind.css')
        ?.contents
    ).toContain('Import tokens.css BEFORE this file')
  })

  it('keeps duration, font-family, font-weight, and boolean values in DTCG, CSS, and TypeScript files', () => {
    const scalars = {
      motion: {
        quick: { $type: 'duration', $value: { value: 120, unit: 'ms' } },
      },
      type: {
        family: {
          $type: 'fontFamily',
          $value: ['Inter', 'sans-serif'],
        },
        weight: { $type: 'fontWeight', $value: 'bold' },
      },
      feature: {
        rounded: { $type: 'boolean', $value: true },
      },
    } satisfies DTCGDocument

    const result = buildDTCGOutputs(
      { ...input, files: { 'brand.tokens.json': scalars } },
      { tailwind: false }
    )
    const byPath = new Map(result.files.map(file => [file.path, file.contents]))

    expect(byPath.get('tokens/brand.tokens.json')).toContain('"fontFamily"')
    expect(byPath.get('css/tokens.css')).toContain('--motion-quick: 120ms;')
    expect(byPath.get('css/tokens.css')).toContain(
      '--type-family: Inter, sans-serif;'
    )
    expect(byPath.get('css/tokens.css')).toContain('--feature-rounded: true;')
    expect(byPath.get('ts/tokens.ts')).toContain(
      '["type.family"]: ["Inter","sans-serif"],'
    )
    expect(byPath.get('ts/tokens.ts')).toContain('["feature.rounded"]: true,')
  })

  it('builds every first-party file for a reader-accepted wide-gamut color', () => {
    const wideGamut = {
      brand: {
        color: {
          accent: {
            $type: 'color',
            $value: {
              colorSpace: 'display-p3',
              components: [0.2, 0.4, 1],
              alpha: 0.75,
              hex: '#3366ff',
            },
          },
        },
      },
    } satisfies DTCGDocument

    expect(createDTCGGraphFragment(wideGamut, { source: 'brand' }).ok).toBe(
      true
    )

    const result = buildDTCGOutputs({
      ...input,
      files: { 'brand.tokens.json': wideGamut },
    })
    const byPath = new Map(result.files.map(file => [file.path, file.contents]))

    expect(JSON.parse(byPath.get('tokens/brand.tokens.json') ?? '')).toEqual(
      wideGamut
    )
    expect(JSON.parse(byPath.get('tokens/tokens.resolver.json') ?? '')).toEqual(
      input.resolver
    )
    expect(byPath.get('css/tokens.css')).toContain(
      '--brand-color-accent: color(display-p3 0.2 0.4 1 / 0.75);'
    )
    expect(byPath.get('css/tokens.tailwind.css')).toContain(
      '--color-accent: var(--brand-color-accent);'
    )
    expect(byPath.get('ts/tokens.ts')).toContain(
      '["brand.color.accent"]: "color(display-p3 0.2 0.4 1 / 0.75)",'
    )
  })

  it('builds every first-party file for a cubic Bezier value', () => {
    const motion = {
      motion: {
        standard: {
          $type: 'cubicBezier',
          $value: [0.25, -1, 0.75, 2],
        },
      },
    } satisfies DTCGDocument

    expect(createDTCGGraphFragment(motion, { source: 'brand' }).ok).toBe(true)

    const result = buildDTCGOutputs({
      ...input,
      files: { 'brand.tokens.json': motion },
    })
    const byPath = new Map(result.files.map(file => [file.path, file.contents]))

    expect(JSON.parse(byPath.get('tokens/brand.tokens.json') ?? '')).toEqual({
      motion: {
        standard: {
          $type: 'cubicBezier',
          $value: [0.25, -1, 0.75, 2],
        },
      },
    })
    expect(JSON.parse(byPath.get('tokens/tokens.resolver.json') ?? '')).toEqual(
      input.resolver
    )
    expect(byPath.get('css/tokens.css')).toContain(
      '--motion-standard: cubic-bezier(0.25, -1, 0.75, 2);'
    )
    expect(byPath.get('css/tokens.tailwind.css')).toContain(
      '--ease-standard: var(--motion-standard);'
    )
    expect(byPath.get('ts/tokens.ts')).toContain(
      '["motion.standard"]: [0.25,-1,0.75,2],'
    )
  })

  it.each([
    '../outside.tokens.json',
    '/outside.tokens.json',
    'C:/outside.tokens.json',
    'nested\\outside.tokens.json',
    'nested//outside.tokens.json',
  ])('rejects the unsafe token path %s', fileName => {
    expect(() =>
      buildDTCGOutputs({
        ...input,
        files: { [fileName]: document },
      })
    ).toThrow(`Unsafe DTCG token file path: "${fileName}".`)
  })

  it.each([
    'CON.tokens.json',
    'nested/COM¹.tokens.json',
    'nested/name:stream.tokens.json',
    'nested/trailing.',
    'nested/trailing ',
    'nested/question?.tokens.json',
  ])('rejects the Windows-incompatible token path %s', fileName => {
    expect(() =>
      buildDTCGOutputs({
        ...input,
        files: {
          'brand.tokens.json': document,
          [fileName]: document,
        },
      })
    ).toThrow(`Unsafe DTCG token file path: "${fileName}".`)
  })

  it('requires the Resolver file name to be a basename', () => {
    expect(() =>
      buildDTCGOutputs({
        ...input,
        resolverFileName: 'config/tokens.resolver.json',
      })
    ).toThrow('The DTCG Resolver file name cannot contain path segments.')
  })

  it('rejects a Windows-reserved Resolver file name', () => {
    expect(() =>
      buildDTCGOutputs({
        ...input,
        resolverFileName: 'CON.tokens.json',
      })
    ).toThrow('Unsafe DTCG Resolver file path: "CON.tokens.json".')
  })

  it('rejects token and Resolver paths that collide by case', () => {
    expect(() =>
      buildDTCGOutputs({
        ...input,
        files: { 'TOKENS.RESOLVER.JSON': document },
      })
    ).toThrow(
      'DTCG output paths collide: "TOKENS.RESOLVER.JSON" and "tokens.resolver.json".'
    )
  })

  it.each([
    ['parent', ['themes', 'THEMES/dark.tokens.json']],
    ['child', ['THEMES/dark.tokens.json', 'themes']],
  ])(
    'rejects a file and directory output collision when the %s comes first',
    (_first, names) => {
      expect(() =>
        buildDTCGOutputs({
          ...input,
          files: Object.fromEntries([
            ['brand.tokens.json', document],
            ...names.map(name => [name, document]),
          ]) as Record<string, DTCGDocument>,
        })
      ).toThrow(
        'DTCG output paths collide: "themes" and "THEMES/dark.tokens.json".'
      )
    }
  )

  it('does not change the checked input', () => {
    const frozen = Object.freeze({
      files: Object.freeze({
        'brand.tokens.json': Object.freeze(document),
      }),
      resolver: Object.freeze(input.resolver),
      resolverFileName: input.resolverFileName,
    })
    const before = JSON.stringify(frozen)

    buildDTCGOutputs(frozen)

    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('bounds the number of token files', () => {
    const files: Record<string, DTCGDocument> = {}
    for (let index = 0; index <= 1_000; index += 1) {
      files[`part-${index}.tokens.json`] = document
    }

    expect(() => buildDTCGOutputs({ ...input, files })).toThrow(
      'A DTCG output set can contain at most 1,000 token files.'
    )
  })

  it('bounds JSON nesting before sorting output', () => {
    let nested: DTCGDocument = {
      value: { $type: 'number', $value: 1 },
    }
    for (let depth = 0; depth <= 64; depth += 1) {
      nested = { group: nested }
    }

    expect(() =>
      buildDTCGOutputs({
        ...input,
        files: { 'nested.tokens.json': nested },
      })
    ).toThrow('DTCG output data can contain at most 64 levels.')
  })

  it('bounds Resolver work when only token JSON is selected', () => {
    const tokens = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => [
        `value${index}`,
        { $type: 'number', $value: index },
      ])
    ) as DTCGDocument
    const repeatedSources = Array.from({ length: 400 }, () => ({
      $ref: 'brand.tokens.json',
    }))

    expect(() =>
      buildDTCGOutputs(
        {
          ...input,
          files: { 'brand.tokens.json': tokens },
          resolver: {
            version: '2025.10',
            sets: { brand: { sources: repeatedSources } },
            resolutionOrder: [{ $ref: '#/sets/brand' }],
          },
        },
        { css: false, tailwind: false, typescript: false }
      )
    ).toThrow('DTCG output summary exceeds the 1,000,000-unit work limit.')
  })

  it('rejects token paths that share one CSS custom property name', () => {
    const collidingPaths = {
      theme: {
        'foo bar': {
          $type: 'number',
          $value: 1,
        },
        'foo@bar': {
          $type: 'number',
          $value: 2,
        },
      },
    } satisfies DTCGDocument

    expect(() =>
      buildDTCGOutputs({
        ...input,
        files: { 'brand.tokens.json': collidingPaths },
      })
    ).toThrow(
      'DTCG token paths "theme.foo bar" and "theme.foo@bar" both map to CSS custom property "--theme-foo-bar".'
    )
  })

  it('rejects CSS custom property name collisions for Tailwind-only output', () => {
    const collidingPaths = {
      theme: {
        'foo bar': {
          $type: 'color',
          $value: '#3366ff',
        },
        'foo@bar': {
          $type: 'color',
          $value: '#2244cc',
        },
      },
    } satisfies DTCGDocument

    expect(() =>
      buildDTCGOutputs(
        {
          ...input,
          files: { 'brand.tokens.json': collidingPaths },
        },
        { css: false, tailwind: true, typescript: false }
      )
    ).toThrow(
      'DTCG token paths "theme.foo bar" and "theme.foo@bar" both map to CSS custom property "--theme-foo-bar".'
    )
  })

  it('ignores CSS name collisions for values omitted from Tailwind', () => {
    const collidingPaths = {
      theme: {
        'foo bar': {
          $type: 'number',
          $value: 1,
        },
        'foo@bar': {
          $type: 'number',
          $value: 2,
        },
      },
    } satisfies DTCGDocument

    const result = buildDTCGOutputs(
      {
        ...input,
        files: { 'brand.tokens.json': collidingPaths },
      },
      { css: false, tailwind: true, typescript: false }
    )

    expect(
      result.files.find(file => file.path === 'css/tokens.tailwind.css')
        ?.contents
    ).toContain('@theme inline {\n}')
  })

  it('rejects CSS custom property name collisions for TypeScript-only output', () => {
    const collidingPaths = {
      theme: {
        'foo bar': {
          $type: 'number',
          $value: 1,
        },
        'foo@bar': {
          $type: 'number',
          $value: 2,
        },
      },
    } satisfies DTCGDocument

    expect(() =>
      buildDTCGOutputs(
        {
          ...input,
          files: { 'brand.tokens.json': collidingPaths },
        },
        { css: false, tailwind: false, typescript: true }
      )
    ).toThrow(
      'DTCG token paths "theme.foo bar" and "theme.foo@bar" both map to CSS custom property "--theme-foo-bar".'
    )
  })

  it('reports CSS and the token path when output cannot represent a checked value', () => {
    const emptyFontFamily = {
      type: {
        family: {
          $type: 'fontFamily',
          $value: [],
        },
      },
    } satisfies DTCGDocument

    const run = () =>
      buildDTCGOutputs({
        ...input,
        files: { 'brand.tokens.json': emptyFontFamily },
      })

    expect(run).toThrow(DTCGOutputCapabilityError)
    expect(run).toThrow(
      'The CSS output cannot represent the fontFamily value at "type.family".'
    )
  })
})
