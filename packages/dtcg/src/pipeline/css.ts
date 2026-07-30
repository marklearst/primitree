import type {
  DTCGColorComponent,
  DTCGColorValue,
  DTCGDocument,
  DTCGToken,
  DTCGTokenValue,
  ResolverDocument,
} from '../types'
import { isReferenceValue } from '../types'
import { DTCGOutputCapabilityError } from './output-error'
import {
  applyResolverWithBudget,
  chargeResolverWork,
  flattenTokens,
  listContextsWithBudget,
  type FlatToken,
  type ResolverWorkBudget,
} from '../resolve'

const CSS_WIDE_KEYWORDS = new Set([
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
])

/** Convert a dot path to a CSS custom property name. @public */
export function cssVarName(path: string): string {
  return `--${path
    .split('.')
    .map(segment =>
      segment
        .trim()
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    )
    .filter(s => s.length > 0)
    .join('-')}`
}

function quoteCssString(value: string): string {
  let result = "'"
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const character = value[index] as string
    if (code === 0) {
      result += '\\fffd '
    } else if (code <= 0x1f || code === 0x7f) {
      result += `\\${code.toString(16)} `
    } else if (character === "'" || character === '\\') {
      result += `\\${character}`
    } else {
      result += character
    }
  }
  return `${result}'`
}

function cssTextValue(value: string): string {
  return /^-?[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(value) &&
    !CSS_WIDE_KEYWORDS.has(value.toLowerCase())
    ? value
    : quoteCssString(value)
}

function escapeCssIdentifierFragment(value: string): string {
  let result = ''
  for (const character of value) {
    if (/^[a-zA-Z0-9_-]$/u.test(character)) {
      result += character
      continue
    }
    const code = character.codePointAt(0) ?? 0xfffd
    result += `\\${(code === 0 ? 0xfffd : code).toString(16)} `
  }
  return result
}

function chargeCssText(value: string, budget: ResolverWorkBudget): void {
  chargeResolverWork(budget, value.length + 1)
}

function chargeCssValueWork(
  value: DTCGTokenValue,
  budget: ResolverWorkBudget
): void {
  if (typeof value === 'string') {
    chargeCssText(value, budget)
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
        chargeCssText(item, budget)
      } else {
        chargeResolverWork(budget)
      }
    }
    return
  }

  const entries = Object.entries(value)
  chargeResolverWork(budget, entries.length + 1)
  for (const [key, item] of entries) {
    chargeCssText(key, budget)
    if (typeof item === 'string') {
      chargeCssText(item, budget)
    } else if (Array.isArray(item)) {
      chargeResolverWork(budget, item.length + 1)
    } else {
      chargeResolverWork(budget)
    }
  }
}

function colorComponent(value: DTCGColorComponent): string {
  return String(value)
}

function colorPercent(value: DTCGColorComponent): string {
  return value === 'none' ? value : `${value}%`
}

function colorAlpha(value: DTCGColorValue): string {
  const alpha = value.alpha ?? 1
  return alpha < 1 ? ` / ${alpha}` : ''
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatCssColor(value: DTCGColorValue): string {
  const [first, second, third] = value.components
  const alpha = colorAlpha(value)

  switch (value.colorSpace) {
    case 'hsl':
    case 'hwb':
      return `${value.colorSpace}(${colorComponent(first)} ${colorPercent(second)} ${colorPercent(third)}${alpha})`
    case 'lab':
    case 'lch':
      return `${value.colorSpace}(${colorComponent(first)} ${colorComponent(second)} ${colorComponent(third)}${alpha})`
    case 'oklab':
    case 'oklch':
      return `${value.colorSpace}(${colorComponent(first)} ${colorComponent(second)} ${colorComponent(third)}${alpha})`
    case 'srgb':
    case 'srgb-linear':
    case 'display-p3':
    case 'a98-rgb':
    case 'prophoto-rgb':
    case 'rec2020':
    case 'xyz-d65':
    case 'xyz-d50':
      return `color(${value.colorSpace} ${colorComponent(first)} ${colorComponent(second)} ${colorComponent(third)}${alpha})`
  }
}

function formatCssCubicBezier(value: readonly unknown[]): string | null {
  if (value.length !== 4) {
    return null
  }
  const [firstX, firstY, secondX, secondY] = value
  if (
    !isFiniteNumber(firstX) ||
    !isFiniteNumber(firstY) ||
    !isFiniteNumber(secondX) ||
    !isFiniteNumber(secondY)
  ) {
    return null
  }
  if (firstX < 0 || firstX > 1 || secondX < 0 || secondX > 1) {
    return null
  }
  return `cubic-bezier(${firstX}, ${firstY}, ${secondX}, ${secondY})`
}

function formatCssValue(
  value: DTCGTokenValue,
  budget?: ResolverWorkBudget
): string | null {
  if (budget !== undefined) {
    chargeCssValueWork(value, budget)
  }
  if (isReferenceValue(value)) {
    return `var(${cssVarName(value.slice(1, -1))})`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'string') {
    return cssTextValue(value)
  }
  if (Array.isArray(value)) {
    const curve = formatCssCubicBezier(value)
    if (curve !== null) {
      return curve
    }
    return value.length > 0 && value.every(item => typeof item === 'string')
      ? value.map(cssTextValue).join(', ')
      : null
  }
  if ('colorSpace' in value) {
    return formatCssColor(value)
  }
  if ('unit' in value) {
    return `${value.value}${value.unit}`
  }
  return null
}

/**
 * Format a DTCG token value as CSS.
 *
 * @remarks
 * References become `var(--...)`. Color values keep their DTCG color space,
 * components, and alpha. A color's optional `hex` fallback stays in DTCG
 * output and does not replace the authored components. Cubic Bezier values
 * become CSS `cubic-bezier()` timing functions.
 *
 * @param value - Token value to format.
 * @returns CSS text, or `null` when CSS output cannot represent the value.
 *
 * @example
 * ```ts
 * const value = cssValue({
 *   colorSpace: 'display-p3',
 *   components: [0.2, 0.4, 1],
 *   alpha: 0.75,
 * })
 * // value is "color(display-p3 0.2 0.4 1 / 0.75)"
 * ```
 *
 * @public
 */
export function cssValue(value: DTCGTokenValue): string | null {
  return formatCssValue(value)
}

function declarations(
  flat: FlatToken[],
  indent: string,
  budget: ResolverWorkBudget
): string[] {
  const lines: string[] = []
  chargeResolverWork(budget, flat.length)
  for (const { path, token } of flat) {
    const value = formatCssValue(token.$value, budget)
    if (value === null) {
      throw new DTCGOutputCapabilityError('css', path, token.$type ?? 'token')
    }
    lines.push(`${indent}${cssVarName(path)}: ${value};`)
  }
  return lines
}

/** @internal */
export function claimCssVarName(
  claimed: Map<string, string>,
  path: string
): string {
  const name = cssVarName(path)
  const existing = claimed.get(name)
  if (existing !== undefined && existing !== path) {
    throw new Error(
      `DTCG token paths "${existing}" and "${path}" both map to CSS custom property "${name}".`
    )
  }
  claimed.set(name, path)
  return name
}

/** @internal */
export function assertUniqueCssVarNames(
  flat: readonly Pick<FlatToken, 'path'>[],
  claimed = new Map<string, string>()
): void {
  for (const { path } of flat) {
    claimCssVarName(claimed, path)
  }
}

const MAX_CSS_WORK = 1_000_000
const MAX_CSS_GROUP_DEPTH = 64
const MAX_CSS_OUTPUT_BYTES = 20 * 1024 * 1024
const CSS_WORK_LIMIT_MESSAGE =
  'CSS output exceeds the 1,000,000-unit work limit.'
const CSS_DEPTH_LIMIT_MESSAGE =
  'CSS output can read at most 64 token-group levels.'
const CSS_OUTPUT_LIMIT_MESSAGE = 'CSS output can contain at most 20 MiB.'

function readCssTokens(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  contexts: Record<string, string>,
  budget: ResolverWorkBudget,
  claimed: Map<string, string>
): FlatToken[] {
  const flat = flattenTokens(
    applyResolverWithBudget(files, resolver, contexts, budget)
  )
  chargeResolverWork(budget, flat.length)
  for (const { path } of flat) {
    chargeCssText(path, budget)
  }
  assertUniqueCssVarNames(flat, claimed)
  return flat
}

interface CssComparisonCache {
  readonly values: WeakMap<DTCGToken, string | undefined>
  readonly pairs: WeakMap<DTCGToken, WeakMap<DTCGToken, boolean>>
}

function comparableTokenValue(
  token: DTCGToken,
  budget: ResolverWorkBudget,
  cache: CssComparisonCache
): string | undefined {
  if (cache.values.has(token)) {
    return cache.values.get(token)
  }
  chargeCssValueWork(token.$value, budget)
  const value = JSON.stringify(token.$value)
  cache.values.set(token, value)
  return value
}

function tokensEqual(
  a: DTCGToken | undefined,
  b: DTCGToken | undefined,
  budget: ResolverWorkBudget,
  cache: CssComparisonCache
): boolean {
  if (a === b) {
    return true
  }
  if (a === undefined || b === undefined) {
    return false
  }

  const cachedPairs = cache.pairs.get(a)
  if (cachedPairs?.has(b)) {
    return cachedPairs.get(b) as boolean
  }

  const equal =
    comparableTokenValue(a, budget, cache) ===
    comparableTokenValue(b, budget, cache)
  const pairs = cachedPairs ?? new WeakMap<DTCGToken, boolean>()
  pairs.set(b, equal)
  cache.pairs.set(a, pairs)
  return equal
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

interface CssOutputState {
  bytes: number
}

function assertCssOutputSize(state: CssOutputState, addedBytes: number): void {
  if (state.bytes + addedBytes > MAX_CSS_OUTPUT_BYTES) {
    throw new TypeError(CSS_OUTPUT_LIMIT_MESSAGE)
  }
}

function appendCssLines(
  lines: string[],
  state: CssOutputState,
  ...nextLines: string[]
): void {
  for (const line of nextLines) {
    const addedBytes = utf8ByteLength(line) + (lines.length === 0 ? 0 : 1)
    assertCssOutputSize(state, addedBytes)
    state.bytes += addedBytes
    lines.push(line)
  }
}

/** Options for {@link emitCss}. @public */
export interface EmitCssOptions {
  /**
   * Header comment for the generated stylesheet.
   */
  banner?: string
}

/**
 * Emit CSS custom properties from token files and a Resolver.
 *
 * @remarks
 * `:root` contains the default values. A `[data-<axis>='<context>']` block
 * contains values that change for a non-default context. The emitter escapes
 * string values, modifier axes, and context names before writing CSS.
 * Color values keep their DTCG color space, components, and alpha.
 *
 * One call reads at most 64 token-group levels and returns at most 20 MiB.
 * Its 1,000,000-unit work limit counts Resolver reads, token merges, value
 * comparisons, declarations, token paths, and token text. The emitter rejects
 * token paths that map to the same CSS custom property name.
 *
 * @param files - Token files keyed by their path from the Resolver file.
 * @param resolver - Resolver that selects files and default contexts.
 * @param options - Optional stylesheet banner.
 * @returns CSS custom properties for the selected token values.
 *
 * @throws `TypeError` - A call exceeds 1,000,000 work units, 64 token-group
 * levels, or 20 MiB of CSS.
 * @throws {@link DTCGOutputCapabilityError} - The CSS writer cannot format a
 * token value.
 * @throws `Error` - Two token paths map to the same CSS custom property name.
 *
 * @public
 */
export function emitCss(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  options: EmitCssOptions = {}
): string {
  const banner =
    options.banner ??
    '@primitree/dtcg CSS output. :root contains default contexts. Set data attributes to switch themes, for example <html data-semantic="dark">.'

  const lines: string[] = []
  const output: CssOutputState = { bytes: 0 }
  const bannerBytes = utf8ByteLength(banner) + utf8ByteLength('/*  */')
  assertCssOutputSize(output, bannerBytes)
  appendCssLines(lines, output, `/* ${banner} */`, '')
  const budget: ResolverWorkBudget = {
    remaining: MAX_CSS_WORK,
    errorMessage: CSS_WORK_LIMIT_MESSAGE,
    maxDepth: MAX_CSS_GROUP_DEPTH,
    depthErrorMessage: CSS_DEPTH_LIMIT_MESSAGE,
  }
  const claimed = new Map<string, string>()
  const comparisonCache: CssComparisonCache = {
    values: new WeakMap(),
    pairs: new WeakMap(),
  }

  const defaultFlat = readCssTokens(files, resolver, {}, budget, claimed)
  chargeResolverWork(budget, defaultFlat.length)
  const defaultByPath = new Map(defaultFlat.map(f => [f.path, f.token]))

  appendCssLines(
    lines,
    output,
    ':root {',
    ...declarations(defaultFlat, '  ', budget),
    '}'
  )

  const axes = listContextsWithBudget(resolver, budget)
  for (const [axis, contexts] of Object.entries(axes)) {
    const defaultContext = resolver.modifiers?.[axis]?.default ?? contexts[0]
    for (const context of contexts) {
      if (context === defaultContext) {
        continue
      }
      const contextFlat = readCssTokens(
        files,
        resolver,
        { [axis]: context },
        budget,
        claimed
      )
      chargeResolverWork(budget, contextFlat.length)
      const changed = contextFlat.filter(
        f =>
          !tokensEqual(
            defaultByPath.get(f.path),
            f.token,
            budget,
            comparisonCache
          )
      )
      if (changed.length === 0) {
        continue
      }
      appendCssLines(
        lines,
        output,
        '',
        `[data-${escapeCssIdentifierFragment(axis)}=${quoteCssString(context)}] {`,
        ...declarations(changed, '  ', budget),
        '}'
      )
    }
  }

  appendCssLines(lines, output, '')
  return lines.join('\n')
}
