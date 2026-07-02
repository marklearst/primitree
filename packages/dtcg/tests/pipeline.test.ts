import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'
import { toDTCG } from '../src/emit'
import { emitCss, cssVarName, cssValue } from '../src/pipeline/css'
import { emitTailwind } from '../src/pipeline/tailwind'
import { emitTypescript } from '../src/pipeline/typescript'
import { buildPipeline } from '../src/pipeline/build'

const cliPackageManifest = JSON.parse(
  readFileSync(join(__dirname, '../../cli/package.json'), 'utf8')
)
const pipelineSource = readFileSync(
  join(__dirname, '../src/pipeline/build.ts'),
  'utf8'
)

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

  it('labels generated values by their default contexts', () => {
    expect(source).toContain(' * Each modifier axis uses its default context.')
    expect(source).toContain(
      '/** CSS variable references for each token path. */'
    )
    expect(source).not.toContain('every modifier axis')
  })

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

  it('emits syntactically valid TypeScript when no token paths exist', () => {
    const emptySource = emitTypescript(
      {},
      {
        version: '2025.10',
        sets: {},
        resolutionOrder: [],
      }
    )
    const compiled = ts.transpileModule(emptySource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    })

    expect(compiled.diagnostics ?? []).toEqual([])
    expect(emptySource).toContain('export type TokenPath = never')
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
  it('uses singular labels in the generated README summary', () => {
    const collectionId = 'VariableCollectionId:1:100'
    const variableId = 'VariableID:1:101'
    const singleVariableFixture = structuredClone(fixture)
    singleVariableFixture.meta.variableCollections = {
      [collectionId]: {
        ...singleVariableFixture.meta.variableCollections[collectionId],
        variableIds: [variableId],
      },
    }
    singleVariableFixture.meta.variables = {
      [variableId]: singleVariableFixture.meta.variables[variableId],
    }

    const readme = buildPipeline(singleVariableFixture).files.find(
      file => file.path === 'README.md'
    )?.contents

    expect(readme).toContain('Stats: 1 collection, 1 variable, 2 token files.')
  })

  it('documents the DTCG version and boolean extension', () => {
    const readme = buildPipeline(fixture).files.find(
      file => file.path === 'README.md'
    )?.contents

    expect(readme).toContain('DTCG 2025.10 plus a documented boolean extension')
    expect(readme).toContain('## Files')
    expect(readme).not.toContain("## What's here")
    expect(readme).not.toMatch(/[—]/)
  })

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

  it('isolates generated workflow builds from branch write credentials', () => {
    const result = buildPipeline(fixture)
    const workflow = result.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents

    expect(workflow).toBeDefined()
    const document = parseYaml(workflow ?? '')

    expect(document.permissions).toEqual({ contents: 'read' })
    expect(document.on.push.branches).toEqual(['**'])
    expect(Object.keys(document.jobs)).toEqual([
      'build-tokens',
      'commit-tokens',
    ])
    expect(document.jobs['build-tokens'].permissions).toBeUndefined()
    expect(document.jobs['commit-tokens'].permissions).toEqual({
      contents: 'write',
    })
    expect(document.jobs['build-tokens'].if).toBe("github.ref_type == 'branch'")
    expect(document.jobs['commit-tokens'].if).toBe(
      "github.ref_type == 'branch'"
    )

    const buildSteps = document.jobs['build-tokens'].steps as Array<
      Record<string, unknown>
    >
    const commitSteps = document.jobs['commit-tokens'].steps as Array<
      Record<string, unknown>
    >
    const checkoutSteps = [...buildSteps, ...commitSteps].filter(step =>
      String(step.uses ?? '').startsWith('actions/checkout@')
    )

    expect(checkoutSteps).toHaveLength(2)
    for (const checkout of checkoutSteps) {
      expect(checkout.with).toMatchObject({
        ref: '$' + '{{ github.sha }}',
        'persist-credentials': false,
      })
    }

    const buildRuns = buildSteps
      .map(step => step.run)
      .filter((run): run is string => typeof run === 'string')
      .join('\n')
    const commitRuns = commitSteps
      .map(step => step.run)
      .filter((run): run is string => typeof run === 'string')
      .join('\n')

    expect(buildRuns).not.toContain('github.token')
    expect(buildRuns).not.toContain('GITHUB_TOKEN')
    expect(buildRuns).not.toContain('git push')
    expect(commitRuns).toContain('refs/heads/*')
    expect(commitRuns).toContain('git ls-remote --exit-code --refs')
    expect(commitRuns).toContain('"$REMOTE_SHA" != "$GITHUB_SHA"')
    expect(commitRuns).toContain('HEAD:$GITHUB_REF')
    expect(commitRuns).not.toMatch(/git push\s*$/m)
    expect(commitRuns).not.toContain('git add -A')
    expect(commitRuns).toMatch(/git add --all -- [^\n]+/)

    const tokenSteps = commitSteps.filter(step => {
      const env = step.env as Record<string, unknown> | undefined
      return env?.GITHUB_TOKEN === '$' + '{{ github.token }}'
    })
    expect(tokenSteps).toHaveLength(1)
    expect(tokenSteps[0]?.name).toBe('Commit generated tokens')

    for (const step of [...buildSteps, ...commitSteps]) {
      if (typeof step.run !== 'string') {
        continue
      }
      const syntax = spawnSync('bash', ['-n'], {
        encoding: 'utf8',
        input: step.run,
      })
      expect(syntax.status, syntax.stderr).toBe(0)
    }
  })

  it('pins every generated workflow action and executable tool', () => {
    const variants = [
      buildPipeline(fixture),
      buildPipeline(fixture, { transformer: 'terrazzo' }),
      buildPipeline(fixture, { transformer: 'none' }),
    ]

    for (const result of variants) {
      const workflow = result.files.find(
        file => file.path === 'design-tokens.workflow.yml'
      )?.contents

      expect(workflow).toBeDefined()
      expect(workflow).toContain(`@primitree/cli@${cliPackageManifest.version}`)
      expect(pipelineSource).toContain('cliPackageManifest.version')
      expect(pipelineSource).not.toContain("'@primitree/cli@1.0.0'")
      expect(workflow).toContain('./node_modules/.bin/primitree build')
      expect(workflow).toContain('path: .primitree-generated')
      expect(workflow).toContain('primitree-artifact-root.json')
      expect(workflow).toContain('node-version: 24.18.0')
      expect(workflow).not.toMatch(/\bnpx\b/)
      expect(workflow).not.toContain('git add -A')

      for (const action of [
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
        'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
        'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
        'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8',
      ]) {
        expect(workflow).toContain(action)
      }

      const document = parseYaml(workflow ?? '')
      const jobs = Object.values(document.jobs) as Array<{
        steps: Array<Record<string, unknown>>
      }>
      const uses = jobs
        .flatMap(job => job.steps)
        .flatMap(step => (typeof step.uses === 'string' ? [step.uses] : []))
      expect(uses).toEqual([
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
        'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
        'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      ])
      expect(workflow).not.toMatch(/actions\/[a-z-]+@v\d/)
    }

    const styleDictionary = variants[0]?.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents
    expect(styleDictionary).toContain('style-dictionary@5.5.0')
    expect(styleDictionary).toContain('--style-dictionary')
    expect(styleDictionary).not.toContain('@terrazzo/cli@')

    const terrazzo = variants[1]?.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents
    expect(terrazzo).toContain('@terrazzo/cli@2.4.0')
    expect(terrazzo).toContain('@terrazzo/plugin-css@2.4.0')
    expect(terrazzo).toContain('--terrazzo')
    expect(terrazzo).not.toContain('style-dictionary@')

    const noTransformer = variants[2]?.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents
    expect(noTransformer).toContain('--no-transformer')
    expect(noTransformer).not.toContain('style-dictionary@')
    expect(noTransformer).not.toContain('@terrazzo/cli@')
  })

  it('keeps generated workflow output paths aligned with pipeline opt-outs', () => {
    const result = buildPipeline(fixture, {
      transformer: 'none',
      css: false,
      tailwind: false,
      typescript: false,
    })
    const workflow = result.files.find(
      file => file.path === 'design-tokens.workflow.yml'
    )?.contents
    const document = parseYaml(workflow ?? '')
    const buildSteps = document.jobs['build-tokens'].steps as Array<
      Record<string, unknown>
    >
    const commitSteps = document.jobs['commit-tokens'].steps as Array<
      Record<string, unknown>
    >
    const build = buildSteps.find(step => step.name === 'Build token pipeline')
    const seal = buildSteps.find(
      step => step.name === 'Seal generated artifact root'
    )
    const upload = buildSteps.find(
      step => step.name === 'Upload generated tokens'
    )
    const install = commitSteps.find(
      step => step.name === 'Validate and install generated tokens'
    )
    const commit = commitSteps.find(
      step => step.name === 'Commit generated tokens'
    )

    expect(build?.run).toContain(
      '--no-css --no-tailwind --no-ts --no-transformer'
    )
    expect(seal?.run).toContain(
      `printf '%s\\n' '{"schema":1}' > primitree-artifact-root.json`
    )
    expect(upload?.with).toMatchObject({
      path: 'primitree-artifact-root.json\ntokens/\n',
    })
    expect(install?.run).toContain(
      "readFileSync(artifactRootPath, 'utf8') !== artifactRootContents"
    )
    expect(commit?.run).toContain('git add --all -- tokens')
    expect(commit?.run).not.toMatch(/git add --all --[^\n]*\b(css|ts|build)\b/)
  })
})
