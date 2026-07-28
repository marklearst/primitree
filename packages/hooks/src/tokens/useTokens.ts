import { useContext } from 'react'
import { TokensContext, type TokensContextValue } from './TokensContext'

/**
 * Read token data from the nearest {@link TokensProvider}: the
 * merged document, flattened tokens, resolved values, and context controls.
 *
 * @throws Error outside a TokensProvider.
 *
 * @example
 * ```tsx
 * const { flat, valuesByPath } = useTokens()
 * const colors = flat.filter(t => t.token.$type === 'color')
 * ```
 *
 * @public
 */
export function useTokens(): TokensContextValue {
  const context = useContext(TokensContext)
  if (!context) {
    throw new Error('Call useTokens inside a <TokensProvider>.')
  }
  return context
}
