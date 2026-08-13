import { toDTCG, type ToDTCGOptions } from '../emit'
import {
  applyResolverWithBudget,
  chargeResolverWork,
  flattenTokensWithBudget,
  listContextsWithBudget,
  type ResolverWorkBudget,
} from '../resolve'
import type { DTCGDocument, ResolverDocument } from '../types'
import { emitCss } from './css'
import { emitTailwind } from './tailwind'
import { emitTypescript } from './typescript'
import { hasLoneUtf16Surrogate } from './unicode'
import cliPackageManifest from '../../../cli/package.json' with { type: 'json' }

export { DTCGOutputCapabilityError } from './output-error'

/** The pipeline returns each output file in this form. @public */
export interface PipelineFile {
  /** Relative path inside the output directory. */
  path: string
  contents: string
}

/**
 * Checked DTCG files and the Resolver that selects them.
 *
 * @remarks
 * File names are relative to the Resolver file. Token files may use nested
 * paths, such as `themes/dark.tokens.json`. Each path segment can contain at
 * most 255 UTF-8 bytes. Primitree readers look for a Resolver named
 * `tokens.resolver.json`.
 *
 * @public
 */
export interface DTCGOutputSet {
  /** Token files keyed by their path from the Resolver file. */
  readonly files: Record<string, DTCGDocument>
  /** Resolver used to select the token files and contexts. */
  readonly resolver: ResolverDocument
  /** Required file name for the Resolver output. */
  readonly resolverFileName: 'tokens.resolver.json'
}

/**
 * Options for CSS, Tailwind, and TypeScript files from
 * {@link buildDTCGOutputs}.
 *
 * @remarks
 * Token JSON and the Resolver are always returned. Each option defaults to
 * `true`.
 *
 * @public
 */
export interface BuildOutputOptions {
  /** Emit `css/tokens.css`. Default: `true`. */
  readonly css?: boolean
  /** Emit `css/tokens.tailwind.css`. Default: `true`. */
  readonly tailwind?: boolean
  /** Emit `ts/tokens.ts`. Default: `true`. */
  readonly typescript?: boolean
}

/** Options for {@link buildPipeline}. @public */
export interface BuildPipelineOptions extends ToDTCGOptions {
  /** Choose the transformer config to scaffold. Default: `style-dictionary`. */
  transformer?: 'style-dictionary' | 'terrazzo' | 'none'
  /** Emit css/tokens.css. Default: true. */
  css?: boolean
  /** Emit css/tokens.tailwind.css (Tailwind v4 @theme). Default: true. */
  tailwind?: boolean
  /** Emit ts/tokens.ts. Default: true. */
  typescript?: boolean
  /** Emit a GitHub Actions workflow template. Default: true. */
  githubAction?: boolean
  /** Emit a README into the output directory. Default: true. */
  readme?: boolean
}

/** Summary statistics for reporting. @public */
export interface PipelineSummary {
  collections: number
  variables: number
  tokenFiles: number
  contexts: Record<string, string[]>
  files: string[]
}

/** Result of {@link buildPipeline}. @public */
export interface BuildPipelineResult {
  files: PipelineFile[]
  warnings: string[]
  summary: PipelineSummary
}

const MAX_OUTPUT_TOKEN_FILES = 1_000
const MAX_OUTPUT_JSON_DEPTH = 64
const MAX_OUTPUT_JSON_ITEMS = 100_000
const MAX_OUTPUT_JSON_TEXT = 20 * 1024 * 1024
const MAX_OUTPUT_SUMMARY_WORK = 1_000_000
const MAX_PORTABLE_OUTPUT_PATH_SEGMENT_BYTES = 255
const OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE =
  'DTCG output summary exceeds the 1,000,000-unit work limit.'
const OUTPUT_SUMMARY_DEPTH_LIMIT_MESSAGE =
  'DTCG output summary can read at most 64 token-group levels.'

interface JsonSortBudget {
  items: number
  textBytes: number
}

function utf8ByteLengthWithin(value: string, maxBytes: number): number {
  if (value.length > maxBytes) {
    return maxBytes + 1
  }

  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7f) {
      bytes += 1
    } else if (codeUnit <= 0x7ff) {
      bytes += 2
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length
    ) {
      const nextCodeUnit = value.charCodeAt(index + 1)
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }

    if (bytes > maxBytes) {
      return maxBytes + 1
    }
  }
  return bytes
}

function chargeJsonBudget(
  budget: JsonSortBudget,
  items: number,
  text?: string
): void {
  budget.items += items
  if (budget.items > MAX_OUTPUT_JSON_ITEMS) {
    throw new TypeError('DTCG output data can contain at most 100,000 items.')
  }

  if (text !== undefined) {
    const remainingBytes = MAX_OUTPUT_JSON_TEXT - budget.textBytes
    const addedBytes = utf8ByteLengthWithin(text, remainingBytes)
    if (addedBytes > remainingBytes) {
      throw new TypeError('DTCG output text can contain at most 20 MiB.')
    }
    budget.textBytes += addedBytes
  }
}

function sortJsonValue(
  value: unknown,
  active: WeakSet<object>,
  budget: JsonSortBudget,
  depth: number,
  path: readonly string[],
  preserveResolverOrder: boolean
): unknown {
  if (depth > MAX_OUTPUT_JSON_DEPTH) {
    throw new TypeError('DTCG output data can contain at most 64 levels.')
  }
  chargeJsonBudget(budget, 1, typeof value === 'string' ? value : undefined)
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (active.has(value)) {
    throw new TypeError('DTCG output data cannot contain a cycle.')
  }
  active.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_OUTPUT_JSON_ITEMS - budget.items) {
        throw new TypeError(
          'DTCG output data can contain at most 100,000 items.'
        )
      }
      return value.map((item, index) =>
        sortJsonValue(
          item,
          active,
          budget,
          depth + 1,
          [...path, String(index)],
          preserveResolverOrder
        )
      )
    }
    const sorted = Object.create(null) as Record<string, unknown>
    const keys = Object.keys(value)
    chargeJsonBudget(budget, keys.length)
    for (const key of keys) {
      chargeJsonBudget(budget, 0, key)
    }
    const isResolverModifierMap =
      preserveResolverOrder && path.length === 1 && path[0] === 'modifiers'
    const isResolverContextMap =
      preserveResolverOrder &&
      path.length === 3 &&
      path[0] === 'modifiers' &&
      path[2] === 'contexts'
    const orderedKeys =
      isResolverModifierMap || isResolverContextMap ? keys : keys.sort()
    for (const key of orderedKeys) {
      Object.defineProperty(sorted, key, {
        value: sortJsonValue(
          Reflect.get(value as Record<string, unknown>, key),
          active,
          budget,
          depth + 1,
          [...path, key],
          preserveResolverOrder
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return sorted
  } finally {
    active.delete(value)
  }
}

function serializeSorted(
  value: unknown,
  budget: JsonSortBudget,
  preserveResolverOrder = false
): string {
  const text = `${JSON.stringify(
    sortJsonValue(value, new WeakSet(), budget, 0, [], preserveResolverOrder),
    null,
    2
  )}\n`
  if (utf8ByteLengthWithin(text, MAX_OUTPUT_JSON_TEXT) > MAX_OUTPUT_JSON_TEXT) {
    throw new TypeError('A DTCG output file can contain at most 20 MiB.')
  }
  return text
}

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//u
const WINDOWS_INVALID_PATH_CHARACTER = /[<>:"|?*]/u
const WINDOWS_RESERVED_FILE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function isWindowsIncompatiblePathSegment(value: string): boolean {
  return (
    WINDOWS_INVALID_PATH_CHARACTER.test(value) ||
    WINDOWS_RESERVED_FILE_NAME.test(value) ||
    value.endsWith('.') ||
    value.endsWith(' ')
  )
}

function validateRelativeOutputPath(value: string, label: string): void {
  if (hasLoneUtf16Surrogate(value)) {
    throw new Error(
      `The DTCG ${label} path cannot contain a lone UTF-16 surrogate.`
    )
  }
  const segments = value.split('/')
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    WINDOWS_DRIVE_PATH.test(value) ||
    value.includes('\\') ||
    segments.some(
      segment =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        hasControlCharacter(segment) ||
        isWindowsIncompatiblePathSegment(segment)
    )
  ) {
    throw new Error(`Unsafe DTCG ${label} path: "${value}".`)
  }
  if (
    segments.some(
      segment =>
        utf8ByteLengthWithin(segment, MAX_PORTABLE_OUTPUT_PATH_SEGMENT_BYTES) >
        MAX_PORTABLE_OUTPUT_PATH_SEGMENT_BYTES
    )
  ) {
    throw new Error(
      `The DTCG ${label} path segment can contain at most ${MAX_PORTABLE_OUTPUT_PATH_SEGMENT_BYTES} UTF-8 bytes.`
    )
  }
}

function portablePathComparisonKey(value: string): string {
  return value.normalize('NFC').toLowerCase().toUpperCase().normalize('NFC')
}

function validateDTCGOutputPaths(input: DTCGOutputSet): void {
  const tokenFileNames = Object.keys(input.files)
  if (tokenFileNames.length > MAX_OUTPUT_TOKEN_FILES) {
    throw new Error('A DTCG output set can contain at most 1,000 token files.')
  }
  if (input.resolverFileName !== 'tokens.resolver.json') {
    throw new Error(
      'The DTCG Resolver file name must be "tokens.resolver.json".'
    )
  }
  const claimed = new Map<string, string>()
  for (const name of [...tokenFileNames, input.resolverFileName]) {
    if (name !== input.resolverFileName || Object.hasOwn(input.files, name)) {
      validateRelativeOutputPath(name, 'token file')
    }
    const key = portablePathComparisonKey(name)
    const existing = claimed.get(key)
    if (existing !== undefined) {
      throw new Error(`DTCG output paths collide: "${existing}" and "${name}".`)
    }
    claimed.set(key, name)
  }
  for (const [key, name] of claimed) {
    let separator = key.indexOf('/')
    while (separator !== -1) {
      const parent = claimed.get(key.slice(0, separator))
      if (parent !== undefined) {
        throw new Error(`DTCG output paths collide: "${parent}" and "${name}".`)
      }
      separator = key.indexOf('/', separator + 1)
    }
  }
}

function assertUnicodeScalarResolverNames(
  contextsByAxis: Readonly<Record<string, readonly string[]>>,
  budget: ResolverWorkBudget
): void {
  for (const [axis, contexts] of Object.entries(contextsByAxis)) {
    chargeResolverWork(budget, axis.length + 1)
    if (hasLoneUtf16Surrogate(axis)) {
      throw new Error(
        'The DTCG Resolver axis name cannot contain a lone UTF-16 surrogate.'
      )
    }
    for (const context of contexts) {
      chargeResolverWork(budget, context.length + 1)
      if (hasLoneUtf16Surrogate(context)) {
        throw new Error(
          'The DTCG Resolver context name cannot contain a lone UTF-16 surrogate.'
        )
      }
    }
  }
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function styleDictionaryConfig(baseFiles: string[]): string {
  return `/**
 * @primitree/cli Style Dictionary configuration.
 *
 * The config reads base token files for default modes. Use css/tokens.css
 * or a Resolver-aware tool such as Terrazzo for mode overrides.
 *
 * Docs: https://styledictionary.com
 */
export default {
  source: [${baseFiles.map(f => `'tokens/${f}'`).join(', ')}],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'build/css/',
      files: [
        {
          destination: 'variables.css',
          format: 'css/variables',
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'build/js/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
      ],
    },
  },
}
`
}

function terrazzoConfig(): string {
  return `/**
 * @primitree/cli Terrazzo configuration.
 *
 * Terrazzo reads modes and themes from the DTCG Resolver as contexts.
 * Use @terrazzo/cli 2.x. For 1.x, set \`tokens\` to
 * ['./tokens/*.tokens.json'].
 *
 * Docs: https://terrazzo.app/docs
 */
import { defineConfig } from '@terrazzo/cli'
import css from '@terrazzo/plugin-css'

export default defineConfig({
  tokens: './tokens/tokens.resolver.json',
  outDir: './build/',
  plugins: [
    css({
      filename: 'tokens.css',
    }),
  ],
})
`
}

interface GeneratedWorkflowEntry {
  path: string
  kind: 'directory' | 'file'
}

function githubWorkflow(
  options: Required<
    Pick<
      BuildPipelineOptions,
      'transformer' | 'css' | 'tailwind' | 'typescript'
    >
  >
): string {
  const toolPackages = [`@primitree/cli@${cliPackageManifest.version}`]
  const buildFlags = ['--no-github-action', '--no-readme']
  const generatedEntries: GeneratedWorkflowEntry[] = [
    { path: 'tokens', kind: 'directory' },
  ]

  if (options.css) {
    generatedEntries.push({ path: 'css/tokens.css', kind: 'file' })
  } else {
    buildFlags.push('--no-css')
  }
  if (options.tailwind) {
    generatedEntries.push({
      path: 'css/tokens.tailwind.css',
      kind: 'file',
    })
  } else {
    buildFlags.push('--no-tailwind')
  }
  if (options.typescript) {
    generatedEntries.push({ path: 'ts/tokens.ts', kind: 'file' })
  } else {
    buildFlags.push('--no-ts')
  }

  let transformStep = ''
  if (options.transformer === 'terrazzo') {
    toolPackages.push('@terrazzo/cli@2.4.0', '@terrazzo/plugin-css@2.4.0')
    buildFlags.push('--terrazzo')
    generatedEntries.push(
      { path: 'terrazzo.config.mjs', kind: 'file' },
      { path: 'build', kind: 'directory' }
    )
    transformStep = `
      - name: Run Terrazzo
        run: ./node_modules/.bin/terrazzo build`
  } else if (options.transformer === 'style-dictionary') {
    toolPackages.push('style-dictionary@5.5.0')
    buildFlags.push('--style-dictionary')
    generatedEntries.push(
      { path: 'style-dictionary.config.mjs', kind: 'file' },
      { path: 'build', kind: 'directory' }
    )
    transformStep = `
      - name: Run Style Dictionary
        run: ./node_modules/.bin/style-dictionary build --config style-dictionary.config.mjs`
  } else {
    buildFlags.push('--no-transformer')
  }

  const artifactPaths = generatedEntries
    .map(
      entry =>
        `            ${entry.path}${entry.kind === 'directory' ? '/' : ''}`
    )
    .join('\n')
  const artifactRootName = 'primitree-artifact-root.json'
  const artifactRootContents = '{"schema":1}\n'
  const stagePaths = generatedEntries.map(entry => entry.path).join(' ')
  const serializedEntries = JSON.stringify(generatedEntries)

  return `# @primitree/cli workflow for design-token exports.
# GitHub Actions rebuilds the token pipeline after variables.json changes.
# Store this file at .github/workflows/design-tokens.yml.
name: Design Tokens

on:
  push:
    branches: ['**']
    paths:
      - 'variables.json'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-tokens:
    if: github.ref_type == 'branch'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source revision
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          ref: \${{ github.sha }}
          persist-credentials: false

      - name: Setup Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24.18.0

      - name: Install pinned token tools
        run: >-
          npm install --no-save --package-lock=false --ignore-scripts
          --audit=false --fund=false --registry=https://registry.npmjs.org
          ${toolPackages.join(' ')}

      - name: Build token pipeline
        run: ./node_modules/.bin/primitree build variables.json --out . ${buildFlags.join(' ')}
${transformStep}

      - name: Seal generated artifact root
        run: |
          rm -f ${artifactRootName}
          printf '%s\\n' '{"schema":1}' > ${artifactRootName}

      - name: Upload generated tokens
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        with:
          name: design-tokens-\${{ github.sha }}
          path: |
            ${artifactRootName}
${artifactPaths}
          if-no-files-found: error

  commit-tokens:
    needs: build-tokens
    if: github.ref_type == 'branch'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout source revision
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          ref: \${{ github.sha }}
          persist-credentials: false

      - name: Setup Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24.18.0

      - name: Download generated tokens
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8
        with:
          name: design-tokens-\${{ github.sha }}
          path: .primitree-generated

      - name: Validate and install generated tokens
        run: |
          node --input-type=module <<'NODE'
          import {
            cpSync,
            lstatSync,
            mkdirSync,
            readFileSync,
            readdirSync,
            rmSync,
          } from 'node:fs'
          import { basename, dirname, join, resolve, sep } from 'node:path'

          const entries = ${serializedEntries}
          const artifactRootName = ${JSON.stringify(artifactRootName)}
          const artifactRootContents = ${JSON.stringify(artifactRootContents)}
          const staging = resolve('.primitree-generated')
          const workspace = resolve('.')
          const expectedTopLevel = [
            artifactRootName,
            ...new Set(entries.map(entry => entry.path.split('/')[0])),
          ].sort()
          const actualTopLevel = readdirSync(staging).sort()

          if (JSON.stringify(actualTopLevel) !== JSON.stringify(expectedTopLevel)) {
            throw new Error('generated artifact contains an unexpected top-level path')
          }

          const validateTree = target => {
            const stats = lstatSync(target)
            if (stats.isSymbolicLink()) {
              throw new Error('generated artifact must not contain symbolic links')
            }
            if (basename(target) === '.git') {
              throw new Error('generated artifact must not contain Git metadata')
            }
            if (stats.isDirectory()) {
              for (const child of readdirSync(target)) {
                validateTree(join(target, child))
              }
              return
            }
            if (!stats.isFile()) {
              throw new Error('generated artifact entries must be files or directories')
            }
          }
          validateTree(staging)
          const artifactRootPath = join(staging, artifactRootName)
          if (
            !lstatSync(artifactRootPath).isFile() ||
            readFileSync(artifactRootPath, 'utf8') !== artifactRootContents
          ) {
            throw new Error('generated artifact root anchor is invalid')
          }

          for (const entry of entries) {
            const source = join(staging, entry.path)
            const sourceStats = lstatSync(source)
            if (
              (entry.kind === 'directory' && !sourceStats.isDirectory()) ||
              (entry.kind === 'file' && !sourceStats.isFile())
            ) {
              throw new Error(
                'generated artifact entry has wrong type: ' + entry.path
              )
            }

            const target = resolve(entry.path)
            if (!target.startsWith(workspace + sep)) {
              throw new Error('generated artifact target escapes the workspace')
            }
            rmSync(target, { recursive: true, force: true })
            mkdirSync(dirname(target), { recursive: true })
            cpSync(source, target, { recursive: entry.kind === 'directory' })
          }
          NODE

      - name: Commit generated tokens
        run: |
          set -euo pipefail
          case "$GITHUB_REF" in
            refs/heads/*) ;;
            *) echo 'Refusing to push a non-branch ref' >&2; exit 1 ;;
          esac
          if [[ ! "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
            echo 'Invalid GitHub repository identity' >&2
            exit 1
          fi
          if [[ ! "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]]; then
            echo 'Invalid triggering revision' >&2
            exit 1
          fi
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add --all -- ${stagePaths}
          if git diff --staged --quiet; then
            exit 0
          fi

          ASKPASS=$(mktemp)
          trap 'rm -f "$ASKPASS"' EXIT
          cat >"$ASKPASS" <<'ASKPASS_SCRIPT'
          #!/bin/sh
          case "$1" in
            *Username*) printf '%s\\n' x-access-token ;;
            *Password*) printf '%s\\n' "$GITHUB_TOKEN" ;;
            *) exit 1 ;;
          esac
          ASKPASS_SCRIPT
          chmod 700 "$ASKPASS"
          REMOTE_URL="https://github.com/$GITHUB_REPOSITORY.git"
          REMOTE_SHA=$(GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 git ls-remote --exit-code --refs "$REMOTE_URL" "$GITHUB_REF" | awk '{print $1}')
          if [[ "$REMOTE_SHA" != "$GITHUB_SHA" ]]; then
            echo 'The triggering branch moved; refusing to overwrite it' >&2
            exit 1
          fi

          git -c core.hooksPath=/dev/null commit -m 'chore(tokens): rebuild from variables.json'
          GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null push "$REMOTE_URL" "HEAD:$GITHUB_REF"
        env:
          GITHUB_TOKEN: \${{ github.token }}
`
}

function pipelineReadme(
  summary: PipelineSummary,
  options: Required<
    Pick<
      BuildPipelineOptions,
      'transformer' | 'css' | 'tailwind' | 'typescript'
    >
  >
): string {
  const axes = Object.entries(summary.contexts)
  const contextDocs =
    axes.length > 0
      ? axes
          .map(
            ([axis, contexts]) =>
              `- \`${axis}\`: ${contexts.map(c => `\`${c}\``).join(', ')}`
          )
          .join('\n')
      : '- (no multi-mode collections)'

  return `# Design Tokens

[\`@primitree/cli\`](https://github.com/marklearst/primitree) built these token files from a Figma variables export.

The token JSON follows DTCG 2025.10 plus a documented boolean extension.

## Files

| Path | Purpose |
| --- | --- |
| \`tokens/*.tokens.json\` | Token files for each Figma collection and extra mode |
| \`tokens/tokens.resolver.json\` | Resolver mapping Figma modes to contexts |
${options.css ? '| `css/tokens.css` | CSS custom properties with `data-*` context selectors |\n' : ''}${options.tailwind ? '| `css/tokens.tailwind.css` | Tailwind CSS v4 `@theme` mapping |\n' : ''}${options.typescript ? '| `ts/tokens.ts` | Typed token paths, `var()` accessors, resolved values |\n' : ''}${options.transformer !== 'none' ? `| \`${options.transformer === 'terrazzo' ? 'terrazzo.config.mjs' : 'style-dictionary.config.mjs'}\` | ${options.transformer === 'terrazzo' ? 'Terrazzo' : 'Style Dictionary'} config |\n` : ''}
## Contexts

${contextDocs}

Set data attributes to select browser contexts:

\`\`\`html
<html data-semantic="dark">
\`\`\`

## Regenerate

\`\`\`sh
npx @primitree/cli build variables.json --out .
\`\`\`

Stats: ${formatCount(summary.collections, 'collection')}, ${formatCount(summary.variables, 'variable')}, ${formatCount(summary.tokenFiles, 'token file')}.
`
}

/**
 * Build DTCG, CSS, TypeScript, and Tailwind files in memory.
 *
 * @remarks
 * The input must contain checked local DTCG files and a Resolver that selects
 * them. This function does not read or write files. Projects may select
 * Tailwind output without CSS if they supply matching custom properties.
 *
 * The function accepts at most 1,000 token files. JSON sorting stops after 64
 * levels, 100,000 items, or 20 MiB of names and string values. These limits
 * apply before the function creates CSS or TypeScript text. The generated
 * Resolver keeps modifier and context order. This preserves CSS rule order and
 * each modifier’s fallback context when tools load the file again.
 *
 * The summary reads at most 64 token-group levels. Its 1,000,000-unit work
 * limit counts Resolver reads and token merges.
 *
 * CSS and Tailwind evaluate at most 1,000 active-context permutations. CSS,
 * Tailwind, and TypeScript read at most 64 token-group levels and return at
 * most 20 MiB. Tailwind reads at most 100,000 items per context. Each output
 * has a 1,000,000-unit work limit. CSS counts active Resolver contexts, token
 * merges, value comparisons, declarations, token paths, and token text.
 * Tailwind counts active Resolver contexts, token merges, token walking, alias
 * type resolution, namespace checks, token paths, name allocation, and output
 * text. TypeScript also counts flattening, reference resolution, token paths,
 * sorting, and value serialization.
 *
 * @param input - Checked token files and their Resolver.
 * @param options - CSS, Tailwind, and TypeScript files to include.
 * @returns Candidate files, counts, contexts, and an empty warning list.
 *
 * @throws {@link DTCGOutputCapabilityError} - CSS rejects a checked value or
 * Resolver state that it cannot represent, or a token path changes Tailwind
 * namespace between Resolver states.
 *
 * @throws `Error` - The builder rejects unsafe or oversized file-name
 * segments, a Resolver file name other than `tokens.resolver.json`, lone
 * surrogates in Resolver names, output path collisions, and CSS name
 * collisions.
 *
 * @throws `TypeError` - JSON sorting rejects cycles and data above its limits.
 * The summary, CSS, Tailwind, and TypeScript outputs reject calls that exceed
 * their work limits or read more than 64 token-group levels. CSS and TypeScript
 * reject output above 20 MiB. CSS and Tailwind reject more than 1,000 active
 * context permutations. Tailwind rejects input above 100,000 items per
 * context.
 *
 * @example
 * ```ts
 * import {
 *   buildDTCGOutputs,
 *   type DTCGDocument,
 * } from '@primitree/dtcg'
 *
 * const tokens = {
 *   scale: {
 *     base: { $type: 'number', $value: 4 },
 *   },
 * } satisfies DTCGDocument
 *
 * const result = buildDTCGOutputs({
 *   files: { 'source.tokens.json': tokens },
 *   resolver: {
 *     version: '2025.10',
 *     sets: {
 *       source: { sources: [{ $ref: 'source.tokens.json' }] },
 *     },
 *     resolutionOrder: [{ $ref: '#/sets/source' }],
 *   },
 *   resolverFileName: 'tokens.resolver.json',
 * })
 *
 * console.log(result.files.map(file => file.path))
 * ```
 *
 * @see [DTCG Resolver 2025.10](https://www.designtokens.org/tr/2025.10/resolver/)
 *
 * @public
 */
export function buildDTCGOutputs(
  input: DTCGOutputSet,
  options: BuildOutputOptions = {}
): BuildPipelineResult {
  validateDTCGOutputPaths(input)
  const files: PipelineFile[] = []
  const tokenFileNames = Object.keys(input.files).sort()
  const jsonBudget: JsonSortBudget = { items: 0, textBytes: 0 }

  for (const name of tokenFileNames) {
    const document = input.files[name]
    if (document !== undefined) {
      files.push({
        path: `tokens/${name}`,
        contents: serializeSorted(document, jsonBudget),
      })
    }
  }
  files.push({
    path: `tokens/${input.resolverFileName}`,
    contents: serializeSorted(input.resolver, jsonBudget, true),
  })

  if (options.css !== false) {
    files.push({
      path: 'css/tokens.css',
      contents: emitCss(input.files, input.resolver),
    })
  }
  if (options.tailwind !== false) {
    files.push({
      path: 'css/tokens.tailwind.css',
      contents: emitTailwind(input.files, input.resolver),
    })
  }
  if (options.typescript !== false) {
    files.push({
      path: 'ts/tokens.ts',
      contents: emitTypescript(input.files, input.resolver),
    })
  }

  const summaryBudget: ResolverWorkBudget = {
    remaining: MAX_OUTPUT_SUMMARY_WORK,
    errorMessage: OUTPUT_SUMMARY_WORK_LIMIT_MESSAGE,
    maxDepth: MAX_OUTPUT_JSON_DEPTH,
    depthErrorMessage: OUTPUT_SUMMARY_DEPTH_LIMIT_MESSAGE,
  }

  const collections = Object.keys(input.resolver.sets ?? {}).length
  const variables = flattenTokensWithBudget(
    applyResolverWithBudget(input.files, input.resolver, {}, summaryBudget),
    summaryBudget
  ).length
  const contexts = listContextsWithBudget(input.resolver, summaryBudget)
  assertUnicodeScalarResolverNames(contexts, summaryBudget)
  const summary: PipelineSummary = {
    collections,
    variables,
    tokenFiles: tokenFileNames.length + 1,
    contexts,
    files: files.map(file => file.path),
  }

  return { files, warnings: [], summary }
}

/**
 * Build token JSON, a Resolver, CSS, Tailwind v4 mappings, TypeScript values,
 * transformer config, workflow, and README as in-memory files.
 *
 * @remarks
 * Pure function: callers decide whether to write to disk (`primitree build`)
 * or zip in the browser (the playground).
 *
 * @public
 */
export function buildPipeline(
  input: unknown,
  options: BuildPipelineOptions = {}
): BuildPipelineResult {
  const resolved = {
    transformer: options.transformer ?? 'style-dictionary',
    css: options.css !== false,
    tailwind: options.tailwind !== false,
    typescript: options.typescript !== false,
    githubAction: options.githubAction !== false,
    readme: options.readme !== false,
  } as const

  const emitOptions: ToDTCGOptions = {}
  if (options.includeFigmaExtensions !== undefined) {
    emitOptions.includeFigmaExtensions = options.includeFigmaExtensions
  }
  if (options.resolverName !== undefined) {
    emitOptions.resolverName = options.resolverName
  }
  const dtcg = toDTCG(input, emitOptions)
  const tokenFileNames = Object.keys(dtcg.files)
  const firstParty = buildDTCGOutputs(dtcg, resolved)
  const files = [...firstParty.files]

  const baseFiles = tokenFileNames.filter(
    name => name.split('.').length === 3 // "<collection>.tokens.json"
  )
  if (resolved.transformer === 'style-dictionary') {
    files.push({
      path: 'style-dictionary.config.mjs',
      contents: styleDictionaryConfig(baseFiles),
    })
  } else if (resolved.transformer === 'terrazzo') {
    files.push({ path: 'terrazzo.config.mjs', contents: terrazzoConfig() })
  }

  if (resolved.githubAction) {
    files.push({
      path: 'design-tokens.workflow.yml',
      contents: githubWorkflow(resolved),
    })
  }

  const summary: PipelineSummary = { ...firstParty.summary, files: [] }

  if (resolved.readme) {
    files.push({
      path: 'README.md',
      contents: pipelineReadme(summary, resolved),
    })
  }

  summary.files = files.map(f => f.path)

  return { files, warnings: dtcg.warnings, summary }
}
