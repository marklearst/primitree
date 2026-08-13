import {
  applyResolver,
  createDTCGGraphFragment,
  cssVarName,
  flattenTypedTokens,
  isReferenceValue,
  isToken,
  listContexts,
  type ReferenceResolutionError,
  resolveTokenValuesSafe,
  typedCssValue,
  PRIMITREE_EXTENSION_KEY,
  type DTCGToken,
  type DTCGTokenType,
  type DTCGTokenValue,
} from '@primitree/dtcg'
import {
  diffVariables,
  formatDiffMarkdown,
  type GraphDiagnostic,
} from '@primitree/core'
import type { TokenSource } from './source'

class TokenSourceCheckError extends Error {
  public readonly diagnostics: readonly GraphDiagnostic[]

  public constructor(diagnostics: readonly GraphDiagnostic[]) {
    super(
      [
        'Token source check failed.',
        ...diagnostics.map(diagnostic => {
          const location =
            diagnostic.path === undefined
              ? ''
              : ` at "${diagnostic.path.join('.')}"`
          return `[${diagnostic.code}]${location}: ${diagnostic.message}`
        }),
      ].join('\n')
    )
    this.name = 'TokenSourceCheckError'
    this.diagnostics = diagnostics
  }
}

class TokenSourceResolutionError extends Error {
  public readonly errors: readonly ReferenceResolutionError[]

  public constructor(
    errors: readonly ReferenceResolutionError[],
    tokenPaths: readonly string[]
  ) {
    super(
      [
        'Token source resolution failed.',
        ...errors.map(
          (error, index) =>
            `At token "${tokenPaths[index] ?? error.path}": ${error.message}`
        ),
      ].join('\n')
    )
    this.name = 'TokenSourceResolutionError'
    this.errors = errors
  }
}

function graphValidationType(value: unknown): DTCGTokenType {
  switch (typeof value) {
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'string':
      return 'string'
  }

  try {
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? 'fontFamily' : 'cubicBezier'
    }
    if (value !== null && typeof value === 'object') {
      if (Object.hasOwn(value, 'colorSpace')) {
        return 'color'
      }
      if (Object.hasOwn(value, 'unit')) {
        const unit = Reflect.get(value, 'unit')
        if (unit === 'ms' || unit === 's') {
          return 'duration'
        }
      }
      return 'dimension'
    }
  } catch {
    // The graph adapter reports unreadable or unsupported values consistently.
    return 'string'
  }

  return 'string'
}

function graphValidationToken(
  token: object,
  validationType: DTCGTokenType
): Record<string, unknown> {
  const target = Object.create(Object.getPrototypeOf(token)) as Record<
    string,
    unknown
  >

  return new Proxy(target, {
    get(_target, property) {
      if (property === '$type') {
        return validationType
      }
      return Reflect.get(token, property, token)
    },
    getOwnPropertyDescriptor(target, property) {
      if (property === '$type') {
        return {
          configurable: true,
          enumerable: true,
          value: validationType,
          writable: false,
        }
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(token, property)
      if (
        descriptor !== undefined &&
        !descriptor.configurable &&
        !Object.hasOwn(target, property)
      ) {
        Reflect.defineProperty(target, property, descriptor)
      }
      return descriptor
    },
    ownKeys() {
      const keys = Reflect.ownKeys(token)
      keys.push('$type')
      return keys
    },
  })
}

function graphValidationDocument(
  document: Record<string, unknown>,
  untypedLiteralTypes: ReadonlyMap<string, DTCGTokenType>,
  path = '',
  groups = new WeakMap<object, Record<string, unknown>>(),
  tokens = new Map<string, Record<string, unknown>>()
): Record<string, unknown> {
  const existing = groups.get(document)
  if (existing !== undefined) {
    return existing
  }

  const view = new Proxy(document, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (isToken(value)) {
        const tokenPath =
          path.length === 0 ? String(property) : `${path}.${String(property)}`
        const validationType = untypedLiteralTypes.get(tokenPath)
        if (validationType === undefined) {
          return value
        }
        const existingToken = tokens.get(tokenPath)
        if (existingToken !== undefined) {
          return existingToken
        }
        // Core graph tokens require a type. Preserve the original prototype
        // and descriptors while exposing a lazy, validation-only type.
        const validationToken = graphValidationToken(value, validationType)
        tokens.set(tokenPath, validationToken)
        return validationToken
      }
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const groupPath =
          path.length === 0 ? String(property) : `${path}.${String(property)}`
        return graphValidationDocument(
          value as Record<string, unknown>,
          untypedLiteralTypes,
          groupPath,
          groups,
          tokens
        )
      }
      return value
    },
  })
  groups.set(document, view)
  return view
}

function resolvedFlat(source: TokenSource, contexts?: Record<string, string>) {
  const document = applyResolver(source.files, source.resolver, contexts ?? {})
  const flat = flattenTypedTokens(document)
  const untypedLiteralTypes = new Map<string, DTCGTokenType>()
  for (const entry of flat) {
    if (
      entry.type === undefined &&
      !Object.hasOwn(entry.token, '$type') &&
      !isReferenceValue(entry.token.$value)
    ) {
      untypedLiteralTypes.set(
        entry.path,
        graphValidationType(entry.token.$value)
      )
    }
  }
  const fragment = createDTCGGraphFragment(
    untypedLiteralTypes.size === 0
      ? document
      : graphValidationDocument(document, untypedLiteralTypes),
    { source: 'mcp' }
  )
  if (!fragment.ok) {
    throw new TokenSourceCheckError(fragment.diagnostics)
  }
  const { values, errors } = resolveTokenValuesSafe(flat)
  if (errors.length > 0) {
    const failedTokenPaths = flat
      .filter(({ path }) => !values.has(path))
      .map(({ path }) => path)
    throw new TokenSourceResolutionError(errors, failedTokenPaths)
  }
  const types = new Map(flat.map(token => [token.path, token.type]))
  return { flat, values, types }
}

function isDTCGTokenType(value: string | undefined): value is DTCGTokenType {
  switch (value) {
    case 'boolean':
    case 'color':
    case 'cubicBezier':
    case 'dimension':
    case 'duration':
    case 'fontFamily':
    case 'fontWeight':
    case 'number':
    case 'string':
      return true
    default:
      return false
  }
}

function describeValue(
  value: DTCGTokenValue | undefined,
  type: string | undefined
): {
  value: DTCGTokenValue | undefined
  css: string | null
} {
  return {
    value,
    css:
      value === undefined
        ? null
        : typedCssValue(value, isDTCGTokenType(type) ? type : undefined),
  }
}

/**
 * Return top-level token groups, their token counts, and the
 * context axes the resolver declares.
 *
 * @public
 */
export function listCollections(source: TokenSource): {
  collections: Array<{ name: string; tokens: number }>
  contexts: Record<string, string[]>
  origin: string
} {
  const { flat } = resolvedFlat(source)
  const counts = new Map<string, number>()
  for (const { path } of flat) {
    const head = path.split('.')[0] as string
    counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  return {
    collections: [...counts.entries()].map(([name, tokens]) => ({
      name,
      tokens,
    })),
    contexts: listContexts(source.resolver),
    origin: source.origin,
  }
}

/**
 * Return a token by dot path under a context selection.
 *
 * @public
 */
export function getToken(
  source: TokenSource,
  path: string,
  contexts?: Record<string, string>
): {
  path: string
  found: boolean
  token?: DTCGToken
  value?: DTCGTokenValue | undefined
  css?: string | null
  cssVar?: string
  figma?: unknown
} {
  const { flat, types, values } = resolvedFlat(source, contexts)
  const entry = flat.find(f => f.path === path)
  if (!entry) {
    return { path, found: false }
  }
  const described = describeValue(values.get(path), types.get(path))
  return {
    path,
    found: true,
    token: entry.token,
    value: described.value,
    css: described.css,
    cssVar: `var(${cssVarName(path)})`,
    figma: entry.token.$extensions?.[PRIMITREE_EXTENSION_KEY],
  }
}

/**
 * Resolve tokens under a context selection.
 *
 * @public
 */
export function resolveContext(
  source: TokenSource,
  contexts: Record<string, string>,
  limit = 500
): {
  contexts: Record<string, string>
  total: number
  truncated: boolean
  tokens: Array<{ path: string; type?: string; css: string | null }>
} {
  const { flat, types, values } = resolvedFlat(source, contexts)
  const tokens = flat.slice(0, limit).map(({ path }) => {
    const entry: { path: string; type?: string; css: string | null } = {
      path,
      css: describeValue(values.get(path), types.get(path)).css,
    }
    const type = types.get(path)
    if (type !== undefined) {
      entry.type = type
    }
    return entry
  })
  return {
    contexts,
    total: flat.length,
    truncated: flat.length > limit,
    tokens,
  }
}

/**
 * Search token paths and descriptions with an optional `$type` filter.
 *
 * @public
 */
export function searchTokens(
  source: TokenSource,
  query: string,
  type?: string,
  contexts?: Record<string, string>,
  limit = 50
): {
  query: string
  total: number
  results: Array<{
    path: string
    type?: string
    css: string | null
    description?: string
  }>
} {
  const { flat, types, values } = resolvedFlat(source, contexts)
  const needle = query.toLowerCase()
  const matches = flat.filter(({ path, token }) => {
    if (type && types.get(path) !== type) {
      return false
    }
    return (
      path.toLowerCase().includes(needle) ||
      (token.$description?.toLowerCase().includes(needle) ?? false)
    )
  })
  return {
    query,
    total: matches.length,
    results: matches.slice(0, limit).map(({ path, token }) => {
      const entry: {
        path: string
        type?: string
        css: string | null
        description?: string
      } = {
        path,
        css: describeValue(values.get(path), types.get(path)).css,
      }
      const type = types.get(path)
      if (type !== undefined) {
        entry.type = type
      }
      if (token.$description !== undefined) {
        entry.description = token.$description
      }
      return entry
    }),
  }
}

/**
 * Compare two Figma variables exports and return a Markdown report.
 *
 * @public
 */
export function diffTokens(oldJson: unknown, newJson: unknown): string {
  return formatDiffMarkdown(diffVariables(oldJson, newJson))
}
