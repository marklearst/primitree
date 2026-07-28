import { buildPipeline, type BuildPipelineOptions } from '@primitree/dtcg'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import { readJsonFile, writePipelineFiles } from '../io'

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export const buildHelp = `
primitree build: convert Figma variables JSON into token files and code

Usage:
  primitree build <variables.json> [--out <dir>] [options]

Output:
  tokens/*.tokens.json          DTCG 2025.10 tokens plus the documented Primitree boolean extension
  tokens/tokens.resolver.json   Resolver mapping Figma modes to contexts
  css/tokens.css                CSS custom properties with [data-*] theme blocks
  css/tokens.tailwind.css       Tailwind CSS v4 @theme mapping
  ts/tokens.ts                  Typed token paths and values
  style-dictionary.config.mjs   Style Dictionary config (or terrazzo.config.mjs)
  design-tokens.workflow.yml    GitHub Actions template
  README.md                     Generated file reference and rebuild command

Options:
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
