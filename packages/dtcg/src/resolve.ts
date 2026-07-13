import type {
  DTCGDocument,
  DTCGGroup,
  DTCGRef,
  DTCGToken,
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
 * Deep-merge DTCG documents; later documents override earlier ones at the
 * token level (a token in a later document fully replaces the same path).
 *
 * @public
 */
export function mergeDocuments(documents: DTCGDocument[]): DTCGDocument {
  const result: DTCGGroup = createDictionary()

  function mergeInto(target: DTCGGroup, source: DTCGGroup): void {
    for (const [key, value] of Object.entries(source)) {
      if (isToken(value)) {
        target[key] = value
        continue
      }
      const existing = hasOwn(target, key) ? target[key] : undefined
      if (existing !== undefined && !isToken(existing)) {
        mergeInto(existing, value)
      } else {
        const next: DTCGGroup = createDictionary()
        mergeInto(next, value)
        target[key] = next
      }
    }
  }

  for (const doc of documents) {
    mergeInto(result, doc)
  }
  return result
}

/**
 * Flatten a DTCG document into a list of `{ path, token }` entries.
 *
 * @public
 */
export function flattenTokens(document: DTCGDocument): FlatToken[] {
  const flat: FlatToken[] = []

  function walk(group: DTCGGroup, prefix: string[]): void {
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith('$') && key !== '$root') {
        continue
      }
      if (isToken(value)) {
        flat.push({ path: [...prefix, key].join('.'), token: value })
      } else {
        walk(value, [...prefix, key])
      }
    }
  }

  walk(document, [])
  return flat
}

/**
 * Error thrown when a DTCG reference cannot be resolved.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function resolutionOrderOf(resolver: Record<string, unknown>): unknown[] {
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
  return resolutionOrder
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
  name: string
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
  return sources as Array<DTCGRef | DTCGDocument>
}

interface ValidatedModifier {
  contexts: Record<string, Array<DTCGRef | DTCGDocument>>
  defaultContext: string | undefined
}

function validateModifier(value: unknown, name: string): ValidatedModifier {
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
  for (const [context, sources] of Object.entries(rawContexts)) {
    if (!Array.isArray(sources)) {
      throw new ReferenceResolutionError(
        `Resolver context "${context}" for modifier "${name}" must have a sources array`,
        `${path}/contexts/${context}`
      )
    }
    contexts[context] = sources as Array<DTCGRef | DTCGDocument>
  }

  let defaultContext: string | undefined
  if (hasOwn(value, 'default')) {
    const rawDefault = value.default
    if (rawDefault !== undefined && typeof rawDefault !== 'string') {
      throw new ReferenceResolutionError(
        `Resolver modifier "${name}" default must be a string`,
        `${path}/default`
      )
    }
    defaultContext = rawDefault
  }

  return { contexts, defaultContext }
}

/**
 * Resolve `{dot.path}` references in a flattened token map to concrete
 * values. Cycle-safe.
 *
 * @returns Map of token path to fully resolved value.
 *
 * @public
 */
export function resolveTokenValues(
  flat: FlatToken[]
): Map<string, DTCGTokenValue> {
  const byPath = new Map<string, DTCGToken>()
  for (const { path, token } of flat) {
    byPath.set(path, token)
  }

  const resolved = new Map<string, DTCGTokenValue>()

  function resolvePath(path: string, seen: string[]): DTCGTokenValue {
    const cached = resolved.get(path)
    if (cached !== undefined) {
      return cached
    }
    if (seen.includes(path)) {
      throw new ReferenceResolutionError(
        `Reference cycle: ${[...seen, path].join(' -> ')}`,
        path
      )
    }
    const token = byPath.get(path)
    if (!token) {
      throw new ReferenceResolutionError(
        `Reference target "${path}" does not exist`,
        path
      )
    }
    let value = token.$value
    if (isReferenceValue(value)) {
      value = resolvePath(value.slice(1, -1), [...seen, path])
    }
    resolved.set(path, value)
    return value
  }

  for (const { path } of flat) {
    resolvePath(path, [])
  }
  return resolved
}

/**
 * Tolerant variant of {@link resolveTokenValues}: unresolvable references are
 * collected as errors instead of aborting the whole resolution.
 *
 * @public
 */
export function resolveTokenValuesSafe(flat: FlatToken[]): {
  values: Map<string, DTCGTokenValue>
  errors: ReferenceResolutionError[]
} {
  const values = new Map<string, DTCGTokenValue>()
  const errors: ReferenceResolutionError[] = []
  const byPath = new Map<string, DTCGToken>()
  for (const { path, token } of flat) {
    byPath.set(path, token)
  }

  function resolvePath(path: string, seen: string[]): DTCGTokenValue {
    const cached = values.get(path)
    if (cached !== undefined) {
      return cached
    }
    if (seen.includes(path)) {
      throw new ReferenceResolutionError(
        `Reference cycle: ${[...seen, path].join(' -> ')}`,
        path
      )
    }
    const token = byPath.get(path)
    if (!token) {
      throw new ReferenceResolutionError(
        `Reference target "${path}" does not exist`,
        path
      )
    }
    let value = token.$value
    if (isReferenceValue(value)) {
      value = resolvePath(value.slice(1, -1), [...seen, path])
    }
    values.set(path, value)
    return value
  }

  for (const { path } of flat) {
    try {
      resolvePath(path, [])
    } catch (err) {
      if (err instanceof ReferenceResolutionError) {
        errors.push(err)
      } else {
        throw err
      }
    }
  }
  return { values, errors }
}

/**
 * List the modifier axes and their contexts declared by a resolver.
 *
 * @public
 */
export function listContexts(
  resolver: ResolverDocument
): Record<string, string[]> {
  const result = createDictionary<string[]>()
  const modifiers = optionalResolverContainer(
    resolverRecord(resolver),
    'modifiers'
  )
  if (!modifiers) {
    return result
  }
  for (const [name, modifier] of Object.entries(modifiers)) {
    result[name] = Object.keys(validateModifier(modifier, name).contexts)
  }
  return result
}

function isRef(source: unknown): source is DTCGRef {
  return (
    typeof source === 'object' &&
    source !== null &&
    !Array.isArray(source) &&
    hasOwn(source, '$ref') &&
    typeof (source as DTCGRef).$ref === 'string'
  )
}

function refToFileName(ref: string): string {
  return ref.replace(/^\.\//, '')
}

/**
 * Apply a DTCG resolver to a set of in-memory token files, producing the
 * merged document for a given context selection.
 *
 * @param files - Token documents keyed by file name (as produced by `toDTCG`).
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
 * @public
 */
export function applyResolver(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  input: Record<string, string> = {}
): DTCGDocument {
  const ordered: DTCGDocument[] = []
  const root = resolverRecord(resolver)
  const resolutionOrder = resolutionOrderOf(root)
  const sets = optionalResolverContainer(root, 'sets')
  const modifiers = optionalResolverContainer(root, 'modifiers')

  function sourcesToDocuments(
    sources: Array<DTCGRef | DTCGDocument>,
    sourcePath: string
  ): DTCGDocument[] {
    return sources.map((source, index) => {
      if (isRef(source)) {
        const fileName = refToFileName(source.$ref)
        if (!hasOwn(files, fileName)) {
          throw new ReferenceResolutionError(
            `Resolver references missing file "${source.$ref}"`,
            source.$ref
          )
        }
        const file = files[fileName]
        if (!isRecord(file)) {
          throw new ReferenceResolutionError(
            `Resolver file "${source.$ref}" must contain a token document object`,
            source.$ref
          )
        }
        return file as DTCGDocument
      }
      if (!isRecord(source)) {
        const path = `${sourcePath}/${index}`
        throw new ReferenceResolutionError(
          `Resolver source at "${path}" must be a reference or token document object`,
          path
        )
      }
      return source as DTCGDocument
    })
  }

  for (const entry of resolutionOrder) {
    if (!isRef(entry)) {
      continue
    }
    const ref = entry.$ref
    const setMatch = ref.match(/^#\/sets\/(.+)$/)
    if (setMatch) {
      const name = setMatch[1] as string
      if (sets && hasOwn(sets, name)) {
        ordered.push(...sourcesToDocuments(setSources(sets[name], name), ref))
      }
      continue
    }
    const modifierMatch = ref.match(/^#\/modifiers\/(.+)$/)
    if (modifierMatch) {
      const name = modifierMatch[1] as string
      if (!modifiers || !hasOwn(modifiers, name)) {
        continue
      }
      const modifier = validateModifier(modifiers[name], name)
      const contextNames = Object.keys(modifier.contexts)
      const selected = hasOwn(input, name) ? input[name] : undefined
      const chosen =
        selected ??
        modifier.defaultContext ??
        (contextNames[0] as string | undefined)
      if (typeof chosen !== 'string' || !hasOwn(modifier.contexts, chosen)) {
        throw new ReferenceResolutionError(
          `Unknown context "${chosen}" for modifier "${name}" ` +
            `(available: ${contextNames.join(', ')})`,
          ref
        )
      }
      ordered.push(
        ...sourcesToDocuments(
          modifier.contexts[chosen] as Array<DTCGRef | DTCGDocument>,
          `${ref}/contexts/${chosen}`
        )
      )
    }
  }

  return mergeDocuments(ordered)
}

/**
 * Enumerate every context permutation a resolver can produce.
 *
 * @returns Array of context selections (e.g. `[{ semantic: 'light', density: 'compact' }, ...]`).
 *
 * @public
 */
export function listPermutations(
  resolver: ResolverDocument
): Array<Record<string, string>> {
  const axes = Object.entries(listContexts(resolver))
  if (axes.length === 0) {
    return [{}]
  }
  let permutations: Array<Record<string, string>> = [{}]
  for (const [axis, contexts] of axes) {
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
