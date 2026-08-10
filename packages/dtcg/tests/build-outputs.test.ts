import { describe, expect, it } from 'vitest'
import {
  buildDTCGOutputs,
  DTCGOutputCapabilityError,
  type DTCGOutputSet,
} from '../src/pipeline/build'
import { createDTCGGraphFragment } from '../src/index'
import {
  applyResolverWithBudget,
  flattenTokensWithBudget,
  type ResolverWorkBudget,
} from '../src/resolve'
import type { DTCGDocument, ResolverDocument } from '../src/types'

const OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE =
  'DTCG output summary exceeds the 1,000,000-unit work limit.'

function outputSummaryBudget(): ResolverWorkBudget {
  return {
    remaining: 1_000_000,
    errorMessage: OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE,
  }
}

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

function buildTokenPathOutput(fileName: string) {
  return buildDTCGOutputs(
    {
      ...input,
      files: { [fileName]: document },
      resolver: {
        ...input.resolver,
        sets: { brand: { sources: [{ $ref: fileName }] } },
      },
    },
    { css: false, tailwind: false, typescript: false }
  )
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

  it('keeps Resolver modifier order when generated output is read again', () => {
    const modifierInput: DTCGOutputSet = {
      files: {
        'base.tokens.json': {
          color: { $type: 'string', $value: 'base' },
        },
        'zebra.tokens.json': {
          color: { $type: 'string', $value: 'zebra' },
        },
        'alpha.tokens.json': {
          color: { $type: 'string', $value: 'alpha' },
        },
      },
      resolver: {
        version: '2025.10',
        sets: {
          base: { sources: [{ $ref: 'base.tokens.json' }] },
        },
        modifiers: {
          zebra: {
            default: 'off',
            contexts: {
              off: [],
              on: [{ $ref: 'zebra.tokens.json' }],
            },
          },
          alpha: {
            default: 'off',
            contexts: {
              off: [],
              on: [{ $ref: 'alpha.tokens.json' }],
            },
          },
        },
        resolutionOrder: [
          { $ref: '#/sets/base' },
          { $ref: '#/modifiers/zebra' },
          { $ref: '#/modifiers/alpha' },
        ],
      },
      resolverFileName: 'tokens.resolver.json',
    }
    const first = buildDTCGOutputs(modifierInput, {
      tailwind: false,
      typescript: false,
    })
    const resolverText = first.files.find(
      file => file.path === 'tokens/tokens.resolver.json'
    )?.contents
    const writtenResolver = JSON.parse(resolverText ?? '') as ResolverDocument

    expect(Object.keys(writtenResolver.modifiers ?? {})).toEqual([
      'zebra',
      'alpha',
    ])

    const second = buildDTCGOutputs(
      { ...modifierInput, resolver: writtenResolver },
      { tailwind: false, typescript: false }
    )
    expect(
      second.files.find(file => file.path === 'css/tokens.css')?.contents
    ).toBe(first.files.find(file => file.path === 'css/tokens.css')?.contents)
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

  it.each([
    ['lone high surrogate', '\ud800.tokens.json'],
    ['distinct lone high surrogate', '\ud801.tokens.json'],
    ['lone low surrogate', '\udc00.tokens.json'],
  ])('rejects a %s in a token output path', (_label, fileName) => {
    const run = () =>
      buildDTCGOutputs({
        ...input,
        files: { [fileName]: document },
        resolver: {
          ...input.resolver,
          sets: { brand: { sources: [{ $ref: fileName }] } },
        },
      })

    expect(run).toThrow(Error)
    expect(run).toThrow(
      'The DTCG token file path cannot contain a lone UTF-16 surrogate.'
    )
  })

  it('keeps valid astral pairs and non-English token output paths', () => {
    const result = buildDTCGOutputs(
      {
        ...input,
        files: { '主题😀.tokens.json': document },
        resolver: {
          ...input.resolver,
          sets: {
            brand: { sources: [{ $ref: '主题😀.tokens.json' }] },
          },
        },
      },
      { css: false, tailwind: false, typescript: false }
    )

    expect(result.files.map(file => file.path)).toEqual([
      'tokens/主题😀.tokens.json',
      'tokens/tokens.resolver.json',
    ])
  })

  it.each([
    [
      'ASCII intermediate',
      `${'a'.repeat(256)}/brand.tokens.json`,
      'a'.repeat(256),
      256,
    ],
    [
      'ASCII final',
      `${'a'.repeat(244)}.tokens.json`,
      `${'a'.repeat(244)}.tokens.json`,
      256,
    ],
    [
      'multibyte intermediate',
      `${'界'.repeat(86)}/brand.tokens.json`,
      '界'.repeat(86),
      258,
    ],
    [
      'multibyte final',
      `${'界'.repeat(81)}a.tokens.json`,
      `${'界'.repeat(81)}a.tokens.json`,
      256,
    ],
  ])(
    'rejects a token output path segment over 255 UTF-8 bytes (%s)',
    (_label, fileName, oversizedSegment, expectedBytes) => {
      expect(new TextEncoder().encode(oversizedSegment).byteLength).toBe(
        expectedBytes
      )
      expect(() => buildTokenPathOutput(fileName)).toThrow(
        'The DTCG token file path segment can contain at most 255 UTF-8 bytes.'
      )
    }
  )

  it.each([
    [
      'ASCII intermediate',
      `${'a'.repeat(255)}/brand.tokens.json`,
      'a'.repeat(255),
    ],
    [
      'ASCII final',
      `${'a'.repeat(243)}.tokens.json`,
      `${'a'.repeat(243)}.tokens.json`,
    ],
    [
      'multibyte intermediate',
      `${'界'.repeat(85)}/brand.tokens.json`,
      '界'.repeat(85),
    ],
    [
      'multibyte final',
      `${'界'.repeat(80)}abc.tokens.json`,
      `${'界'.repeat(80)}abc.tokens.json`,
    ],
  ])(
    'accepts a token output path segment with exactly 255 UTF-8 bytes (%s)',
    (_label, fileName, boundarySegment) => {
      expect(new TextEncoder().encode(boundarySegment).byteLength).toBe(255)
      const result = buildTokenPathOutput(fileName)

      expect(result.files.map(file => file.path)).toContain(
        `tokens/${fileName}`
      )
    }
  )

  it.each([
    ['axis', '\ud800', 'theme'],
    ['context', 'theme', '\udc00'],
  ])(
    'rejects a lone surrogate in a Resolver %s name when CSS is disabled',
    (location, axis, context) => {
      const run = () =>
        buildDTCGOutputs(
          {
            ...input,
            resolver: {
              version: '2025.10',
              modifiers: {
                [axis]: {
                  contexts: {
                    [context]: [
                      { value: { $type: 'string', $value: 'selected' } },
                    ],
                  },
                },
              },
              resolutionOrder: [{ $ref: `#/modifiers/${axis}` }],
            },
          },
          { css: false, tailwind: false, typescript: false }
        )

      expect(run).toThrow(Error)
      expect(run).toThrow(
        `The DTCG Resolver ${location} name cannot contain a lone UTF-16 surrogate.`
      )
    }
  )

  it('keeps valid astral pairs and non-English Resolver names', () => {
    const result = buildDTCGOutputs(
      {
        ...input,
        resolver: {
          version: '2025.10',
          modifiers: {
            '语义😀': {
              contexts: {
                '暗い🌙': [{ value: { $type: 'string', $value: 'selected' } }],
              },
            },
          },
          resolutionOrder: [{ $ref: '#/modifiers/语义😀' }],
        },
      },
      { css: false, tailwind: false, typescript: false }
    )

    expect(result.summary.contexts).toEqual({ '语义😀': ['暗い🌙'] })
  })

  it('rejects a Resolver file name with path segments', () => {
    const candidate = { ...input }
    Reflect.set(candidate, 'resolverFileName', 'config/tokens.resolver.json')

    expect(() => buildDTCGOutputs(candidate)).toThrow(
      'The DTCG Resolver file name must be "tokens.resolver.json".'
    )
  })

  it('rejects a Windows-reserved Resolver file name', () => {
    const candidate = { ...input }
    Reflect.set(candidate, 'resolverFileName', 'CON.tokens.json')

    expect(() => buildDTCGOutputs(candidate)).toThrow(
      'The DTCG Resolver file name must be "tokens.resolver.json".'
    )
  })

  it('rejects a safe custom Resolver basename', () => {
    const candidate = { ...input }
    Reflect.set(candidate, 'resolverFileName', 'brand.resolver.json')

    let failure: unknown
    try {
      buildDTCGOutputs(candidate)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(TypeError)
    expect(failure).toHaveProperty(
      'message',
      'The DTCG Resolver file name must be "tokens.resolver.json".'
    )
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
    ['sharp s', 'straße.tokens.json', 'STRASSE.tokens.json'],
    ['capital sharp s', 'ẞ.tokens.json', 'ß.tokens.json'],
    ['Greek sigma', 'σ.tokens.json', 'ς.tokens.json'],
  ])(
    'rejects token paths that collide through portable %s comparison',
    (_label, first, second) => {
      expect(() =>
        buildDTCGOutputs({
          ...input,
          files: {
            [first]: document,
            [second]: document,
          },
        })
      ).toThrow(`DTCG output paths collide: "${first}" and "${second}".`)
    }
  )

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

  it('shares one summary work budget across Resolver application and flattening', () => {
    const tokens = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [
        `g-${String(index).padStart(5, '0')}-${'x'.repeat(12)}`,
        { value: { $type: 'number' as const, $value: index } },
      ])
    ) as DTCGDocument
    const files = { 'brand.tokens.json': tokens }
    const resolver = input.resolver

    const applyOnlyBudget = outputSummaryBudget()
    const merged = applyResolverWithBudget(files, resolver, {}, applyOnlyBudget)
    expect(applyOnlyBudget.remaining).toBeGreaterThan(0)

    const flattenOnlyBudget = outputSummaryBudget()
    expect(() =>
      flattenTokensWithBudget(merged, flattenOnlyBudget)
    ).not.toThrow()
    expect(flattenOnlyBudget.remaining).toBeGreaterThan(0)

    const sharedBudget = outputSummaryBudget()
    expect(() =>
      flattenTokensWithBudget(
        applyResolverWithBudget(files, resolver, {}, sharedBudget),
        sharedBudget
      )
    ).toThrow(OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE)

    expect(() =>
      buildDTCGOutputs(
        {
          ...input,
          files,
        },
        { css: false, tailwind: false, typescript: false }
      )
    ).toThrow(OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE)
  })

  it('keeps punctuation token paths distinct in generated output', () => {
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

    const output = buildDTCGOutputs({
      ...input,
      files: { 'brand.tokens.json': collidingPaths },
    })

    const css = output.files.find(file => file.path === 'css/tokens.css')
    expect(css?.contents).toContain('--theme-foo_20_bar: 1;')
    expect(css?.contents).toContain('--theme-foo_40_bar: 2;')
  })

  it('keeps CSS custom property names distinct for Tailwind-only output', () => {
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

    const output = buildDTCGOutputs(
      {
        ...input,
        files: { 'brand.tokens.json': collidingPaths },
      },
      { css: false, tailwind: true, typescript: false }
    )

    const tailwind = output.files.find(
      file => file.path === 'css/tokens.tailwind.css'
    )
    expect(tailwind?.contents).toContain('var(--theme-foo_20_bar)')
    expect(tailwind?.contents).toContain('var(--theme-foo_40_bar)')
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

  it('keeps CSS custom property names distinct for TypeScript-only output', () => {
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

    const output = buildDTCGOutputs(
      {
        ...input,
        files: { 'brand.tokens.json': collidingPaths },
      },
      { css: false, tailwind: false, typescript: true }
    )

    const typescript = output.files.find(file => file.path === 'ts/tokens.ts')
    expect(typescript?.contents).toContain('var(--theme-foo_20_bar)')
    expect(typescript?.contents).toContain('var(--theme-foo_40_bar)')
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

  it('rejects a lone surrogate in a Resolver context through the output builder', () => {
    const run = () =>
      buildDTCGOutputs(
        {
          ...input,
          resolver: {
            version: '2025.10',
            sets: {
              base: {
                sources: [{ value: { $type: 'string', $value: 'default' } }],
              },
            },
            modifiers: {
              theme: {
                default: 'light',
                contexts: {
                  light: [],
                  '\ud800': [
                    { value: { $type: 'string', $value: 'selected' } },
                  ],
                },
              },
            },
            resolutionOrder: [
              { $ref: '#/sets/base' },
              { $ref: '#/modifiers/theme' },
            ],
          },
        },
        { tailwind: false, typescript: false }
      )

    expect(run).toThrow(DTCGOutputCapabilityError)
    expect(run).toThrow(
      'The CSS output cannot represent the string value at "resolver context".'
    )
  })
})
