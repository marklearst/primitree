import { useMemo } from 'react'
import {
  cssVarName,
  typedCssValue,
  type DTCGToken,
  type DTCGTokenType,
  type DTCGTokenValue,
} from '@primitree/dtcg'
import { useTokens } from './useTokens'

/**
 * Result of {@link useToken}.
 *
 * @public
 */
export interface UseTokenResult {
  /** The token before reference resolution. Its `$value` can contain a `{reference}`. */
  token: DTCGToken | undefined
  /** The value after reference resolution under the active contexts. */
  value: DTCGTokenValue | undefined
  /** Effective type after group inheritance and whole-token alias lookup. */
  type: DTCGTokenType | undefined
  /** The CSS form of that value, such as `'color(srgb 0.2 0.4 1)'` or `'8px'`. */
  css: string | null
  /** The CSS custom property accessor (`'var(--semantic-color-bg-brand)'`). */
  cssVar: string
  /** True when the documents contain the token. */
  exists: boolean
}

/**
 * Read one design token by dot path from the nearest {@link TokensProvider}.
 *
 * @remarks
 * Values resolve through DTCG references under the active
 * contexts, so switching a theme axis via {@link useTheme} re-renders
 * consumers with the new value.
 *
 * @param path - Dot-joined token path, e.g. `'semantic.color.bg.brand'`.
 *
 * @example
 * ```tsx
 * const brand = useToken('semantic.color.bg.brand')
 * return <div style={{ background: brand.css ?? undefined }} />
 * ```
 *
 * @public
 */
export function useToken(path: string): UseTokenResult {
  const { tokensByPath, typesByPath, valuesByPath } = useTokens()

  return useMemo(() => {
    const token = tokensByPath.get(path)
    const value = valuesByPath.get(path)
    const type = typesByPath.get(path)
    return {
      token,
      value,
      type,
      css: value === undefined ? null : typedCssValue(value, type),
      cssVar: `var(${cssVarName(path)})`,
      exists: token !== undefined,
    }
  }, [tokensByPath, typesByPath, valuesByPath, path])
}
