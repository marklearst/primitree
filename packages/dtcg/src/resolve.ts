import type {
  DTCGDocument,
  DTCGGroup,
  DTCGRef,
  DTCGToken,
  DTCGTokenValue,
  ResolverDocument,
} from './types'
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
  const result: DTCGGroup = {}

  function mergeInto(target: DTCGGroup, source: DTCGGroup): void {
    for (const [key, value] of Object.entries(source)) {
      if (isToken(value)) {
        target[key] = value
        continue
      }
      const existing = target[key]
      if (existing !== undefined && !isToken(existing)) {
        mergeInto(existing, value)
      } else {
        const next: DTCGGroup = {}
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
      if (key.startsWith('$')) {
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
  const result: Record<string, string[]> = {}
  for (const [name, modifier] of Object.entries(resolver.modifiers ?? {})) {
    result[name] = Object.keys(modifier.contexts)
  }
  return result
}

function isRef(source: DTCGRef | DTCGDocument): source is DTCGRef {
  return typeof (source as DTCGRef).$ref === 'string'
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

  function sourcesToDocuments(
    sources: Array<DTCGRef | DTCGDocument>
  ): DTCGDocument[] {
    return sources.map(source => {
      if (isRef(source)) {
        const file = files[refToFileName(source.$ref)]
        if (!file) {
          throw new ReferenceResolutionError(
            `Resolver references missing file "${source.$ref}"`,
            source.$ref
          )
        }
        return file
      }
      return source
    })
  }

  for (const entry of resolver.resolutionOrder) {
    const ref = entry.$ref
    const setMatch = ref.match(/^#\/sets\/(.+)$/)
    if (setMatch) {
      const set = resolver.sets?.[setMatch[1] as string]
      if (set) {
        ordered.push(...sourcesToDocuments(set.sources))
      }
      continue
    }
    const modifierMatch = ref.match(/^#\/modifiers\/(.+)$/)
    if (modifierMatch) {
      const name = modifierMatch[1] as string
      const modifier = resolver.modifiers?.[name]
      if (!modifier) {
        continue
      }
      const contextNames = Object.keys(modifier.contexts)
      const chosen =
        input[name] ?? modifier.default ?? (contextNames[0] as string)
      const sources = modifier.contexts[chosen]
      if (!sources) {
        throw new ReferenceResolutionError(
          `Unknown context "${chosen}" for modifier "${name}" ` +
            `(available: ${contextNames.join(', ')})`,
          ref
        )
      }
      ordered.push(...sourcesToDocuments(sources))
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
