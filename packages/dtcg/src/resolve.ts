import type {
  DTCGDocument,
  DTCGGroup,
  DTCGRef,
  DTCGToken,
  DTCGTokenType,
  DTCGTokenValue,
  ResolverDocument,
} from './types'
import { createDictionary, hasOwn } from './dictionary'
import { isReferenceValue, isToken } from './types'

/** A flattened token with its dot-joined path. @public */
export interface FlatToken {
  path: string
  token: DTCGToken
}

/**
 * A flattened token and the type that applies after inheritance and alias
 * lookup.
 *
 * @remarks
 * `type` is `undefined` when the token has no declaration, inherits no group
 * declaration, and its whole-token alias chain reaches no typed token.
 *
 * @public
 */
export interface TypedFlatToken extends FlatToken {
  /** Effective token type, or `undefined` when no type can be found. */
  type: DTCGTokenType | undefined
}

/** @internal */
export interface ResolverWorkBudget {
  remaining: number
  readonly errorMessage: string
  readonly maxDepth?: number
  readonly depthErrorMessage?: string
}

/** @internal */
export function chargeResolverWork(
  budget: ResolverWorkBudget,
  amount = 1
): void {
  if (amount > budget.remaining) {
    throw new TypeError(budget.errorMessage)
  }
  budget.remaining -= amount
}

function assertResolverDepth(
  budget: ResolverWorkBudget | undefined,
  depth: number
): void {
  if (budget?.maxDepth !== undefined && depth > budget.maxDepth) {
    throw new TypeError(budget.depthErrorMessage ?? budget.errorMessage)
  }
}

export function flattenTypedTokensWithBudget(
  document: DTCGDocument,
  budget: ResolverWorkBudget,
  options: {
    readonly maxItems?: number
    readonly itemLimitMessage?: string
    readonly sort?: boolean
  } = {}
): TypedFlatToken[] {
  const entries: Array<{
    readonly path: string
    readonly token: DTCGToken
    readonly declaredType: DTCGTokenType | undefined
  }> = []
  let items = 0

  function walk(
    group: DTCGGroup,
    prefix: string,
    inheritedType: DTCGTokenType | undefined,
    depth: number
  ): void {
    assertResolverDepth(budget, depth)
    const groupType = hasOwn(group, '$type')
      ? Reflect.get(group, '$type')
      : undefined
    const type =
      typeof groupType === 'string'
        ? (groupType as DTCGTokenType)
        : inheritedType
    const groupEntries = Object.entries(group)
    chargeResolverWork(budget, groupEntries.length)
    for (const [key, value] of groupEntries) {
      items += 1
      if (options.maxItems !== undefined && items > options.maxItems) {
        throw new TypeError(options.itemLimitMessage ?? budget.errorMessage)
      }
      if (key.startsWith('$') && key !== '$root') {
        continue
      }
      const pathLength =
        prefix.length === 0 ? key.length : prefix.length + key.length + 1
      chargeResolverWork(budget, pathLength + 1)
      const path = prefix.length === 0 ? key : `${prefix}.${key}`
      if (isToken(value)) {
        entries.push({
          path,
          token: value,
          declaredType: hasOwn(value, '$type') ? value.$type : type,
        })
      } else {
        walk(value as DTCGGroup, path, type, depth + 1)
      }
    }
  }

  walk(document, '', undefined, 0)
  chargeResolverWork(budget, entries.length)
  const byPath = new Map(entries.map(entry => [entry.path, entry]))
  const resolved = new Map<string, DTCGTokenType | undefined>()

  function resolveType(
    start: (typeof entries)[number]
  ): DTCGTokenType | undefined {
    const active = new Set<string>()
    const trail: string[] = []
    let entry: (typeof entries)[number] | undefined = start
    let type: DTCGTokenType | undefined

    while (entry !== undefined) {
      chargeResolverWork(budget)
      if (entry.declaredType !== undefined) {
        type = entry.declaredType
        break
      }
      if (resolved.has(entry.path)) {
        type = resolved.get(entry.path)
        break
      }
      if (active.has(entry.path) || !isReferenceValue(entry.token.$value)) {
        break
      }
      chargeResolverWork(budget, entry.token.$value.length + 1)
      active.add(entry.path)
      trail.push(entry.path)
      entry = byPath.get(entry.token.$value.slice(1, -1))
    }

    chargeResolverWork(budget, trail.length)
    for (const path of trail) {
      resolved.set(path, type)
    }
    return type
  }

  const typed = entries.map(entry => ({
    path: entry.path,
    token: entry.token,
    type: resolveType(entry),
  }))
  if (options.sort === true && typed.length > 1) {
    chargeResolverWork(
      budget,
      typed.length * Math.ceil(Math.log2(typed.length))
    )
    typed.sort((left, right) =>
      left.path === right.path ? 0 : left.path < right.path ? -1 : 1
    )
  }
  return typed
}

function publicResolverBudget(
  errorMessage: string,
  depthErrorMessage: string
): ResolverWorkBudget {
  return {
    remaining: 1_000_000,
    errorMessage,
    maxDepth: 64,
    depthErrorMessage,
  }
}

/**
 * Flatten a DTCG document and include each token's effective type.
 *
 * @remarks
 * A token's effective type comes from its own `$type`, an inherited group
 * `$type`, or the target of an untyped whole-token alias.
 *
 * One call reads at most 64 token-group levels and spends at most 1,000,000
 * work units on document entries, token paths, and alias type resolution.
 *
 * @param document - Token document to flatten.
 * @returns Tokens with their dot-joined paths and effective types.
 *
 * @throws {@link ReferenceResolutionError} - The document is malformed.
 * @throws `TypeError` - The call exceeds its depth or work limit.
 *
 * @public
 */
export function flattenTypedTokens(document: DTCGDocument): TypedFlatToken[] {
  const budget = publicResolverBudget(
    'Typed token flattening exceeds the 1,000,000-unit work limit.',
    'Typed token flattening can read at most 64 token-group levels.'
  )
  validateTokenDocument(document, '#/document', budget)
  return flattenTypedTokensWithBudget(document, budget)
}

/**
 * Deep-merge DTCG documents; later documents override earlier ones at the
 * token level (a token in a later document replaces the same path).
 *
 * One call reads at most 64 token-group levels and spends at most 1,000,000
 * work units on document entries and group paths.
 *
 * @throws `TypeError` - The call exceeds its depth or work limit.
 *
 * @public
 */
export function mergeDocuments(documents: DTCGDocument[]): DTCGDocument {
  return mergeDocumentsWithBudget(
    documents,
    publicResolverBudget(
      'Token document merging exceeds the 1,000,000-unit work limit.',
      'Token document merging can read at most 64 token-group levels.'
    )
  )
}

/** @internal */
export function mergeDocumentsWithBudget(
  documents: DTCGDocument[],
  budget?: ResolverWorkBudget
): DTCGDocument {
  const result: DTCGGroup = createDictionary()
  const validatedDocuments = ownArrayElements(documents, '#/documents', budget)

  for (let index = 0; index < validatedDocuments.length; index += 1) {
    validateTokenDocument(
      validatedDocuments[index],
      `#/documents/${index}`,
      budget
    )
  }

  function mergeInto(
    target: DTCGGroup,
    source: DTCGGroup,
    depth: number
  ): void {
    assertResolverDepth(budget, depth)
    const entries = Object.entries(source)
    if (budget !== undefined) {
      chargeResolverWork(budget, entries.length)
    }
    for (const [key, value] of entries) {
      if (isReservedGroupProperty(key)) {
        Reflect.set(target, key, value)
        continue
      }
      if (isToken(value)) {
        target[key] = value
        continue
      }
      const existing = hasOwn(target, key) ? target[key] : undefined
      if (existing !== undefined && !isToken(existing) && isRecord(existing)) {
        mergeInto(existing as DTCGGroup, value as DTCGGroup, depth + 1)
      } else {
        const next: DTCGGroup = createDictionary()
        mergeInto(next, value as DTCGGroup, depth + 1)
        target[key] = next
      }
    }
  }

  for (let index = 0; index < validatedDocuments.length; index += 1) {
    mergeInto(result, validatedDocuments[index] as DTCGDocument, 0)
  }
  return result
}

/**
 * Flatten a DTCG document into a list of `{ path, token }` entries.
 *
 * One call reads at most 64 token-group levels and spends at most 1,000,000
 * work units on document entries and token paths.
 *
 * @throws `TypeError` - The call exceeds its depth or work limit.
 *
 * @public
 */
export function flattenTokens(document: DTCGDocument): FlatToken[] {
  return flattenTokensWithBudget(
    document,
    publicResolverBudget(
      'Token flattening exceeds the 1,000,000-unit work limit.',
      'Token flattening can read at most 64 token-group levels.'
    )
  )
}

/** @internal */
export function flattenTokensWithBudget(
  document: DTCGDocument,
  budget?: ResolverWorkBudget
): FlatToken[] {
  validateTokenDocument(document, '#/document', budget)
  const flat: FlatToken[] = []

  function walk(group: DTCGGroup, prefix: string, depth: number): void {
    assertResolverDepth(budget, depth)
    const entries = Object.entries(group)
    if (budget !== undefined) {
      chargeResolverWork(budget, entries.length)
    }
    for (const [key, value] of entries) {
      if (key.startsWith('$') && key !== '$root') {
        continue
      }
      const separatorLength = prefix.length === 0 ? 0 : 1
      if (budget !== undefined) {
        chargeResolverWork(budget, prefix.length + separatorLength + key.length)
      }
      const tokenPath = prefix.length === 0 ? key : `${prefix}.${key}`
      if (isToken(value)) {
        flat.push({ path: tokenPath, token: value })
      } else {
        walk(value as DTCGGroup, tokenPath, depth + 1)
      }
    }
  }

  walk(document, '', 0)
  return flat
}

/**
 * Resolver functions throw this error for an unresolved DTCG reference.
 *
 * @public
 */
export class ReferenceResolutionError extends Error {
  public readonly path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'ReferenceResolutionError'
    this.path = path
  }
}

const TOKEN_REFERENCE_WORK_LIMIT_MESSAGE =
  'Token reference resolution exceeds the 1,000,000-unit work limit.'

function tokenReferenceBudget(): ResolverWorkBudget {
  return {
    remaining: 1_000_000,
    errorMessage: TOKEN_REFERENCE_WORK_LIMIT_MESSAGE,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownArrayElements<T>(
  values: T[],
  path: string,
  budget?: ResolverWorkBudget
): T[] {
  const ownValues: T[] = []
  if (budget !== undefined) {
    chargeResolverWork(budget, values.length)
  }
  for (let index = 0; index < values.length; index += 1) {
    const entryPath = `${path}/${index}`
    if (!hasOwn(values, index)) {
      throw new ReferenceResolutionError(
        `Array entry at "${entryPath}" must be an own element`,
        entryPath
      )
    }
    ownValues.push(values[index] as T)
  }
  return ownValues
}

function isReservedGroupProperty(key: string): boolean {
  return key.startsWith('$') && key !== '$root'
}

function validateTokenDocument(
  document: unknown,
  path: string,
  budget?: ResolverWorkBudget
): void {
  const activeGroups = new WeakSet<object>()

  function validateGroup(
    group: unknown,
    groupPath: string,
    depth: number
  ): void {
    assertResolverDepth(budget, depth)
    if (!isRecord(group)) {
      throw new ReferenceResolutionError(
        `Token document group at "${groupPath}" must be an object`,
        groupPath
      )
    }
    if (activeGroups.has(group)) {
      throw new ReferenceResolutionError(
        `Token document group cycle at "${groupPath}"`,
        groupPath
      )
    }

    activeGroups.add(group)
    try {
      const entries = Object.entries(group)
      if (budget !== undefined) {
        chargeResolverWork(budget, entries.length)
      }
      for (const [key, child] of entries) {
        if (isReservedGroupProperty(key) || isToken(child)) {
          continue
        }

        if (budget !== undefined) {
          chargeResolverWork(budget, groupPath.length + key.length + 1)
        }
        const childPath = `${groupPath}/${key}`
        if (!isRecord(child)) {
          throw new ReferenceResolutionError(
            `Token document group child at "${childPath}" must be an object or token`,
            childPath
          )
        }
        validateGroup(child, childPath, depth + 1)
      }
    } finally {
      activeGroups.delete(group)
    }
  }

  validateGroup(document, path, 0)
}

function resolverRecord(resolver: ResolverDocument): Record<string, unknown> {
  if (!isRecord(resolver)) {
    throw new ReferenceResolutionError(
      'Resolver document must be an object',
      '#'
    )
  }
  return resolver as unknown as Record<string, unknown>
}

function resolutionOrderOf(
  resolver: Record<string, unknown>,
  budget?: ResolverWorkBudget
): unknown[] {
  if (!hasOwn(resolver, 'resolutionOrder')) {
    throw new ReferenceResolutionError(
      'Resolver resolutionOrder must be an own array',
      '#/resolutionOrder'
    )
  }
  const resolutionOrder = resolver.resolutionOrder
  if (!Array.isArray(resolutionOrder)) {
    throw new ReferenceResolutionError(
      'Resolver resolutionOrder must be an own array',
      '#/resolutionOrder'
    )
  }
  return ownArrayElements(resolutionOrder, '#/resolutionOrder', budget)
}

function optionalResolverContainer(
  resolver: Record<string, unknown>,
  key: 'sets' | 'modifiers'
): Record<string, unknown> | undefined {
  if (!hasOwn(resolver, key)) {
    return undefined
  }
  const container = resolver[key]
  if (!isRecord(container)) {
    throw new ReferenceResolutionError(
      `Resolver ${key} must be an object`,
      `#/${key}`
    )
  }
  return container
}

function setSources(
  value: unknown,
  name: string,
  budget?: ResolverWorkBudget
): Array<DTCGRef | DTCGDocument> {
  const path = `#/sets/${name}`
  if (!isRecord(value)) {
    throw new ReferenceResolutionError(
      `Resolver set "${name}" must be an object`,
      path
    )
  }
  if (!hasOwn(value, 'sources')) {
    throw new ReferenceResolutionError(
      `Resolver set "${name}" sources must be an own array`,
      `${path}/sources`
    )
  }
  const sources = value.sources
  if (!Array.isArray(sources)) {
    throw new ReferenceResolutionError(
      `Resolver set "${name}" sources must be an own array`,
      `${path}/sources`
    )
  }
  return ownArrayElements(
    sources as Array<DTCGRef | DTCGDocument>,
    `${path}/sources`,
    budget
  )
}

interface ValidatedModifier {
  contexts: Record<string, Array<DTCGRef | DTCGDocument>>
  defaultContext: string | undefined
}

function validateModifier(
  value: unknown,
  name: string,
  budget?: ResolverWorkBudget
): ValidatedModifier {
  if (budget !== undefined) {
    chargeResolverWork(budget, name.length + 1)
  }
  const path = `#/modifiers/${name}`
  if (!isRecord(value)) {
    throw new ReferenceResolutionError(
      `Resolver modifier "${name}" must be an object`,
      path
    )
  }

  if (!hasOwn(value, 'contexts')) {
    throw new ReferenceResolutionError(
      `Resolver modifier "${name}" contexts must be an own object`,
      `${path}/contexts`
    )
  }
  const rawContexts = value.contexts
  if (!isRecord(rawContexts)) {
    throw new ReferenceResolutionError(
      `Resolver modifier "${name}" contexts must be an own object`,
      `${path}/contexts`
    )
  }

  const contexts = createDictionary<Array<DTCGRef | DTCGDocument>>()
  const contextEntries = Object.entries(rawContexts)
  if (budget !== undefined) {
    chargeResolverWork(budget, contextEntries.length)
  }
  if (contextEntries.length === 0) {
    throw new ReferenceResolutionError(
      `Resolver modifier "${name}" must define at least one context`,
      `${path}/contexts`
    )
  }
  for (const [context, sources] of contextEntries) {
    if (budget !== undefined) {
      chargeResolverWork(budget, context.length + 1)
    }
    if (!Array.isArray(sources)) {
      throw new ReferenceResolutionError(
        `Resolver context "${context}" for modifier "${name}" must have a sources array`,
        `${path}/contexts/${context}`
      )
    }
    contexts[context] = ownArrayElements(
      sources as Array<DTCGRef | DTCGDocument>,
      `${path}/contexts/${context}`,
      budget
    )
  }

  let defaultContext: string | undefined
  if (hasOwn(value, 'default')) {
    const rawDefault = value.default
    if (typeof rawDefault !== 'string') {
      throw new ReferenceResolutionError(
        `Resolver modifier "${name}" default must be a string`,
        `${path}/default`
      )
    }
    if (budget !== undefined) {
      chargeResolverWork(budget, rawDefault.length + 1)
    }
    if (!hasOwn(contexts, rawDefault)) {
      throw new ReferenceResolutionError(
        `Resolver modifier "${name}" default must name one of its own contexts`,
        `${path}/default`
      )
    }
    defaultContext = rawDefault
  }

  return { contexts, defaultContext }
}

/**
 * Resolve `{dot.path}` references in a flattened token map.
 *
 * @remarks
 * One call can spend up to 1,000,000 work units. Work includes token paths,
 * references, reference walks, cycle messages, and resolved entries.
 *
 * @returns Map of token path to resolved value.
 * @throws {@link ReferenceResolutionError} - A target is missing or a
 * reference cycle exists.
 * @throws `TypeError` - The call exceeds 1,000,000 work units.
 *
 * @public
 */
export function resolveTokenValues(
  flat: FlatToken[]
): Map<string, DTCGTokenValue> {
  return resolveTokenValuesWithBudget(flat, tokenReferenceBudget())
}

interface TokenValueResolver {
  readonly values: Map<string, DTCGTokenValue>
  resolve(path: string): DTCGTokenValue
}

function createTokenValueResolver(
  flat: FlatToken[],
  budget: ResolverWorkBudget
): TokenValueResolver {
  const byPath = new Map<string, DTCGToken>()
  chargeResolverWork(budget, flat.length)
  for (const { path, token } of flat) {
    chargeResolverWork(budget, path.length + 1)
    byPath.set(path, token)
  }

  const values = new Map<string, DTCGTokenValue>()

  function resolve(startPath: string): DTCGTokenValue {
    const chain: string[] = []
    const active = new Set<string>()
    let path = startPath
    let value: DTCGTokenValue

    while (true) {
      chargeResolverWork(budget)
      if (values.has(path)) {
        value = values.get(path) as DTCGTokenValue
        break
      }
      if (active.has(path)) {
        const cycle = [...chain, path]
        chargeResolverWork(
          budget,
          cycle.reduce((length, entry) => length + entry.length + 4, 0)
        )
        throw new ReferenceResolutionError(
          `Reference cycle: ${cycle.join(' -> ')}`,
          path
        )
      }

      const token = byPath.get(path)
      if (token === undefined) {
        throw new ReferenceResolutionError(
          `Reference target "${path}" does not exist`,
          path
        )
      }

      active.add(path)
      chain.push(path)
      value = token.$value
      if (!isReferenceValue(value)) {
        break
      }
      chargeResolverWork(budget, value.length + 1)
      path = value.slice(1, -1)
    }

    chargeResolverWork(budget, chain.length)
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      values.set(chain[index] as string, value)
    }
    return value
  }

  return { values, resolve }
}

/** @internal */
export function resolveTokenValuesWithBudget(
  flat: FlatToken[],
  budget: ResolverWorkBudget = tokenReferenceBudget()
): Map<string, DTCGTokenValue> {
  const resolver = createTokenValueResolver(flat, budget)

  for (const { path } of flat) {
    resolver.resolve(path)
  }
  return resolver.values
}

/**
 * Resolve references while collecting failures in an `errors` array.
 *
 * @remarks
 * One call can spend up to 1,000,000 work units. Work includes token paths,
 * references, reference walks, cycle messages, and resolved entries.
 *
 * @returns Resolved values and one error for each input token that fails.
 * @throws `TypeError` - The call exceeds 1,000,000 work units.
 *
 * @public
 */
export function resolveTokenValuesSafe(flat: FlatToken[]): {
  values: Map<string, DTCGTokenValue>
  errors: ReferenceResolutionError[]
} {
  const resolver = createTokenValueResolver(flat, tokenReferenceBudget())
  const errors: ReferenceResolutionError[] = []

  for (const { path } of flat) {
    try {
      resolver.resolve(path)
    } catch (err) {
      if (err instanceof ReferenceResolutionError) {
        errors.push(err)
      } else {
        throw err
      }
    }
  }
  return { values: resolver.values, errors }
}

/**
 * List Resolver modifier axes and contexts.
 *
 * One call can spend up to 1,000,000 work units reading modifier and context
 * names, defaults, and context arrays.
 *
 * @throws `TypeError` - The call exceeds 1,000,000 work units.
 *
 * @public
 */
export function listContexts(
  resolver: ResolverDocument
): Record<string, string[]> {
  return listContextsWithBudget(resolver, {
    remaining: 1_000_000,
    errorMessage: 'Resolver contexts exceed the 1,000,000-unit work limit.',
  })
}

/** @internal */
export function listContextsWithBudget(
  resolver: ResolverDocument,
  budget?: ResolverWorkBudget
): Record<string, string[]> {
  const result = createDictionary<string[]>()
  const modifiers = optionalResolverContainer(
    resolverRecord(resolver),
    'modifiers'
  )
  if (!modifiers) {
    return result
  }
  const modifierEntries = Object.entries(modifiers)
  if (budget !== undefined) {
    chargeResolverWork(budget, modifierEntries.length)
  }
  for (const [name, modifier] of modifierEntries) {
    result[name] = Object.keys(
      validateModifier(modifier, name, budget).contexts
    )
  }
  return result
}

function readOwnRef(
  source: unknown,
  path: string,
  message: string
): string | undefined {
  if (!isRecord(source) || !hasOwn(source, '$ref')) {
    return undefined
  }
  const ref = Reflect.get(source, '$ref')
  if (typeof ref !== 'string') {
    throw new ReferenceResolutionError(message, path)
  }
  return ref
}

function decodeUriText(
  value: string,
  path: string,
  decode: (text: string) => string
): string {
  try {
    return decode(value)
  } catch {
    throw new ReferenceResolutionError(
      `Resolver reference at "${path}" contains invalid URI encoding`,
      path
    )
  }
}

function decodeJsonPointerSegment(segment: string, path: string): string {
  const decoded: string[] = []
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index] as string
    if (character !== '~') {
      decoded.push(character)
      continue
    }
    const escapeCode = segment[index + 1]
    if (escapeCode === '0') {
      decoded.push('~')
    } else if (escapeCode === '1') {
      decoded.push('/')
    } else {
      throw new ReferenceResolutionError(
        `Resolver reference at "${path}" contains an invalid JSON Pointer escape`,
        path
      )
    }
    index += 1
  }
  return decoded.join('')
}

function readResolutionOrderTarget(
  entry: unknown,
  index: number,
  budget?: ResolverWorkBudget
): { kind: 'sets' | 'modifiers'; name: string; ref: string; path: string } {
  const path = `#/resolutionOrder/${index}`
  const ref = readOwnRef(
    entry,
    path,
    `Resolver resolutionOrder entry at "${path}" must be a set or modifier reference`
  )
  if (ref === undefined) {
    throw new ReferenceResolutionError(
      `Resolver resolutionOrder entry at "${path}" must be a set or modifier reference`,
      path
    )
  }

  if (budget !== undefined) {
    chargeResolverWork(budget, ref.length)
  }

  const pointer = ref.startsWith('#/')
    ? decodeUriText(ref.slice(2), path, decodeURIComponent)
    : undefined
  const segments = pointer?.split('/') ?? []
  if (
    segments.length !== 2 ||
    (segments[0] !== 'sets' && segments[0] !== 'modifiers')
  ) {
    throw new ReferenceResolutionError(
      `Resolver resolutionOrder entry at "${path}" must be a set or modifier reference`,
      path
    )
  }

  return {
    kind: segments[0],
    name: decodeJsonPointerSegment(segments[1] as string, path),
    ref,
    path,
  }
}

function refToFileName(ref: string, path: string): string {
  return ref
    .replace(/^\.\//, '')
    .split('/')
    .map(segment => {
      const decoded = decodeUriText(segment, path, decodeURIComponent)
      if (decoded.includes('/') || decoded.includes('\\')) {
        throw new ReferenceResolutionError(
          `Resolver reference at "${path}" contains an encoded path separator`,
          path
        )
      }
      return decoded
    })
    .join('/')
}

/**
 * Apply a DTCG Resolver to token files for a context selection.
 *
 * @param files - File-name map of token documents from `toDTCG`.
 * @param resolver - The resolver document.
 * @param input - Context selection per modifier (e.g. `{ semantic: 'dark' }`).
 *   Missing modifiers use their declared `default`, falling back to the first
 *   declared context.
 *
 * @example
 * ```ts
 * const { files, resolver } = toDTCG(variablesJson)
 * const darkTokens = applyResolver(files, resolver, { semantic: 'dark' })
 * ```
 *
 * One call reads at most 64 token-group levels and spends at most 1,000,000
 * work units on Resolver entries, source text, token documents, and merges.
 *
 * @throws `TypeError` - The call exceeds its depth or work limit.
 *
 * @public
 */
export function applyResolver(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  input: Record<string, string> = {}
): DTCGDocument {
  return applyResolverWithBudget(
    files,
    resolver,
    input,
    publicResolverBudget(
      'Resolver application exceeds the 1,000,000-unit work limit.',
      'Resolver application can read at most 64 token-group levels.'
    )
  )
}

/** @internal */
export function applyResolverWithBudget(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  input: Record<string, string>,
  budget?: ResolverWorkBudget
): DTCGDocument {
  const ordered: DTCGDocument[] = []
  const root = resolverRecord(resolver)
  const resolutionOrder = resolutionOrderOf(root, budget)
  const sets = optionalResolverContainer(root, 'sets')
  const modifiers = optionalResolverContainer(root, 'modifiers')

  function sourcesToDocuments(
    sources: Array<DTCGRef | DTCGDocument>,
    sourcePath: string
  ): DTCGDocument[] {
    const documents: DTCGDocument[] = []
    if (budget !== undefined) {
      chargeResolverWork(budget, sources.length)
    }
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index]
      const path = `${sourcePath}/${index}`
      const ref = readOwnRef(
        source,
        path,
        `Resolver source at "${path}" must contain a string $ref`
      )
      if (ref !== undefined) {
        if (budget !== undefined) {
          chargeResolverWork(budget, ref.length)
        }
        const fileName = refToFileName(ref, path)
        if (!hasOwn(files, fileName)) {
          throw new ReferenceResolutionError(
            `Resolver references missing file "${ref}"`,
            ref
          )
        }
        const file = files[fileName]
        if (!isRecord(file)) {
          throw new ReferenceResolutionError(
            `Resolver file "${ref}" must contain a token document object`,
            ref
          )
        }
        validateTokenDocument(file, ref, budget)
        documents.push(file as DTCGDocument)
        continue
      }
      if (!isRecord(source)) {
        throw new ReferenceResolutionError(
          `Resolver source at "${path}" must be a reference or token document object`,
          path
        )
      }
      validateTokenDocument(source, `${sourcePath}/${index}`, budget)
      documents.push(source as DTCGDocument)
    }
    return documents
  }

  for (let index = 0; index < resolutionOrder.length; index += 1) {
    const target = readResolutionOrderTarget(
      resolutionOrder[index],
      index,
      budget
    )
    if (target.kind === 'sets') {
      if (!sets || !hasOwn(sets, target.name)) {
        throw new ReferenceResolutionError(
          `Resolver references missing set "${target.name}"`,
          target.path
        )
      }
      const documents = sourcesToDocuments(
        setSources(sets[target.name], target.name, budget),
        `#/sets/${target.name}/sources`
      )
      for (const document of documents) {
        ordered.push(document)
      }
      continue
    }

    if (!modifiers || !hasOwn(modifiers, target.name)) {
      throw new ReferenceResolutionError(
        `Resolver references missing modifier "${target.name}"`,
        target.path
      )
    }
    const modifier = validateModifier(
      modifiers[target.name],
      target.name,
      budget
    )
    const contextNames = Object.keys(modifier.contexts)
    const selected = hasOwn(input, target.name) ? input[target.name] : undefined
    if (budget !== undefined && selected !== undefined) {
      chargeResolverWork(budget, selected.length + 1)
    }
    const chosen =
      selected ??
      modifier.defaultContext ??
      (contextNames[0] as string | undefined)
    if (typeof chosen !== 'string' || !hasOwn(modifier.contexts, chosen)) {
      throw new ReferenceResolutionError(
        `Unknown context "${chosen}" for modifier "${target.name}" ` +
          `(available: ${contextNames.join(', ')})`,
        target.ref
      )
    }
    const documents = sourcesToDocuments(
      modifier.contexts[chosen] as Array<DTCGRef | DTCGDocument>,
      `${target.ref}/contexts/${chosen}`
    )
    for (const document of documents) {
      ordered.push(document)
    }
  }

  return mergeDocumentsWithBudget(ordered, budget)
}

/**
 * List Resolver context permutations.
 *
 * A Resolver can produce at most 1,000 permutations. One call also has a
 * 1,000,000-unit work limit for reading contexts and copying selections.
 *
 * @returns Array of context selections (e.g. `[{ semantic: 'light', density: 'compact' }, ...]`).
 * @throws `TypeError` - The Resolver produces more than 1,000 permutations or
 * exceeds the work limit.
 *
 * @public
 */
export function listPermutations(
  resolver: ResolverDocument
): Array<Record<string, string>> {
  const workLimitMessage =
    'Resolver context permutations exceed the 1,000,000-unit work limit.'
  const budget: ResolverWorkBudget = {
    remaining: 1_000_000,
    errorMessage: workLimitMessage,
  }
  return listPermutationsWithBudget(resolver, budget)
}

/** @internal */
export function listPermutationsWithBudget(
  resolver: ResolverDocument,
  budget: ResolverWorkBudget
): Array<Record<string, string>> {
  const axes = Object.entries(listContextsWithBudget(resolver, budget))
  return permutationsForAxes(axes, budget)
}

/** @internal */
export function readResolutionContextStatesWithBudget(
  resolver: ResolverDocument,
  budget: ResolverWorkBudget
): {
  readonly defaultSelection: Record<string, string>
  readonly permutations: Array<Record<string, string>>
} {
  const root = resolverRecord(resolver)
  const resolutionOrder = resolutionOrderOf(root, budget)
  const modifiers = optionalResolverContainer(root, 'modifiers')
  const active = new Set<string>()

  for (let index = 0; index < resolutionOrder.length; index += 1) {
    const target = readResolutionOrderTarget(
      resolutionOrder[index],
      index,
      budget
    )
    if (target.kind !== 'modifiers') {
      continue
    }
    if (!modifiers || !hasOwn(modifiers, target.name)) {
      throw new ReferenceResolutionError(
        `Resolver references missing modifier "${target.name}"`,
        target.path
      )
    }
    active.add(target.name)
  }

  const axes: Array<[string, string[]]> = []
  const defaultSelection = createDictionary<string>()
  for (const name of active) {
    const modifier = validateModifier(
      (modifiers as Record<string, unknown>)[name],
      name,
      budget
    )
    const contexts = Object.keys(modifier.contexts)
    axes.push([name, contexts])
    const chosen = modifier.defaultContext ?? contexts[0]
    if (chosen !== undefined) {
      defaultSelection[name] = chosen
    }
  }
  return {
    defaultSelection,
    permutations: permutationsForAxes(axes, budget),
  }
}

function permutationsForAxes(
  axes: ReadonlyArray<readonly [string, string[]]>,
  budget: ResolverWorkBudget
): Array<Record<string, string>> {
  if (axes.length === 0) {
    return [{}]
  }
  if (axes.some(([, contexts]) => contexts.length === 0)) {
    return []
  }
  const maxPermutations = 1_000
  let permutationCount = 1
  for (const [, contexts] of axes) {
    if (contexts.length > Math.floor(maxPermutations / permutationCount)) {
      throw new TypeError(
        'Resolver can contain at most 1,000 context permutations.'
      )
    }
    permutationCount *= contexts.length
  }
  let permutations: Array<Record<string, string>> = [{}]
  for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
    const entry = axes[axisIndex]
    if (entry === undefined) {
      continue
    }
    const [axis, contexts] = entry
    chargeResolverWork(
      budget,
      (axisIndex + 1) * permutations.length * contexts.length
    )
    const next: Array<Record<string, string>> = []
    for (const permutation of permutations) {
      for (const context of contexts) {
        next.push({ ...permutation, [axis]: context })
      }
    }
    permutations = next
  }
  return permutations
}
