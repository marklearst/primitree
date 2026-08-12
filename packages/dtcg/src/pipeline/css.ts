import type {
  DTCGColorComponent,
  DTCGColorValue,
  DTCGDocument,
  DTCGGroup,
  DTCGToken,
  DTCGTokenType,
  DTCGTokenValue,
  ResolverDocument,
} from '../types'
import { isReferenceValue, isToken } from '../types'
import { DTCGOutputCapabilityError } from './output-error'
import {
  applyResolverWithBudget,
  chargeResolverWork,
  flattenTypedTokensWithBudget,
  readResolutionContextStatesWithBudget,
  type FlatToken,
  type ResolverWorkBudget,
  type TypedFlatToken,
} from '../resolve'
import { hasLoneUtf16Surrogate } from './unicode'

const CSS_WIDE_KEYWORDS = new Set([
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
])

const FONT_WEIGHT_CSS_EQUIVALENTS = new Map<string, number>([
  ['thin', 100],
  ['hairline', 100],
  ['extra-light', 200],
  ['ultra-light', 200],
  ['light', 300],
  ['regular', 400],
  ['book', 400],
  ['medium', 500],
  ['semi-bold', 600],
  ['demi-bold', 600],
  ['extra-bold', 800],
  ['ultra-bold', 800],
  ['black', 900],
  ['heavy', 900],
  ['extra-black', 950],
  ['ultra-black', 950],
])

/**
 * Convert a dot path to a CSS custom property name.
 *
 * Dots separate path segments. ASCII letters, digits, and non-ASCII code points
 * stay unchanged. Each other code point becomes a lowercase hex marker, such
 * as `_3f_` for `?`. This keeps different valid token paths from sharing a CSS
 * name.
 *
 * @public
 */
export function cssVarName(path: string): string {
  return `--${path
    .split('.')
    .map(segment => escapeCssCustomPropertySegment(segment))
    .join('-')}`
}

function escapeCssCustomPropertySegment(segment: string): string {
  let result = ''
  for (const character of segment) {
    const code = character.codePointAt(0) ?? 0xfffd
    const isAsciiLetterOrDigit =
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    const isNonAsciiScalar = code >= 0x80 && (code < 0xd800 || code > 0xdfff)
    if (isAsciiLetterOrDigit || isNonAsciiScalar) {
      result += character
      continue
    }
    result += `_${code.toString(16)}_`
  }
  return result
}

function isCssTextRepresentable(value: string): boolean {
  return !value.includes('\u0000') && !hasLoneUtf16Surrogate(value)
}

function quoteCssString(value: string): string | null {
  if (!isCssTextRepresentable(value)) {
    return null
  }
  let result = "'"
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const character = value[index] as string
    if (code <= 0x1f || code === 0x7f) {
      result += `\\${code.toString(16)} `
    } else if (character === "'" || character === '\\') {
      result += `\\${character}`
    } else {
      result += character
    }
  }
  return `${result}'`
}

function cssTextValue(value: string): string | null {
  return /^-?[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(value) &&
    !CSS_WIDE_KEYWORDS.has(value.toLowerCase())
    ? value
    : quoteCssString(value)
}

function resolverAxisDataAttribute(value: string): string {
  let result = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0xfffd
    const isLowercaseAsciiLetter = code >= 0x61 && code <= 0x7a
    const isAsciiDigit = code >= 0x30 && code <= 0x39
    if (isLowercaseAsciiLetter || isAsciiDigit || code === 0x2d) {
      result += character
      continue
    }
    result += `_${code.toString(16)}_`
  }
  return `data-${result.length === 0 ? '_empty_' : result}`
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
  budget?: ResolverWorkBudget,
  type?: DTCGTokenType
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
    if (type === 'fontWeight') {
      const numericValue = FONT_WEIGHT_CSS_EQUIVALENTS.get(value)
      if (numericValue !== undefined) {
        return String(numericValue)
      }
    }
    return cssTextValue(value)
  }
  if (Array.isArray(value)) {
    const curve = formatCssCubicBezier(value)
    if (curve !== null) {
      return curve
    }
    if (
      value.length === 0 ||
      !value.every((item): item is string => typeof item === 'string')
    ) {
      return null
    }
    const items: string[] = []
    for (const item of value) {
      const formatted = cssTextValue(item)
      if (formatted === null) {
        return null
      }
      items.push(formatted)
    }
    return items.join(', ')
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

/**
 * Format a DTCG token value as CSS using its effective token type.
 *
 * @remarks
 * Most token values format the same way regardless of type. DTCG font-weight
 * names that CSS does not accept need the effective `fontWeight` type to
 * produce numeric equivalents. The type can come from the token, a parent
 * group, or an alias target.
 *
 * @param value - Resolved token value to format.
 * @param type - Effective token type after inheritance and alias resolution.
 * @returns CSS text, or `null` when CSS output cannot represent the value.
 *
 * @example
 * ```ts
 * const weight = typedCssValue('semi-bold', 'fontWeight')
 * // weight is "600"
 *
 * const label = typedCssValue('semi-bold', 'string')
 * // label is "semi-bold"
 * ```
 *
 * @public
 */
export function typedCssValue(
  value: DTCGTokenValue,
  type: DTCGTokenType | undefined
): string | null {
  return formatCssValue(value, undefined, type)
}

function declarations(
  flat: TypedFlatToken[],
  indent: string,
  budget: ResolverWorkBudget
): string[] {
  const lines: string[] = []
  chargeResolverWork(budget, flat.length)
  for (const { path, token, type } of flat) {
    const value = formatCssValue(token.$value, budget, type)
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

interface CssPathShapeClaims {
  readonly groups: Set<string>
  readonly tokens: Map<string, DTCGToken>
}

function claimCssPathShapes(
  document: DTCGDocument,
  claims: CssPathShapeClaims,
  budget: ResolverWorkBudget
): void {
  function walk(group: DTCGGroup, prefix: string[]): void {
    const entries = Object.entries(group)
    chargeResolverWork(budget, entries.length)
    for (const [key, value] of entries) {
      if (key.startsWith('$') && key !== '$root') {
        continue
      }
      const segments = [...prefix, key]
      const path = segments.join('.')
      if (isToken(value)) {
        if (claims.groups.has(path)) {
          throw new DTCGOutputCapabilityError(
            'css',
            path,
            value.$type ?? 'token',
            'token-state'
          )
        }
        claims.tokens.set(path, value)
        continue
      }

      const previousToken = claims.tokens.get(path)
      if (previousToken !== undefined) {
        throw new DTCGOutputCapabilityError(
          'css',
          path,
          previousToken.$type ?? 'token',
          'token-state'
        )
      }
      claims.groups.add(path)
      walk(value as DTCGGroup, segments)
    }
  }

  walk(document, [])
}

function readCssTokens(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  contexts: Record<string, string>,
  budget: ResolverWorkBudget,
  claimed: Map<string, string>,
  pathShapes: CssPathShapeClaims
): TypedFlatToken[] {
  const document = applyResolverWithBudget(files, resolver, contexts, budget)
  const flat = flattenTypedTokensWithBudget(document, budget)
  chargeResolverWork(budget, flat.length)
  for (const { path } of flat) {
    chargeCssText(path, budget)
  }
  assertUniqueCssVarNames(flat, claimed)
  claimCssPathShapes(document, pathShapes, budget)
  return flat
}

function assertDefaultTokensRemain(
  defaults: ReadonlyMap<string, TypedFlatToken>,
  selected: readonly TypedFlatToken[],
  budget: ResolverWorkBudget
): void {
  chargeResolverWork(budget, selected.length)
  const selectedPaths = new Set(selected.map(({ path }) => path))
  chargeResolverWork(budget, defaults.size)
  for (const [path, { token }] of defaults) {
    if (!selectedPaths.has(path)) {
      throw new DTCGOutputCapabilityError(
        'css',
        path,
        token.$type ?? 'token',
        'token-state'
      )
    }
  }
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
  a: TypedFlatToken | undefined,
  b: TypedFlatToken | undefined,
  budget: ResolverWorkBudget,
  cache: CssComparisonCache
): boolean {
  if (a === b) {
    return true
  }
  if (a === undefined || b === undefined) {
    return false
  }
  if (a.type !== b.type) {
    return false
  }
  if (a.token === b.token) {
    return true
  }

  const cachedPairs = cache.pairs.get(a.token)
  if (cachedPairs?.has(b.token)) {
    return cachedPairs.get(b.token) as boolean
  }

  const equal =
    comparableTokenValue(a.token, budget, cache) ===
    comparableTokenValue(b.token, budget, cache)
  const pairs = cachedPairs ?? new WeakMap<DTCGToken, boolean>()
  pairs.set(b.token, equal)
  cache.pairs.set(a.token, pairs)
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
 * `:root` contains the default values. A single non-default axis writes the
 * token values that differ from `:root`. Two or more non-default axes write
 * the full selected token set under a compound selector. The emitter escapes
 * string values, modifier axes, and context names before writing CSS.
 * Color values keep their DTCG color space, components, and alpha.
 *
 * One call evaluates at most 1,000 active-context permutations, reads at most
 * 64 token-group levels, and returns at most 20 MiB. Its 1,000,000-unit work
 * limit counts active Resolver contexts, token merges, value comparisons,
 * declarations, token paths, and token text. The emitter rejects token paths
 * that map to the same CSS custom property name.
 * The emitter also rejects CSS comment terminators in custom banners, U+0000,
 * and lone UTF-16 surrogates in raw CSS text.
 *
 * @param files - Token files keyed by their path from the Resolver file.
 * @param resolver - Resolver that selects files and default contexts.
 * @param options - Optional stylesheet banner.
 * @returns CSS custom properties for the selected token values.
 *
 * @throws `TypeError` - A call exceeds 1,000 active-context permutations,
 * 1,000,000 work units, 64 token-group levels, or 20 MiB of CSS.
 * @throws {@link DTCGOutputCapabilityError} - The CSS writer cannot format a
 * token value, custom banner, Resolver context name, or token path across
 * Resolver states.
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

  if (banner.length > MAX_CSS_OUTPUT_BYTES) {
    throw new TypeError(CSS_OUTPUT_LIMIT_MESSAGE)
  }
  if (!isCssTextRepresentable(banner) || banner.includes('*/')) {
    throw new DTCGOutputCapabilityError('css', 'banner', 'string')
  }

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
  const pathShapes: CssPathShapeClaims = {
    groups: new Set(),
    tokens: new Map(),
  }
  const comparisonCache: CssComparisonCache = {
    values: new WeakMap(),
    pairs: new WeakMap(),
  }

  const defaultFlat = readCssTokens(
    files,
    resolver,
    {},
    budget,
    claimed,
    pathShapes
  )
  chargeResolverWork(budget, defaultFlat.length)
  const defaultByPath = new Map(defaultFlat.map(f => [f.path, f]))

  appendCssLines(lines, output, ':root {')
  for (const declaration of declarations(defaultFlat, '  ', budget)) {
    appendCssLines(lines, output, declaration)
  }
  appendCssLines(lines, output, '}')

  const contextStates = readResolutionContextStatesWithBudget(resolver, budget)
  for (const selection of contextStates.permutations) {
    const selectedContexts = Object.entries(selection).filter(
      ([axis, context]) => context !== contextStates.defaultSelection[axis]
    )
    const selector = selectedContexts
      .map(([axis, context]) => {
        chargeCssText(axis, budget)
        chargeCssText(context, budget)
        const quotedContext = quoteCssString(context)
        if (quotedContext === null) {
          throw new DTCGOutputCapabilityError(
            'css',
            'resolver context',
            'string'
          )
        }
        return `[${resolverAxisDataAttribute(axis)}=${quotedContext}]`
      })
      .join('')
    if (selector.length === 0) {
      continue
    }

    const contextFlat = readCssTokens(
      files,
      resolver,
      selection,
      budget,
      claimed,
      pathShapes
    )
    assertDefaultTokensRemain(defaultByPath, contextFlat, budget)
    chargeResolverWork(budget, contextFlat.length)
    const changed = contextFlat.filter(
      f => !tokensEqual(defaultByPath.get(f.path), f, budget, comparisonCache)
    )
    const emitted = selectedContexts.length > 1 ? contextFlat : changed
    if (emitted.length === 0) {
      continue
    }

    appendCssLines(lines, output, '', `${selector} {`)
    for (const declaration of declarations(emitted, '  ', budget)) {
      appendCssLines(lines, output, declaration)
    }
    appendCssLines(lines, output, '}')
  }

  appendCssLines(lines, output, '')
  return lines.join('\n')
}
