import { useTokens } from './useTokens'

/**
 * Result of {@link useTheme}.
 *
 * @public
 */
export interface UseThemeResult {
  /** Active context per axis, e.g. `{ semantic: 'dark', density: 'compact' }`. */
  contexts: Record<string, string>
  /** Resolver contexts for each axis. */
  availableContexts: Record<string, string[]>
  /** Switch one axis: `setContext('semantic', 'dark')`. */
  setContext: (axis: string, context: string) => void
  /** Replace the entire selection at once. */
  setContexts: (contexts: Record<string, string>) => void
}

/**
 * Read and switch resolver contexts (Figma modes) at runtime.
 *
 * @remarks
 * `primitree build` writes the DTCG Resolver that supplies axes and context
 * names. For a Figma collection named "Theme" with Light and Dark modes, call
 * `setContext('theme', 'dark')`.
 *
 * @example
 * ```tsx
 * const { contexts, availableContexts, setContext } = useTheme()
 * <button onClick={() => setContext('semantic', contexts.semantic === 'dark' ? 'light' : 'dark')}>
 *   Toggle theme
 * </button>
 * ```
 *
 * @public
 */
export function useTheme(): UseThemeResult {
  const { contexts, availableContexts, setContext, setContexts } = useTokens()
  return { contexts, availableContexts, setContext, setContexts }
}
