import {
  buildDTCGOutputs,
  buildPipeline,
  type BuildPipelineOptions,
  type DTCGDocument,
  type PipelineFile,
} from '@primitree/dtcg'
import path from 'node:path'
import { createPolicy, evaluatePolicy } from '@primitree/core/policy'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import { inspectBuildOutput, installBuildOutput } from '../build-output'
import type { PrimitreeOutputFormat } from '../config'
import { loadConfiguredSourceGraph } from '../config/source'
import { readJsonFile, writePipelineFiles } from '../io'
import { createBuildManifest } from '../output-manifest'

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export const buildHelp = `
primitree build: check a local DTCG source and write token files

Usage:
  primitree build [--config <file>] [--source <name>]
  primitree build --check [--config <file>] [--source <name>]
  primitree build <variables.json> [--out <dir>] [older options]

Configured output:
  tokens/source.tokens.json     Checked DTCG source
  tokens/tokens.resolver.json   Resolver file for the source
  css/tokens.css                CSS custom properties
  css/tokens.tailwind.css       Tailwind CSS v4 @theme mapping
  ts/tokens.ts                  Typed token paths and values
  .primitree-manifest.json      Generated-file hashes and source name

Configured options:
  --config <file>        Config file (default: primitree.config.ts)
  --source <name>        Source name when the config has several sources
  --check                Report missing, changed, and unexpected files without writing

Older Figma output:
  tokens/*.tokens.json          DTCG 2025.10 tokens plus the documented Primitree boolean extension
  tokens/tokens.resolver.json   Resolver mapping Figma modes to contexts
  css/tokens.css                CSS custom properties with [data-*] theme blocks
  css/tokens.tailwind.css       Tailwind CSS v4 @theme mapping
  ts/tokens.ts                  Typed token paths and values
  style-dictionary.config.mjs   Style Dictionary config (or terrazzo.config.mjs)
  design-tokens.workflow.yml    GitHub Actions template
  README.md                     Generated file reference and rebuild command

Older Figma options:
  --out <dir>            Output directory (default: design-tokens)
  --terrazzo             Generate a Terrazzo config
  --style-dictionary     Generate a Style Dictionary config (default)
  --no-transformer       Skip transformer config
  --no-css               Skip css/tokens.css
  --no-tailwind          Skip css/tokens.tailwind.css
  --no-ts                Skip ts/tokens.ts
  --no-github-action     Skip the workflow template
  --no-readme            Skip the generated README
  --name <name>          Resolver document name
`

export interface BuildFlagsResult {
  input: string
  outDir: string
  options: BuildPipelineOptions
}

export function parseBuildFlags(args: ParsedArgs): BuildFlagsResult {
  const input = args.positionals[0]
  if (!input) {
    throw new Error(
      'Missing input file. Usage: primitree build <variables.json>'
    )
  }
  const outDir = getStringFlag(args.flags, 'out') ?? 'design-tokens'

  const options: BuildPipelineOptions = {}
  if (getBooleanFlag(args.flags, 'terrazzo')) {
    options.transformer = 'terrazzo'
  } else if (getBooleanFlag(args.flags, 'style-dictionary')) {
    options.transformer = 'style-dictionary'
  }
  if (getBooleanFlag(args.flags, 'no-transformer')) {
    options.transformer = 'none'
  }
  if (getBooleanFlag(args.flags, 'no-css')) {
    options.css = false
  }
  if (getBooleanFlag(args.flags, 'no-tailwind')) {
    options.tailwind = false
  }
  if (getBooleanFlag(args.flags, 'no-ts')) {
    options.typescript = false
  }
  if (getBooleanFlag(args.flags, 'no-github-action')) {
    options.githubAction = false
  }
  if (getBooleanFlag(args.flags, 'no-readme')) {
    options.readme = false
  }
  const name = getStringFlag(args.flags, 'name')
  if (name) {
    options.resolverName = name
  }
  return { input, outDir, options }
}

export async function runBuild(args: ParsedArgs): Promise<void> {
  if (
    args.positionals.length === 0 ||
    args.flags.config !== undefined ||
    args.flags.source !== undefined ||
    args.flags.check !== undefined
  ) {
    await runConfiguredBuild(args)
    return
  }
  const { input, outDir, options } = parseBuildFlags(args)
  const variables = await readJsonFile(input)
  const result = buildPipeline(variables, options)

  await writePipelineFiles(outDir, result.files)

  const { summary } = result
  console.log(
    `Wrote ${formatCount(summary.variables, 'token')} from ` +
      `${formatCount(summary.collections, 'collection')} ` +
      `to ${outDir}/`
  )
  for (const file of summary.files) {
    console.log(`  ${file}`)
  }
  const axes = Object.entries(summary.contexts)
  if (axes.length > 0) {
    console.log('Contexts:')
    for (const [axis, contexts] of axes) {
      console.log(`  ${axis}: ${contexts.join(', ')}`)
    }
  }
  if (result.warnings.length > 0) {
    console.warn(`Warnings (${result.warnings.length}):`)
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`)
    }
  }
}

const CONFIG_BUILD_FLAGS = new Set(['config', 'source', 'check'])

function selectedFiles(
  files: readonly PipelineFile[],
  formats: readonly PrimitreeOutputFormat[]
): PipelineFile[] {
  const selected = new Set(formats)
  return files.filter(file => {
    if (file.path.startsWith('tokens/')) {
      return selected.has('dtcg')
    }
    if (file.path === 'css/tokens.css') {
      return selected.has('css')
    }
    if (file.path === 'css/tokens.tailwind.css') {
      return selected.has('tailwind')
    }
    if (file.path === 'ts/tokens.ts') {
      return selected.has('typescript')
    }
    return false
  })
}

async function runConfiguredBuild(args: ParsedArgs): Promise<void> {
  if (args.duplicateFlags.length > 0) {
    throw new Error(`Duplicate option: --${args.duplicateFlags[0]}`)
  }
  if (args.positionals.length > 0) {
    throw new Error('Configured build does not accept a path argument.')
  }
  for (const flag of Object.keys(args.flags)) {
    if (!CONFIG_BUILD_FLAGS.has(flag)) {
      throw new Error(`Unknown option: --${flag}`)
    }
  }
  const configFlag = args.flags.config
  if (configFlag === true) {
    throw new Error('--config needs a file path.')
  }
  const sourceFlag = args.flags.source
  if (sourceFlag === true) {
    throw new Error('--source needs a source name.')
  }
  if (typeof args.flags.check === 'string') {
    throw new Error('--check does not take a value.')
  }

  const configured = await loadConfiguredSourceGraph({
    ...(typeof configFlag === 'string' ? { configPath: configFlag } : {}),
    ...(typeof sourceFlag === 'string' ? { sourceName: sourceFlag } : {}),
  })
  const outputs = configured.source.outputs
  if (outputs === undefined) {
    throw new Error(
      `Source "${configured.sourceName}" needs output settings before it can build.`
    )
  }
  const policy = createPolicy({
    id: configured.sourceName,
    viewId: configured.sourceName,
    layers: configured.source.architecture.layers,
    ownership: configured.source.ownership,
  })
  if (!policy.ok) {
    throw new Error(policy.diagnostics.map(item => item.message).join('\n'))
  }
  const report = evaluatePolicy(
    { graph: configured.graph, view: configured.view },
    policy.value
  )
  if (!report.ok) {
    throw new Error(report.diagnostics.map(item => item.message).join('\n'))
  }
  if (report.value.findings.length > 0) {
    for (const finding of report.value.findings) {
      console.error(
        `${finding.ruleId} ${finding.path.join('.')}: ${finding.message}`
      )
    }
    console.error(
      `Build stopped with ${formatCount(report.value.summary.active, 'active finding')} for source "${configured.sourceName}".`
    )
    process.exitCode = 1
    return
  }
  const selectedFormats = new Set(outputs.formats)
  const result = buildDTCGOutputs(
    {
      files: {
        'source.tokens.json': configured.document as DTCGDocument,
      },
      resolver: {
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      },
      resolverFileName: 'tokens.resolver.json',
    },
    {
      css: selectedFormats.has('css'),
      tailwind: selectedFormats.has('tailwind'),
      typescript: selectedFormats.has('typescript'),
    }
  )
  const files = selectedFiles(result.files, outputs.formats)
  const sourceFile = result.files.find(
    file => file.path === 'tokens/source.tokens.json'
  )
  if (sourceFile === undefined) {
    throw new Error('DTCG output did not include the configured source file.')
  }
  files.push(
    createBuildManifest({
      source: configured.sourceName,
      sourceContents: sourceFile.contents,
      formats: outputs.formats,
      files,
    })
  )

  if (args.flags.check === true) {
    const state = await inspectBuildOutput(outputs.directory, files)
    if (state.status === 'current') {
      console.log(
        `Build output is current for source "${configured.sourceName}".`
      )
      return
    }
    for (const item of state.paths) {
      console.log(`${item.kind} ${item.path}`)
    }
    console.log(`Build output differs for source "${configured.sourceName}".`)
    process.exitCode = 1
    return
  }

  const installState = await installBuildOutput(
    outputs.directory,
    files,
    configured.sourceName,
    path.dirname(configured.configPath)
  )
  if (installState === 'current') {
    console.log(
      `Build output is current for source "${configured.sourceName}".`
    )
    return
  }
  console.log(
    `Built ${formatCount(files.length, 'file')} for source "${configured.sourceName}" in ${outputs.directory}.`
  )
}
