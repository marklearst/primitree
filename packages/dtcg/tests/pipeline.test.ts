import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { toDTCG } from '../src/emit'
import { emitCss, cssVarName, cssValue } from '../src/pipeline/css'
import { emitTailwind } from '../src/pipeline/tailwind'
import { emitTypescript } from '../src/pipeline/typescript'
import { buildPipeline } from '../src/pipeline/build'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)
const { files, resolver } = toDTCG(fixture)

describe('cssVarName / cssValue', () => {
  it('converts paths to custom property names', () => {
    expect(cssVarName('semantic.color.bg.brand')).toBe(
      '--semantic-color-bg-brand'
    )
    expect(cssVarName('primitives.space.2')).toBe('--primitives-space-2')
  })

  it('formats values for CSS', () => {
    expect(cssValue({ value: 4, unit: 'px' })).toBe('4px')
    expect(cssValue(0.4)).toBe('0.4')
    expect(cssValue('Inter')).toBe('Inter')
    expect(cssValue('Inter Display')).toBe("'Inter Display'")
    expect(cssValue(true)).toBeNull()
    expect(cssValue('{primitives.color.blue.500}')).toBe(
      'var(--primitives-color-blue-500)'
    )
    expect(
      cssValue({
        colorSpace: 'srgb',
        components: [0.2, 0.4, 1],
        alpha: 1,
        hex: '#3366ff',
      })
    ).toBe('#3366ff')
    expect(
      cssValue({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 })
    ).toBe('rgb(0 0 0 / 0.5)')
  })
})

describe('emitCss', () => {
  const css = emitCss(files, resolver)

  it('emits default values into :root with alias vars preserved', () => {
    expect(css).toContain(':root {')
    expect(css).toContain('--primitives-color-blue-500: #3366ff;')
    expect(css).toContain(
      '--semantic-color-bg-brand: var(--primitives-color-blue-500);'
    )
    expect(css).toContain('--density-control-height: 40px;')
  })

  it('emits only changed properties per non-default context', () => {
    expect(css).toContain("[data-semantic='dark'] {")
    expect(css).toContain(
      '--semantic-color-bg-brand: var(--primitives-color-blue-300);'
    )
    expect(css).toContain("[data-density='compact'] {")
    expect(css).toContain('--density-control-height: 32px;')
    // Unchanged token must not repeat inside the dark block.
    const darkBlock = css.split("[data-semantic='dark'] {")[1]?.split('}')[0]
    expect(darkBlock).not.toContain('--semantic-space-page')
  })

  it('skips boolean tokens', () => {
    expect(css).not.toContain('--primitives-feature-rounded')
  })
})

describe('emitTailwind', () => {
  const tailwind = emitTailwind(files, resolver)

  it('maps tokens onto Tailwind v4 namespaces referencing css vars', () => {
    expect(tailwind).toContain('@theme inline {')
    expect(tailwind).toContain(
      '--color-blue-500: var(--primitives-color-blue-500);'
    )
    expect(tailwind).toContain(
      '--color-bg-brand: var(--semantic-color-bg-brand);'
    )
    expect(tailwind).toContain('--radius-sm: var(--primitives-radius-sm);')
    expect(tailwind).toContain(
      '--font-sans: var(--primitives-font-family-sans);'
    )
  })
})

describe('emitTypescript', () => {
  const source = emitTypescript(files, resolver)

  it('emits token path union, var accessors, and resolved values', () => {
    expect(source).toContain('| "semantic.color.bg.brand"')
    expect(source).toContain(
      '["semantic.color.bg.brand"]: "var(--semantic-color-bg-brand)",'
    )
    expect(source).toContain('["primitives.color.blue.500"]: "#3366ff",')
    expect(source).toContain('["density.control.height"]: "40px",')
    expect(source).toContain('["primitives.feature.rounded"]: true,')
    expect(source).not.toContain('["primitives.feature.rounded"]: "true",')
  })

  it('emits valid TypeScript for hostile paths and string values', () => {
    const hostileGroup = "group'\\line\n\u2028separator"
    const hostileToken = "token'\\line\n\u2028separator"
    const hostilePath = `${hostileGroup}.${hostileToken}`
    const hostileValue = "value'\\line\n\u2028separator"
    const hostileSource = emitTypescript(
      {},
      {
        version: '2025.10',
        sets: {
          hostile: {
            sources: [
              {
                [hostileGroup]: {
                  [hostileToken]: {
                    $type: 'string',
                    $value: hostileValue,
                  },
                },
              },
            ],
          },
        },
        resolutionOrder: [{ $ref: '#/sets/hostile' }],
      }
    )

    const compiled = ts.transpileModule(hostileSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    })

    const pathLiteral = JSON.stringify(hostilePath)
    const keyLiteral = `[${pathLiteral}]`

    expect(compiled.diagnostics ?? []).toEqual([])
    expect(hostileSource).toContain(`| ${pathLiteral}`)
    expect(hostileSource).toContain(
      `${keyLiteral}: ${JSON.stringify(`var(${cssVarName(hostilePath)})`)},`
    )
    expect(hostileSource).toContain(
      `${keyLiteral}: ${JSON.stringify(cssValue(hostileValue))},`
    )
  })

  it('preserves an own __proto__ token in both generated maps at runtime', () => {
    const prototypePath = '__proto__'
    const prototypeValue = 'prototype-value'
    const prototypeSource = emitTypescript(
      {},
      {
        version: '2025.10',
        sets: {
          base: {
            sources: [
              {
                [prototypePath]: {
                  $type: 'string',
                  $value: prototypeValue,
                },
              },
            ],
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      }
    )
    const compiled = ts.transpileModule(prototypeSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
      reportDiagnostics: true,
    })
    const generated: {
      tokenVars?: Record<string, string>
      tokenValues?: Record<string, string>
    } = {}

    expect(compiled.diagnostics ?? []).toEqual([])
    runInNewContext(compiled.outputText, { exports: generated })

    expect(Object.hasOwn(generated.tokenVars ?? {}, prototypePath)).toBe(true)
    expect(generated.tokenVars?.[prototypePath]).toBe('var(--proto)')
    expect(Object.hasOwn(generated.tokenValues ?? {}, prototypePath)).toBe(true)
    expect(generated.tokenValues?.[prototypePath]).toBe(prototypeValue)
  })
})

describe('buildPipeline', () => {
  it('produces the full file set with summary', () => {
    const result = buildPipeline(fixture, { resolverName: 'Acme' })
    const paths = result.files.map(f => f.path)

    expect(paths).toContain('tokens/primitives.tokens.json')
    expect(paths).toContain('tokens/semantic.dark.tokens.json')
    expect(paths).toContain('tokens/tokens.resolver.json')
    expect(paths).toContain('css/tokens.css')
    expect(paths).toContain('css/tokens.tailwind.css')
    expect(paths).toContain('ts/tokens.ts')
    expect(paths).toContain('style-dictionary.config.mjs')
    expect(paths).toContain('design-tokens.workflow.yml')
    expect(paths).toContain('README.md')

    expect(result.summary.collections).toBe(3)
    expect(result.summary.variables).toBe(12)
    expect(result.summary.contexts).toEqual({
      semantic: ['light', 'dark'],
      density: ['comfortable', 'compact'],
    })
  })

  it('honors opt-outs and the terrazzo transformer', () => {
    const result = buildPipeline(fixture, {
      transformer: 'terrazzo',
      tailwind: false,
      typescript: false,
      githubAction: false,
      readme: false,
    })
    const paths = result.files.map(f => f.path)
    expect(paths).toContain('terrazzo.config.mjs')
    expect(paths).not.toContain('style-dictionary.config.mjs')
    expect(paths).not.toContain('css/tokens.tailwind.css')
    expect(paths).not.toContain('ts/tokens.ts')
    expect(paths).not.toContain('design-tokens.workflow.yml')
    expect(paths).not.toContain('README.md')
  })

  it('style dictionary config sources only base token files', () => {
    const result = buildPipeline(fixture)
    const config = result.files.find(
      f => f.path === 'style-dictionary.config.mjs'
    )
    expect(config?.contents).toContain("'tokens/primitives.tokens.json'")
    expect(config?.contents).toContain("'tokens/semantic.tokens.json'")
    expect(config?.contents).not.toContain('semantic.dark.tokens.json')
  })

  it('pins generated workflow actions to reviewed revisions', () => {
    const result = buildPipeline(fixture)
    const workflow = result.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents

    expect(workflow).toContain(
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4'
    )
    expect(workflow).toContain(
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4'
    )
    expect(workflow).not.toContain('actions/checkout@v4')
    expect(workflow).not.toContain('actions/setup-node@v4')
  })
})
