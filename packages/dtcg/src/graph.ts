import {
  createGraphFragment,
  createSourceId,
  qualifyId,
  type GraphFragment,
  type GroupId,
  type Provenance,
  type Result,
  type SourceId,
  type TokenId,
} from '@primitree/core'
import type {
  DTCGColorComponent,
  DTCGColorSpace,
  DTCGColorValue,
  DTCGTokenType,
} from './types'

const MAX_GRAPH_ITEMS = 100_000
const MAX_GRAPH_DEPTH = 64
const MAX_JOINED_PATH_LENGTH = 256

const SUPPORTED_TOKEN_TYPES = new Set<string>([
  'color',
  'dimension',
  'duration',
  'number',
  'fontWeight',
  'fontFamily',
  'string',
  'boolean',
])

const GROUP_PROPERTIES = new Set([
  '$type',
  '$description',
  '$deprecated',
  '$extensions',
  '$root',
])

const TOKEN_PROPERTIES = new Set([
  '$value',
  '$type',
  '$description',
  '$deprecated',
  '$extensions',
])

type ComponentRange =
  | { readonly kind: 'closed'; readonly min: number; readonly max: number }
  | { readonly kind: 'open-max'; readonly min: number; readonly max: number }
  | { readonly kind: 'min'; readonly min: number }
  | { readonly kind: 'finite' }

const CLOSED_UNIT_RANGE = {
  kind: 'closed',
  min: 0,
  max: 1,
} as const satisfies ComponentRange
const CLOSED_PERCENT_RANGE = {
  kind: 'closed',
  min: 0,
  max: 100,
} as const satisfies ComponentRange
const HUE_RANGE = {
  kind: 'open-max',
  min: 0,
  max: 360,
} as const satisfies ComponentRange
const NON_NEGATIVE_RANGE = {
  kind: 'min',
  min: 0,
} as const satisfies ComponentRange
const FINITE_RANGE = { kind: 'finite' } as const satisfies ComponentRange

const COLOR_VALUE_PROPERTIES = new Set([
  'colorSpace',
  'components',
  'alpha',
  'hex',
])

const VALUE_UNIT_PROPERTIES = new Set(['value', 'unit'])

const FONT_WEIGHT_NAMES = new Set([
  'thin',
  'hairline',
  'extra-light',
  'ultra-light',
  'light',
  'normal',
  'regular',
  'book',
  'medium',
  'semi-bold',
  'demi-bold',
  'bold',
  'extra-bold',
  'ultra-bold',
  'black',
  'heavy',
  'extra-black',
  'ultra-black',
])

const COLOR_SPACE_RANGES = new Map<
  DTCGColorSpace,
  readonly [ComponentRange, ComponentRange, ComponentRange]
>([
  ['srgb', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['srgb-linear', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['hsl', [HUE_RANGE, CLOSED_PERCENT_RANGE, CLOSED_PERCENT_RANGE]],
  ['hwb', [HUE_RANGE, CLOSED_PERCENT_RANGE, CLOSED_PERCENT_RANGE]],
  ['lab', [CLOSED_PERCENT_RANGE, FINITE_RANGE, FINITE_RANGE]],
  ['lch', [CLOSED_PERCENT_RANGE, NON_NEGATIVE_RANGE, HUE_RANGE]],
  ['oklab', [CLOSED_UNIT_RANGE, FINITE_RANGE, FINITE_RANGE]],
  ['oklch', [CLOSED_UNIT_RANGE, NON_NEGATIVE_RANGE, HUE_RANGE]],
  ['display-p3', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['a98-rgb', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['prophoto-rgb', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['rec2020', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['xyz-d65', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
  ['xyz-d50', [CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE, CLOSED_UNIT_RANGE]],
])

/**
 * Source details for {@link createDTCGGraphFragment}.
 *
 * @public
 */
export interface DTCGGraphFragmentOptions {
  /** Name used to create the Core source ID and qualify group and token IDs. */
  readonly source: string

  /** Optional file name or URI copied into source, group, and token provenance. */
  readonly uri?: string
}

interface TokenInput {
  readonly id: TokenId
  readonly groupId?: GroupId
  readonly name: string
  readonly path: readonly string[]
  readonly type: DTCGTokenType | undefined
  readonly value: unknown
  readonly provenance: readonly Provenance[]
}

type CoreTokenValue =
  | { readonly kind: 'literal'; readonly value: unknown }
  | { readonly kind: 'reference'; readonly target: TokenId }

interface PreparedToken extends TokenInput {
  readonly coreValue: CoreTokenValue
  readonly referencePath?: readonly string[]
}

interface AdapterIssue {
  readonly code: string
  readonly message: string
  readonly path?: readonly string[]
}

interface WorkBudget {
  remaining: number
}

type GraphFailure = Extract<Result<GraphFragment>, { readonly ok: false }>

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key)
}

function isToken(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value) && hasOwn(value, '$value')
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function isDTCGName(value: string): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !value.startsWith('$') &&
    !value.includes('.') &&
    !value.includes('{') &&
    !value.includes('}') &&
    !hasControlCharacter(value)
  )
}

function joinedPathFitsLimit(path: readonly string[]): boolean {
  let length = 0
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]
    if (segment === undefined) {
      return false
    }
    length += segment.length + (index === 0 ? 0 : 1)
    if (length > MAX_JOINED_PATH_LENGTH) {
      return false
    }
  }
  return true
}

function pointer(path: readonly string[]): string {
  return `/${path
    .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/')}`
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}

function comparePaths(
  left: readonly string[],
  right: readonly string[]
): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index]
    const rightSegment = right[index]
    if (leftSegment === undefined || rightSegment === undefined) {
      return left.length - right.length
    }
    if (leftSegment === rightSegment) {
      continue
    }
    return leftSegment < rightSegment ? -1 : 1
  }
  return left.length - right.length
}

function failure(
  message: string,
  code = 'dtcg.invalid-document',
  path?: readonly string[]
): GraphFailure {
  const diagnostic = Object.freeze({
    code,
    phase: 'source' as const,
    message,
    ...(path === undefined ? {} : { path }),
  })
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [typeof diagnostic],
  })
}

function invalid(message: string, path?: readonly string[]): AdapterIssue {
  return {
    code: 'dtcg.invalid-document',
    message,
    ...(path === undefined ? {} : { path }),
  }
}

function unsupported(message: string): AdapterIssue {
  return { code: 'dtcg.unsupported-feature', message }
}

function consumeWork(budget: WorkBudget, count = 1): boolean {
  if (!Number.isSafeInteger(count) || count < 0 || count > budget.remaining) {
    return false
  }
  budget.remaining -= count
  return true
}

function workLimitIssue(path?: readonly string[]): AdapterIssue {
  return invalid('The DTCG adapter reached its 100,000-item work limit.', path)
}

function failureFor(issue: AdapterIssue): GraphFailure {
  return failure(issue.message, issue.code, issue.path)
}

function validateMetadataValues(
  value: Record<string, unknown>,
  owner: 'group' | 'token'
): AdapterIssue | undefined {
  if (
    hasOwn(value, '$description') &&
    typeof Reflect.get(value, '$description') !== 'string'
  ) {
    return invalid(`A DTCG ${owner} description must be text.`)
  }
  if (hasOwn(value, '$deprecated')) {
    const deprecated = Reflect.get(value, '$deprecated')
    if (typeof deprecated !== 'boolean' && typeof deprecated !== 'string') {
      return invalid(`A DTCG ${owner} deprecation value is invalid.`)
    }
  }
  if (
    hasOwn(value, '$extensions') &&
    !isPlainRecord(Reflect.get(value, '$extensions'))
  ) {
    return invalid(`A DTCG ${owner} extension value must be an object.`)
  }
  return undefined
}

function validateGroupProperties(
  value: Record<string, unknown>
): AdapterIssue | undefined {
  const metadataIssue = validateMetadataValues(value, 'group')
  if (metadataIssue !== undefined) {
    return metadataIssue
  }
  for (const key of Object.keys(value)) {
    if (key === '$extends') {
      return unsupported(
        'DTCG group extension through $extends is not supported.'
      )
    }
    if (key === '$ref') {
      return unsupported('DTCG JSON Pointer references are not supported.')
    }
    if (key.startsWith('$') && !GROUP_PROPERTIES.has(key)) {
      return invalid(
        `A DTCG group contains the unknown reserved property "${key}".`
      )
    }
  }
  return undefined
}

function validateTokenProperties(
  value: Record<string, unknown>
): AdapterIssue | undefined {
  const metadataIssue = validateMetadataValues(value, 'token')
  if (metadataIssue !== undefined) {
    return metadataIssue
  }
  for (const key of Object.keys(value)) {
    if (key === '$extends') {
      return unsupported(
        'DTCG group extension through $extends is not supported.'
      )
    }
    if (key === '$ref') {
      return unsupported('DTCG JSON Pointer references are not supported.')
    }
    if (!key.startsWith('$')) {
      return invalid('A DTCG token cannot also contain child tokens or groups.')
    }
    if (!TOKEN_PROPERTIES.has(key)) {
      return invalid(
        `A DTCG token contains the unknown reserved property "${key}".`
      )
    }
  }
  return undefined
}

type TypeReadResult =
  | { readonly ok: true; readonly value: DTCGTokenType | undefined }
  | { readonly ok: false; readonly issue: AdapterIssue }

function readType(
  value: Record<string, unknown>,
  inheritedType: DTCGTokenType | undefined,
  owner: 'group' | 'token'
): TypeReadResult {
  if (!hasOwn(value, '$type')) {
    return { ok: true, value: inheritedType }
  }
  const type = Reflect.get(value, '$type')
  if (typeof type !== 'string') {
    return {
      ok: false,
      issue: invalid(`A DTCG ${owner} type must be text.`),
    }
  }
  if (!SUPPORTED_TOKEN_TYPES.has(type)) {
    return {
      ok: false,
      issue: unsupported(
        `The DTCG adapter does not support token type "${type}".`
      ),
    }
  }
  return { ok: true, value: type as DTCGTokenType }
}

type ReferenceReadResult =
  | { readonly kind: 'literal' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'work-limit' }
  | { readonly kind: 'reference'; readonly path: readonly string[] }

function looksLikeCurlyReference(value: string): boolean {
  return value.startsWith('{') && value.endsWith('}')
}

function readReference(
  value: unknown,
  budget: WorkBudget
): ReferenceReadResult {
  if (typeof value !== 'string' || !looksLikeCurlyReference(value)) {
    return { kind: 'literal' }
  }
  if (!consumeWork(budget)) {
    return { kind: 'work-limit' }
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value.charCodeAt(index) === 0x2e && !consumeWork(budget)) {
      return { kind: 'work-limit' }
    }
  }
  const segments = value.slice(1, -1).split('.')
  const finalIndex = segments.length - 1
  if (
    segments.length === 0 ||
    segments.some((segment, index) =>
      segment === '$root' ? index !== finalIndex : !isDTCGName(segment)
    )
  ) {
    return { kind: 'invalid' }
  }
  return { kind: 'reference', path: Object.freeze(segments) }
}

function scanLiteralValue(
  root: unknown,
  budget: WorkBudget,
  workLimitPath?: readonly string[]
): AdapterIssue | undefined {
  if (!consumeWork(budget)) {
    return workLimitIssue(workLimitPath)
  }
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value: root, depth: 0 },
  ]
  const seen = new WeakSet<object>()

  while (stack.length > 0) {
    const entry = stack.pop()
    if (entry === undefined) {
      break
    }
    const value = entry.value
    if (typeof value === 'string' && looksLikeCurlyReference(value)) {
      return unsupported(
        'A DTCG token value cannot contain a nested brace reference.'
      )
    }
    if (value === null || typeof value !== 'object') {
      continue
    }
    if (entry.depth > MAX_GRAPH_DEPTH) {
      return invalid('A DTCG token value can contain at most 64 levels.')
    }
    if (seen.has(value)) {
      return invalid(
        'A DTCG token value cannot contain a cycle or reuse the same object.'
      )
    }
    seen.add(value)

    if (Array.isArray(value)) {
      const length = value.length
      if (!consumeWork(budget, length)) {
        return workLimitIssue(workLimitPath)
      }
      for (let index = length - 1; index >= 0; index -= 1) {
        stack.push({ value: Reflect.get(value, index), depth: entry.depth + 1 })
      }
      continue
    }
    if (!isPlainRecord(value)) {
      return invalid('A DTCG token value must use plain objects and arrays.')
    }
    if (hasOwn(value, '$ref')) {
      return unsupported('DTCG JSON Pointer references are not supported.')
    }
    const keys = Object.keys(value)
    if (!consumeWork(budget, keys.length)) {
      return workLimitIssue(workLimitPath)
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]
      if (key !== undefined) {
        stack.push({
          value: Reflect.get(value, key),
          depth: entry.depth + 1,
        })
      }
    }
  }
  return undefined
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>
): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function fieldPath(path: readonly string[], field: string): readonly string[] {
  return Object.freeze([...path, field])
}

function valueTypeIssue(
  type: DTCGTokenType,
  path: readonly string[]
): AdapterIssue {
  return invalid(`A DTCG token value does not match type "${type}".`, path)
}

function componentMatchesRange(
  component: number,
  range: ComponentRange
): boolean {
  if (!Number.isFinite(component)) {
    return false
  }
  switch (range.kind) {
    case 'closed': {
      return component >= range.min && component <= range.max
    }
    case 'open-max': {
      return component >= range.min && component < range.max
    }
    case 'min': {
      return component >= range.min
    }
    case 'finite': {
      return true
    }
  }
}

type ColorValueReadResult =
  | { readonly ok: true; readonly value: DTCGColorValue }
  | { readonly ok: false; readonly issue: AdapterIssue }

function readColorValue(
  value: unknown,
  valuePath: readonly string[]
): ColorValueReadResult {
  const message = 'A DTCG token value does not match type "color".'
  if (!isPlainRecord(value)) {
    return { ok: false, issue: invalid(message, valuePath) }
  }
  const keys = Object.keys(value)
  if (
    keys.length < 2 ||
    keys.length > 4 ||
    !hasOwn(value, 'colorSpace') ||
    !hasOwn(value, 'components') ||
    !hasOnlyKeys(value, COLOR_VALUE_PROPERTIES)
  ) {
    return { ok: false, issue: invalid(message, valuePath) }
  }

  const colorSpaceValue = Reflect.get(value, 'colorSpace')
  const ranges =
    typeof colorSpaceValue === 'string'
      ? COLOR_SPACE_RANGES.get(colorSpaceValue as DTCGColorSpace)
      : undefined
  if (ranges === undefined) {
    return {
      ok: false,
      issue: invalid(message, fieldPath(valuePath, 'colorSpace')),
    }
  }
  const colorSpace = colorSpaceValue as DTCGColorSpace

  const componentsPath = fieldPath(valuePath, 'components')
  const componentsValue = Reflect.get(value, 'components')
  if (!Array.isArray(componentsValue) || componentsValue.length !== 3) {
    return { ok: false, issue: invalid(message, componentsPath) }
  }
  const components: [
    DTCGColorComponent,
    DTCGColorComponent,
    DTCGColorComponent,
  ] = [0, 0, 0]
  for (const index of [0, 1, 2] as const) {
    const componentPath = fieldPath(componentsPath, String(index))
    if (!hasOwn(componentsValue, index)) {
      return { ok: false, issue: invalid(message, componentPath) }
    }
    const component = Reflect.get(componentsValue, index)
    if (component === 'none') {
      components[index] = component
      continue
    }
    if (
      typeof component !== 'number' ||
      !componentMatchesRange(component, ranges[index])
    ) {
      return { ok: false, issue: invalid(message, componentPath) }
    }
    components[index] = component
  }

  const hasAlpha = hasOwn(value, 'alpha')
  let alpha: number | undefined
  if (hasAlpha) {
    const alphaValue = Reflect.get(value, 'alpha')
    if (!isFiniteNumber(alphaValue) || alphaValue < 0 || alphaValue > 1) {
      return {
        ok: false,
        issue: invalid(message, fieldPath(valuePath, 'alpha')),
      }
    }
    alpha = alphaValue
  }

  const hasHex = hasOwn(value, 'hex')
  let hex: string | undefined
  if (hasHex) {
    const hexValue = Reflect.get(value, 'hex')
    if (typeof hexValue !== 'string' || !/^#[0-9a-fA-F]{6}$/u.test(hexValue)) {
      return {
        ok: false,
        issue: invalid(message, fieldPath(valuePath, 'hex')),
      }
    }
    hex = hexValue
  }

  return {
    ok: true,
    value: {
      colorSpace,
      components,
      ...(alpha === undefined ? {} : { alpha }),
      ...(hex === undefined ? {} : { hex }),
    },
  }
}

function isColorValue(value: unknown): boolean {
  return readColorValue(value, []).ok
}

function dimensionValueIssue(
  value: unknown,
  valuePath: readonly string[]
): AdapterIssue | undefined {
  const message = 'A DTCG token value does not match type "dimension".'
  if (!isPlainRecord(value)) {
    return invalid(message, valuePath)
  }
  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    !hasOwn(value, 'value') ||
    !hasOwn(value, 'unit') ||
    !hasOnlyKeys(value, VALUE_UNIT_PROPERTIES)
  ) {
    return invalid(message, valuePath)
  }
  if (!isFiniteNumber(value.value)) {
    return invalid(message, fieldPath(valuePath, 'value'))
  }
  if (value.unit !== 'px' && value.unit !== 'rem') {
    return invalid(message, fieldPath(valuePath, 'unit'))
  }
  return undefined
}

function isDimensionValue(value: unknown): boolean {
  return dimensionValueIssue(value, []) === undefined
}

function durationValueIssue(
  value: unknown,
  valuePath: readonly string[]
): AdapterIssue | undefined {
  if (!isPlainRecord(value)) {
    return valueTypeIssue('duration', valuePath)
  }
  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    !hasOwn(value, 'value') ||
    !hasOwn(value, 'unit') ||
    !hasOnlyKeys(value, VALUE_UNIT_PROPERTIES)
  ) {
    return valueTypeIssue('duration', valuePath)
  }
  if (!isFiniteNumber(value.value)) {
    return valueTypeIssue('duration', fieldPath(valuePath, 'value'))
  }
  if (value.unit !== 'ms' && value.unit !== 's') {
    return valueTypeIssue('duration', fieldPath(valuePath, 'unit'))
  }
  return undefined
}

type FontFamilyValueReadResult =
  | { readonly ok: true; readonly value: string | readonly string[] }
  | { readonly ok: false; readonly issue: AdapterIssue }

function readFontFamilyValue(
  value: unknown,
  valuePath: readonly string[]
): FontFamilyValueReadResult {
  if (typeof value === 'string') {
    return { ok: true, value }
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      issue: valueTypeIssue('fontFamily', valuePath),
    }
  }
  const length = value.length
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_GRAPH_ITEMS) {
    return { ok: false, issue: workLimitIssue(valuePath) }
  }
  const names: string[] = []
  for (let index = 0; index < length; index += 1) {
    const itemPath = fieldPath(valuePath, String(index))
    if (!hasOwn(value, index)) {
      return {
        ok: false,
        issue: valueTypeIssue('fontFamily', itemPath),
      }
    }
    const name = Reflect.get(value, index)
    if (typeof name !== 'string') {
      return {
        ok: false,
        issue: valueTypeIssue('fontFamily', itemPath),
      }
    }
    names.push(name)
  }
  return { ok: true, value: Object.freeze(names) }
}

function fontWeightValueIssue(
  value: unknown,
  valuePath: readonly string[]
): AdapterIssue | undefined {
  if (
    (isFiniteNumber(value) && value >= 1 && value <= 1000) ||
    (typeof value === 'string' && FONT_WEIGHT_NAMES.has(value))
  ) {
    return undefined
  }
  return valueTypeIssue('fontWeight', valuePath)
}

function matchesType(type: DTCGTokenType, value: unknown): boolean {
  switch (type) {
    case 'color': {
      return isColorValue(value)
    }
    case 'dimension': {
      return isDimensionValue(value)
    }
    case 'duration': {
      return durationValueIssue(value, []) === undefined
    }
    case 'fontWeight': {
      return fontWeightValueIssue(value, []) === undefined
    }
    case 'number': {
      return isFiniteNumber(value)
    }
    case 'fontFamily': {
      return readFontFamilyValue(value, []).ok
    }
    case 'string': {
      return typeof value === 'string'
    }
    case 'boolean': {
      return typeof value === 'boolean'
    }
  }
}

function createTokenInput(input: {
  readonly sourceId: SourceId
  readonly groupId?: GroupId
  readonly name: string
  readonly path: readonly string[]
  readonly value: Record<string, unknown>
  readonly inheritedType: DTCGTokenType | undefined
  readonly uri?: string
}): TokenInput | GraphFailure {
  const propertyIssue = validateTokenProperties(input.value)
  if (propertyIssue !== undefined) {
    return failureFor(propertyIssue)
  }
  const typeResult = readType(input.value, input.inheritedType, 'token')
  if (!typeResult.ok) {
    return failureFor(typeResult.issue)
  }
  if (input.path.length > MAX_GRAPH_DEPTH) {
    return failure('A DTCG token path can contain at most 64 path segments.')
  }
  if (!joinedPathFitsLimit(input.path)) {
    return failure('A DTCG token path can contain at most 256 characters.')
  }
  const idResult = qualifyId({
    sourceId: input.sourceId,
    kind: 'token',
    localId: input.path.join('.'),
  })
  if (!idResult.ok) {
    return idResult
  }
  const provenance = Object.freeze([
    Object.freeze({
      ...(input.uri === undefined ? {} : { uri: input.uri }),
      pointer: pointer(input.path),
    }),
  ])
  return {
    id: idResult.value,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    name: input.name,
    path: input.path,
    type: typeResult.value,
    value: Reflect.get(input.value, '$value'),
    provenance,
  }
}

function prepareToken(
  token: TokenInput,
  sourceId: SourceId,
  budget: WorkBudget
): PreparedToken | GraphFailure {
  const typedValuePath =
    token.type === 'dimension' ||
    token.type === 'color' ||
    token.type === 'duration' ||
    token.type === 'fontFamily' ||
    token.type === 'fontWeight'
      ? fieldPath(token.path, '$value')
      : undefined
  const reference = readReference(token.value, budget)
  if (reference.kind === 'work-limit') {
    return failureFor(workLimitIssue(typedValuePath))
  }
  if (reference.kind === 'invalid') {
    return failure('A DTCG reference path is invalid.')
  }
  if (reference.kind === 'reference') {
    const target = qualifyId({
      sourceId,
      kind: 'token',
      localId: reference.path.join('.'),
    })
    if (!target.ok) {
      return failure('A DTCG reference path is invalid.')
    }
    return {
      ...token,
      coreValue: { kind: 'reference', target: target.value },
      referencePath: reference.path,
    }
  }

  const valueIssue = scanLiteralValue(token.value, budget, typedValuePath)
  if (valueIssue !== undefined) {
    return failureFor(valueIssue)
  }
  return {
    ...token,
    coreValue: { kind: 'literal', value: token.value },
  }
}

type InferredTypeResult =
  | { readonly ok: true; readonly value: DTCGTokenType }
  | { readonly ok: false; readonly failure: GraphFailure }

function inferTokenType(
  start: PreparedToken,
  tokensByPath: ReadonlyMap<string, PreparedToken>,
  memo: Map<PreparedToken, DTCGTokenType>
): InferredTypeResult {
  const chain: PreparedToken[] = []
  const seen = new Set<PreparedToken>()
  let current = start
  let resolvedType: DTCGTokenType | undefined

  while (resolvedType === undefined) {
    const knownType = memo.get(current) ?? current.type
    if (knownType !== undefined) {
      resolvedType = knownType
      break
    }
    if (seen.has(current)) {
      return {
        ok: false,
        failure: failure(
          'A reference cycle cannot provide a type for an untyped DTCG alias.'
        ),
      }
    }
    seen.add(current)
    chain.push(current)
    if (current.referencePath === undefined) {
      return {
        ok: false,
        failure: failure('A DTCG literal token needs a supported $type.'),
      }
    }
    const target = tokensByPath.get(pathKey(current.referencePath))
    if (target === undefined) {
      return {
        ok: false,
        failure: failure(
          'An untyped DTCG alias needs a typed reference target in the document.'
        ),
      }
    }
    current = target
  }

  for (const token of chain) {
    memo.set(token, resolvedType)
  }
  return { ok: true, value: resolvedType }
}

/**
 * Read Primitree's supported DTCG value subset into a Core graph fragment.
 *
 * @remarks
 * The caller reads and parses JSON. This function performs no file I/O.
 *
 * A group `$type` applies to its child groups and tokens until another group or
 * token sets its own type. The reader accepts `$root` and keeps `$root` as the
 * final token path segment.
 *
 * Supported DTCG token types are `color`, `dimension`, `duration`, `number`,
 * `fontWeight`, `fontFamily`, and `string`. The reader also accepts Primitree's
 * documented `boolean` extension.
 *
 * Color values may use any of the 14 color spaces checked by this package.
 * Each color has three components in the allowed range for its color space. A
 * component may be `none`. Alpha from 0 through 1 and six-digit hex text are
 * optional. Dimension values use a finite number with `px` or `rem`. Duration
 * values use a finite number with `ms` or `s`. Number values must be finite.
 * Font weights use numbers from 1 through 1000 or the names listed by DTCG.
 * Font families use one name or an ordered list of names. String values use
 * text.
 *
 * The reader creates immediate edges for whole-token brace references in the
 * supplied document. An alias may omit `$type` when its reference chain reaches
 * a typed token. The reader requires an alias and its immediate target to have
 * the same effective type whenever that target exists. Core resolves token
 * values later.
 *
 * A typed alias may keep a missing target for Core `composeGraph` to report. A
 * cycle whose aliases share one effective type remains in the fragment. Core
 * `resolveToken` reports `graph.reference-cycle` when a caller resolves a token
 * in that cycle.
 * The reader rejects a cycle with no type because it cannot infer that type.
 *
 * The reader checks that `$description` is text, `$deprecated` is boolean or
 * text, and `$extensions` is a plain object. Core graph records do not store
 * those fields, so the returned fragment omits them.
 *
 * Group and token paths may contain at most 64 segments. Their dot-joined paths
 * may contain at most 256 characters. Token values may contain at most 64
 * nested levels.
 *
 * Each call has one 100,000-item work budget. It counts document entries,
 * brace-reference segments, each literal value scan, token-value object keys,
 * and token-value array entries.
 *
 * The reader rejects `$extends`, JSON Pointer references, references nested
 * inside literal values, unknown reserved properties, and token types outside
 * the supported list.
 *
 * @param document - Parsed token document that uses the supported value subset.
 * @param options - Source name and optional provenance URI.
 * @returns A Core result containing a graph fragment or source diagnostics.
 *
 * @example
 * ```ts
 * import { createDTCGGraphFragment } from '@primitree/dtcg'
 *
 * const result = createDTCGGraphFragment(
 *   {
 *     scale: {
 *       $type: 'number',
 *       base: { $value: 4 },
 *       control: { $value: '{scale.base}' },
 *     },
 *   },
 *   { source: 'brand', uri: 'tokens.json' }
 * )
 *
 * if (!result.ok) {
 *   throw new Error(result.diagnostics[0]?.message ?? 'DTCG input failed')
 * }
 *
 * const fragment = result.value
 * ```
 *
 * @see [DTCG 2025.10 Format Module](https://www.designtokens.org/tr/2025.10/format/)
 *
 * @public
 */
export function createDTCGGraphFragment(
  document: unknown,
  options: DTCGGraphFragmentOptions
): Result<GraphFragment> {
  try {
    if (!isPlainRecord(document) || !isPlainRecord(options)) {
      return failure('A DTCG graph needs a token document and source options.')
    }
    const sourceResult = createSourceId(options.source)
    if (!sourceResult.ok) {
      return sourceResult
    }
    const sourceId = sourceResult.value
    if (options.uri !== undefined && typeof options.uri !== 'string') {
      return failure('A DTCG source URI must be text.')
    }

    const groups: Array<{
      readonly id: GroupId
      readonly sourceId: SourceId
      readonly name: string
      readonly path: readonly string[]
      readonly provenance: readonly Provenance[]
    }> = []
    const tokens: TokenInput[] = []
    const queue: Array<{
      readonly value: Record<string, unknown>
      readonly path: readonly string[]
      readonly groupId?: GroupId
      readonly inheritedType: DTCGTokenType | undefined
    }> = [{ value: document, path: [], inheritedType: undefined }]
    const seenGroups = new WeakSet<object>([document])
    const workBudget: WorkBudget = { remaining: MAX_GRAPH_ITEMS }

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const group = queue[queueIndex]
      if (group === undefined) {
        break
      }
      const propertyIssue = validateGroupProperties(group.value)
      if (propertyIssue !== undefined) {
        return failureFor(propertyIssue)
      }
      const typeResult = readType(group.value, group.inheritedType, 'group')
      if (!typeResult.ok) {
        return failureFor(typeResult.issue)
      }
      const groupType = typeResult.value

      const childNames = Object.keys(group.value).filter(
        name => !name.startsWith('$') || name === '$root'
      )
      if (!consumeWork(workBudget, childNames.length)) {
        return failureFor(workLimitIssue())
      }

      for (const name of childNames) {
        const child = Reflect.get(group.value, name)

        if (name === '$root') {
          if (!isToken(child)) {
            return failure('The DTCG $root entry must be a token.')
          }
          const tokenPath = Object.freeze([...group.path, '$root'])
          const token = createTokenInput({
            sourceId,
            ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
            name: '$root',
            path: tokenPath,
            value: child,
            inheritedType: groupType,
            ...(options.uri === undefined ? {} : { uri: options.uri }),
          })
          if ('ok' in token) {
            return token
          }
          tokens.push(token)
          continue
        }

        if (!isDTCGName(name)) {
          return failure(`The DTCG name "${name}" is invalid.`)
        }
        if (isToken(child)) {
          const tokenPath = Object.freeze([...group.path, name])
          const token = createTokenInput({
            sourceId,
            ...(group.groupId === undefined ? {} : { groupId: group.groupId }),
            name,
            path: tokenPath,
            value: child,
            inheritedType: groupType,
            ...(options.uri === undefined ? {} : { uri: options.uri }),
          })
          if ('ok' in token) {
            return token
          }
          tokens.push(token)
          continue
        }

        if (!isPlainRecord(child)) {
          return failure('Each DTCG group entry must be a group or token.')
        }
        if (seenGroups.has(child)) {
          return failure(
            'A DTCG document cannot reuse a group object or contain a group cycle.'
          )
        }
        const groupPath = Object.freeze([...group.path, name])
        if (groupPath.length > MAX_GRAPH_DEPTH) {
          return failure(
            'A DTCG group path can contain at most 64 path segments.'
          )
        }
        if (!joinedPathFitsLimit(groupPath)) {
          return failure(
            'A DTCG group path can contain at most 256 characters.'
          )
        }
        const idResult = qualifyId({
          sourceId,
          kind: 'group',
          localId: groupPath.join('.'),
        })
        if (!idResult.ok) {
          return idResult
        }
        const provenance = Object.freeze([
          Object.freeze({
            ...(options.uri === undefined ? {} : { uri: options.uri }),
            pointer: pointer(groupPath),
          }),
        ])
        groups.push({
          id: idResult.value,
          sourceId,
          name,
          path: groupPath,
          provenance,
        })
        seenGroups.add(child)
        queue.push({
          value: child,
          path: groupPath,
          groupId: idResult.value,
          inheritedType: groupType,
        })
      }
    }

    groups.sort((left, right) => comparePaths(left.path, right.path))
    tokens.sort((left, right) => comparePaths(left.path, right.path))

    const preparedTokens: PreparedToken[] = []
    for (const token of tokens) {
      const prepared = prepareToken(token, sourceId, workBudget)
      if ('ok' in prepared) {
        return prepared
      }
      preparedTokens.push(prepared)
    }
    const tokensByPath = new Map(
      preparedTokens.map(token => [pathKey(token.path), token])
    )
    const inferredTypes = new Map<PreparedToken, DTCGTokenType>()
    const coreTokens = []
    for (const token of preparedTokens) {
      const typeResult = inferTokenType(token, tokensByPath, inferredTypes)
      if (!typeResult.ok) {
        return typeResult.failure
      }
      if (token.referencePath !== undefined) {
        const target = tokensByPath.get(pathKey(token.referencePath))
        if (target !== undefined) {
          const targetTypeResult = inferTokenType(
            target,
            tokensByPath,
            inferredTypes
          )
          if (!targetTypeResult.ok) {
            return targetTypeResult.failure
          }
          if (typeResult.value !== targetTypeResult.value) {
            return failure(
              'A DTCG alias type does not match its reference target.',
              'dtcg.invalid-document',
              fieldPath(token.path, '$value')
            )
          }
        }
      }
      let coreValue = token.coreValue
      if (
        token.coreValue.kind === 'literal' &&
        typeResult.value === 'dimension'
      ) {
        const issue = dimensionValueIssue(
          token.value,
          fieldPath(token.path, '$value')
        )
        if (issue !== undefined) {
          return failureFor(issue)
        }
      } else if (
        token.coreValue.kind === 'literal' &&
        typeResult.value === 'color'
      ) {
        const color = readColorValue(
          token.value,
          fieldPath(token.path, '$value')
        )
        if (!color.ok) {
          return failureFor(color.issue)
        }
        coreValue = { kind: 'literal', value: color.value }
      } else if (
        token.coreValue.kind === 'literal' &&
        typeResult.value === 'duration'
      ) {
        const issue = durationValueIssue(
          token.value,
          fieldPath(token.path, '$value')
        )
        if (issue !== undefined) {
          return failureFor(issue)
        }
      } else if (
        token.coreValue.kind === 'literal' &&
        typeResult.value === 'fontFamily'
      ) {
        const family = readFontFamilyValue(
          token.value,
          fieldPath(token.path, '$value')
        )
        if (!family.ok) {
          return failureFor(family.issue)
        }
        coreValue = { kind: 'literal', value: family.value }
      } else if (
        token.coreValue.kind === 'literal' &&
        typeResult.value === 'fontWeight'
      ) {
        const issue = fontWeightValueIssue(
          token.value,
          fieldPath(token.path, '$value')
        )
        if (issue !== undefined) {
          return failureFor(issue)
        }
      } else if (
        token.coreValue.kind === 'literal' &&
        !matchesType(typeResult.value, token.value)
      ) {
        return failure(
          `A DTCG token value does not match type "${typeResult.value}".`
        )
      }
      coreTokens.push({
        id: token.id,
        sourceId,
        ...(token.groupId === undefined ? {} : { groupId: token.groupId }),
        name: token.name,
        path: token.path,
        type: typeResult.value,
        values: [
          {
            value: coreValue,
            provenance: token.provenance,
          },
        ],
        provenance: token.provenance,
      })
    }

    return createGraphFragment({
      source: {
        id: sourceId,
        type: 'dtcg',
        ...(options.uri === undefined
          ? {}
          : { provenance: [{ uri: options.uri }] }),
      },
      groups,
      tokens: coreTokens,
    })
  } catch {
    return failure('The DTCG adapter could not read the token document.')
  }
}
