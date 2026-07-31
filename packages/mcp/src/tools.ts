import {
  applyResolver,
  createDTCGGraphFragment,
  cssValue,
  cssVarName,
  flattenTokens,
  listContexts,
  type ReferenceResolutionError,
  resolveTokenValuesSafe,
  PRIMITREE_EXTENSION_KEY,
  type DTCGToken,
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

function resolvedFlat(source: TokenSource, contexts?: Record<string, string>) {
  const document = applyResolver(source.files, source.resolver, contexts ?? {})
  const flat = flattenTokens(document)
  const fragment = createDTCGGraphFragment(document, { source: 'mcp' })
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
  const types = new Map(
    fragment.value.tokens.map(token => [token.path.join('.'), token.type])
  )
  return { flat, values, types }
}

function describeValue(value: DTCGTokenValue | undefined): {
  value: DTCGTokenValue | undefined
  css: string | null
} {
  return {
    value,
    css: value === undefined ? null : cssValue(value),
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
  const { flat, values } = resolvedFlat(source, contexts)
  const entry = flat.find(f => f.path === path)
  if (!entry) {
    return { path, found: false }
  }
  const described = describeValue(values.get(path))
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
      css: describeValue(values.get(path)).css,
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
        css: describeValue(values.get(path)).css,
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
