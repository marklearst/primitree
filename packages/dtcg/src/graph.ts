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
import type { DTCGTokenType } from './types'

const MAX_GRAPH_ITEMS = 100_000
const MAX_GRAPH_DEPTH = 64

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

export interface DTCGGraphOptions {
  /** Name used to create the Core source ID. */
  readonly source: string
  /** File name or URI copied into provenance records. */
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

function pointer(path: readonly string[]): string {
  return `/${path
    .map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/')}`
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}

function failure(
  message: string,
  code = 'dtcg.invalid-document'
): GraphFailure {
  const diagnostic = Object.freeze({
    code,
    phase: 'source' as const,
    message,
  })
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [typeof diagnostic],
  })
}

function invalid(message: string): AdapterIssue {
  return { code: 'dtcg.invalid-document', message }
}

function unsupported(message: string): AdapterIssue {
  return { code: 'dtcg.unsupported-feature', message }
}

function consumeWork(budget: WorkBudget, count = 1): boolean {
  if (count > budget.remaining) {
    return false
  }
  budget.remaining -= count
  return true
}

function workLimitIssue(): AdapterIssue {
  return invalid('The DTCG adapter reached its 100,000-item work limit.')
}

function failureFor(issue: AdapterIssue): GraphFailure {
  return failure(issue.message, issue.code)
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
  budget: WorkBudget
): AdapterIssue | undefined {
  if (!consumeWork(budget)) {
    return workLimitIssue()
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
      if (!consumeWork(budget, value.length)) {
        return workLimitIssue()
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
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
      return workLimitIssue()
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

function isFiniteNumberTuple(value: unknown, length: number): boolean {
  if (!Array.isArray(value) || value.length !== length) {
    return false
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index) || !isFiniteNumber(Reflect.get(value, index))) {
      return false
    }
  }
  return true
}

function isColorValue(value: unknown): boolean {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(['colorSpace', 'components', 'alpha', 'hex'])
    ) ||
    value.colorSpace !== 'srgb' ||
    !isFiniteNumberTuple(value.components, 3)
  ) {
    return false
  }
  return (
    (value.alpha === undefined || isFiniteNumber(value.alpha)) &&
    (value.hex === undefined || typeof value.hex === 'string')
  )
}

function isDimensionValue(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, new Set(['value', 'unit'])) &&
    isFiniteNumber(value.value) &&
    (value.unit === 'px' || value.unit === 'rem')
  )
}

function isDurationValue(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, new Set(['value', 'unit'])) &&
    isFiniteNumber(value.value) &&
    (value.unit === 'ms' || value.unit === 's')
  )
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
      return isDurationValue(value)
    }
    case 'number':
    case 'fontWeight': {
      return isFiniteNumber(value)
    }
    case 'fontFamily':
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
  const reference = readReference(token.value, budget)
  if (reference.kind === 'work-limit') {
    return failureFor(workLimitIssue())
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

  const valueIssue = scanLiteralValue(token.value, budget)
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
 * Convert one token document from Primitree's DTCG value set into a Core graph
 * fragment.
 *
 * @remarks
 * The adapter supports group type inheritance, `$root`, and whole-token brace
 * references. It returns a source diagnostic for group extension, nested brace
 * references, JSON Pointer references, and token types that this package does
 * not support. It checks DTCG descriptions, deprecation values, and extensions.
 * Core graph records do not store those fields, so the adapter omits them.
 *
 * @param document - DTCG token document to read.
 * @param options - Source name and optional provenance URI.
 * @returns A graph fragment result or a source diagnostic.
 *
 * @public
 */
export function toGraphFragment(
  document: unknown,
  options: DTCGGraphOptions
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
      if (
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
            value: token.coreValue,
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
