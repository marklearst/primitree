import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  applyResolver,
  flattenTokens,
  listContexts,
  mergeDocuments,
  resolveTokenValuesSafe,
  type DTCGDocument,
  type ResolverDocument,
} from '@primitree/dtcg'
import { TokensContext, type TokensContextValue } from './TokensContext'

/**
 * Props for {@link TokensProvider}.
 *
 * @public
 */
export interface TokensProviderProps {
  /**
   * DTCG token documents: a single document, an array (merged in order), or
   * a file-name map from `primitree build`. A Resolver needs the map form so
   * the provider can follow `$ref` paths.
   */
  tokens: DTCGDocument | DTCGDocument[] | Record<string, DTCGDocument>
  /**
   * DTCG Resolver (2025.10) describing modes and contexts. Pass one to let
   * `useTheme` switch contexts such as light and dark at runtime.
   */
  resolver?: ResolverDocument
  /** Initial context per modifier axis; falls back to resolver defaults. */
  defaultContexts?: Record<string, string>
  children: ReactNode
}

function isFileMap(
  tokens: TokensProviderProps['tokens']
): tokens is Record<string, DTCGDocument> {
  if (Array.isArray(tokens)) {
    return false
  }
  return Object.keys(tokens).some(key => key.endsWith('.json'))
}

/**
 * Provide DTCG token files and a Resolver to
 * the local-token hooks: {@link useToken}, {@link useTokens}, {@link useTheme}.
 *
 * @remarks
 * The provider accepts output from `primitree build` or other DTCG documents.
 * It reads local data and does not require a Figma token.
 *
 * @example
 * ```tsx
 * import { TokensProvider, useToken, useTheme } from '@primitree/hooks'
 * import primitives from './tokens/primitives.tokens.json'
 * import semantic from './tokens/semantic.tokens.json'
 * import semanticDark from './tokens/semantic.dark.tokens.json'
 * import resolver from './tokens/tokens.resolver.json'
 *
 * <TokensProvider
 *   tokens={{
 *     'primitives.tokens.json': primitives,
 *     'semantic.tokens.json': semantic,
 *     'semantic.dark.tokens.json': semanticDark,
 *   }}
 *   resolver={resolver}>
 *   <App />
 * </TokensProvider>
 * ```
 *
 * @public
 */
export function TokensProvider({
  tokens,
  resolver,
  defaultContexts,
  children,
}: TokensProviderProps) {
  const availableContexts = useMemo(
    () => (resolver ? listContexts(resolver) : {}),
    [resolver]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: defaultContexts is a mount-only initializer; changes after mount go through setContext.
  const initialContexts = useMemo(() => {
    const initial: Record<string, string> = {}
    if (resolver?.modifiers) {
      for (const [axis, modifier] of Object.entries(resolver.modifiers)) {
        const first = Object.keys(modifier.contexts)[0]
        const chosen = defaultContexts?.[axis] ?? modifier.default ?? first
        if (chosen !== undefined) {
          initial[axis] = chosen
        }
      }
    }
    return initial
  }, [resolver])

  const [contexts, setContextsState] =
    useState<Record<string, string>>(initialContexts)

  const setContext = useCallback((axis: string, context: string) => {
    setContextsState(prev => ({ ...prev, [axis]: context }))
  }, [])

  const setContexts = useCallback((next: Record<string, string>) => {
    setContextsState(next)
  }, [])

  const value = useMemo<TokensContextValue>(() => {
    let document: DTCGDocument
    if (resolver && isFileMap(tokens)) {
      document = applyResolver(tokens, resolver, contexts)
    } else if (Array.isArray(tokens)) {
      document = mergeDocuments(tokens)
    } else if (isFileMap(tokens)) {
      document = mergeDocuments(Object.values(tokens))
    } else {
      document = tokens
    }

    const flat = flattenTokens(document)
    const tokensByPath = new Map(flat.map(f => [f.path, f.token]))
    const { values: valuesByPath } = resolveTokenValuesSafe(flat)

    return {
      document,
      flat,
      tokensByPath,
      valuesByPath,
      contexts,
      availableContexts,
      setContext,
      setContexts,
    }
  }, [tokens, resolver, contexts, availableContexts, setContext, setContexts])

  return (
    <TokensContext.Provider value={value}>{children}</TokensContext.Provider>
  )
}
