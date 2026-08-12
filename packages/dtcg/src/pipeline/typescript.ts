import type { DTCGDocument, DTCGTokenValue, ResolverDocument } from '../types'
import {
  applyResolverWithBudget,
  chargeResolverWork,
  flattenTokensWithBudget,
  resolveTokenValuesWithBudget,
  type ResolverWorkBudget,
} from '../resolve'
import { assertUniqueCssVarNames, cssVarName, cssValue } from './css'

const MAX_TYPESCRIPT_WORK = 1_000_000
const MAX_TYPESCRIPT_GROUP_DEPTH = 64
const MAX_TYPESCRIPT_OUTPUT_BYTES = 20 * 1024 * 1024
const TYPESCRIPT_WORK_LIMIT_MESSAGE =
  'TypeScript output exceeds the 1,000,000-unit work limit.'
const TYPESCRIPT_DEPTH_LIMIT_MESSAGE =
  'TypeScript output can read at most 64 token-group levels.'
const TYPESCRIPT_OUTPUT_LIMIT_MESSAGE =
  'TypeScript output can contain at most 20 MiB.'

function stringLiteral(value: string): string {
  return JSON.stringify(value)
}

function chargeTypescriptText(value: string, budget: ResolverWorkBudget): void {
  chargeResolverWork(budget, value.length + 1)
}

function chargeTypescriptValueWork(
  value: DTCGTokenValue,
  budget: ResolverWorkBudget
): void {
  if (typeof value === 'string') {
    chargeTypescriptText(value, budget)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    chargeResolverWork(budget)
    return
  }
  if (Array.isArray(value)) {
    chargeResolverWork(budget, value.length + 1)
    for (const item of value) {
      if (typeof item === 'string') {
        chargeTypescriptText(item, budget)
      } else {
        chargeResolverWork(budget)
      }
    }
    return
  }

  const entries = Object.entries(value)
  chargeResolverWork(budget, entries.length + 1)
  for (const [key, item] of entries) {
    chargeTypescriptText(key, budget)
    if (typeof item === 'string') {
      chargeTypescriptText(item, budget)
    } else if (Array.isArray(item)) {
      chargeResolverWork(budget, item.length + 1)
    } else {
      chargeResolverWork(budget)
    }
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0xfffd
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code <= 0xffff) {
      bytes += 3
    } else {
      bytes += 4
    }
  }
  return bytes
}

interface TypescriptOutputState {
  bytes: number
}

function appendTypescriptLine(
  lines: string[],
  output: TypescriptOutputState,
  line: string
): void {
  const addedBytes = utf8ByteLength(line) + (lines.length === 0 ? 0 : 1)
  if (output.bytes + addedBytes > MAX_TYPESCRIPT_OUTPUT_BYTES) {
    throw new TypeError(TYPESCRIPT_OUTPUT_LIMIT_MESSAGE)
  }
  output.bytes += addedBytes
  lines.push(line)
}

function resolvedValueLiteral(
  value: DTCGTokenValue,
  budget: ResolverWorkBudget,
  cache: Map<DTCGTokenValue, string>
): string {
  const cached = cache.get(value)
  if (cached !== undefined) {
    return cached
  }

  chargeTypescriptValueWork(value, budget)
  const css =
    typeof value === 'boolean' || Array.isArray(value) ? null : cssValue(value)
  const literal =
    css === null ? (JSON.stringify(value) as string) : stringLiteral(css)
  cache.set(value, literal)
  return literal
}

/**
 * Emit a typed TypeScript module for the generated tokens: a `TokenPath`
 * union, a map of CSS `var()` accessors, and the resolved default-context
 * values.
 *
 * One call reads at most 64 token-group levels and returns at most 20 MiB. Its
 * 1,000,000-unit work limit counts Resolver reads, token merges, token
 * flattening, reference resolution, token paths, sorting, and value
 * serialization.
 *
 * @throws `TypeError` - A call exceeds 1,000,000 work units or 64 token-group
 * levels, or returns more than 20 MiB.
 *
 * @public
 */
export function emitTypescript(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument
): string {
  const budget: ResolverWorkBudget = {
    remaining: MAX_TYPESCRIPT_WORK,
    errorMessage: TYPESCRIPT_WORK_LIMIT_MESSAGE,
    maxDepth: MAX_TYPESCRIPT_GROUP_DEPTH,
    depthErrorMessage: TYPESCRIPT_DEPTH_LIMIT_MESSAGE,
  }
  const merged = applyResolverWithBudget(files, resolver, {}, budget)
  const flat = flattenTokensWithBudget(merged, budget)
  chargeResolverWork(budget, flat.length)
  for (const { path } of flat) {
    chargeTypescriptText(path, budget)
  }
  assertUniqueCssVarNames(flat)
  const resolved = resolveTokenValuesWithBudget(flat, budget)

  const paths = flat.map(f => f.path)
  if (paths.length > 1) {
    chargeResolverWork(
      budget,
      paths.length * Math.ceil(Math.log2(paths.length))
    )
  }
  paths.sort()

  const lines: string[] = []
  const output: TypescriptOutputState = { bytes: 0 }
  for (const line of [
    '/**',
    ' * @primitree/cli TypeScript output from the source variables.',
    ' * Each modifier axis uses its default context.',
    ' */',
    '',
    paths.length === 0
      ? 'export type TokenPath = never'
      : 'export type TokenPath =',
  ]) {
    appendTypescriptLine(lines, output, line)
  }
  for (const path of paths) {
    appendTypescriptLine(lines, output, `  | ${stringLiteral(path)}`)
  }
  appendTypescriptLine(lines, output, '')

  appendTypescriptLine(
    lines,
    output,
    '/** CSS variable references for each token path. */'
  )
  appendTypescriptLine(lines, output, 'export const tokenVars = {')
  for (const path of paths) {
    appendTypescriptLine(
      lines,
      output,
      `  [${stringLiteral(path)}]: ${stringLiteral(`var(${cssVarName(path)})`)},`
    )
  }
  appendTypescriptLine(
    lines,
    output,
    '} as const satisfies Record<TokenPath, string>'
  )
  appendTypescriptLine(lines, output, '')

  appendTypescriptLine(
    lines,
    output,
    '/** Values resolved for the default contexts. */'
  )
  appendTypescriptLine(lines, output, 'export const tokenValues = {')
  const valueLiterals = new Map<DTCGTokenValue, string>()
  for (const path of paths) {
    const value = resolved.get(path)
    const literal =
      value === undefined
        ? 'undefined'
        : resolvedValueLiteral(value, budget, valueLiterals)
    appendTypescriptLine(
      lines,
      output,
      `  [${stringLiteral(path)}]: ${literal},`
    )
  }
  appendTypescriptLine(lines, output, '} as const')
  appendTypescriptLine(lines, output, '')

  return lines.join('\n')
}
