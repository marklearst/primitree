import {
  applyResolver,
  cssValue,
  cssVarName,
  flattenTokens,
  listContexts,
  resolveTokenValuesSafe,
  FIGMA_EXTENSION_KEY,
  type DTCGToken,
  type DTCGTokenValue,
} from '@figmavars/dtcg'
import { diffVariables, formatDiffMarkdown } from '@figmavars/core'
import type { TokenSource } from './source'

function resolvedFlat(source: TokenSource, contexts?: Record<string, string>) {
  const document = applyResolver(source.files, source.resolver, contexts ?? {})
  const flat = flattenTokens(document)
  const { values } = resolveTokenValuesSafe(flat)
  return { flat, values }
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
 * List collections (top-level token groups), their token counts, and the
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
 * Get a single token by dot path, optionally under specific contexts.
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
    figma: entry.token.$extensions?.[FIGMA_EXTENSION_KEY],
  }
}

/**
 * Resolve every token under a context selection.
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
  const { flat, values } = resolvedFlat(source, contexts)
  const tokens = flat.slice(0, limit).map(({ path, token }) => {
    const entry: { path: string; type?: string; css: string | null } = {
      path,
      css: describeValue(values.get(path)).css,
    }
    if (token.$type !== undefined) {
      entry.type = token.$type
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
 * Search tokens by substring across path and description, optionally
 * filtered by `$type`.
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
  const { flat, values } = resolvedFlat(source, contexts)
  const needle = query.toLowerCase()
  const matches = flat.filter(({ path, token }) => {
    if (type && token.$type !== type) {
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
      if (token.$type !== undefined) {
        entry.type = token.$type
      }
      if (token.$description !== undefined) {
        entry.description = token.$description
      }
      return entry
    }),
  }
}

/**
 * Semantic diff between two Figma variables exports, rendered as Markdown.
 *
 * @public
 */
export function diffTokens(oldJson: unknown, newJson: unknown): string {
  return formatDiffMarkdown(diffVariables(oldJson, newJson))
}
