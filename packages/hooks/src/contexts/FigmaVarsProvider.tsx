import { useMemo, useId } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from '../types/contexts'
import { FigmaTokenContext } from './FigmaTokenContext'
import { classifyFallbackData } from '@figmavars/core'

const INVALID_FALLBACK_WARNING =
  '[figmavars] fallbackFile could not be classified as local or published Figma Variables API response data. Provide fallbackKind for empty response data.'

const FALLBACK_PARSE_ERROR = '[figmavars] Failed to parse fallbackFile JSON.'

/**
 * React context provider that supplies the Figma Personal Access Token and file key to all descendant components.
 *
 * @remarks
 * Wrap your application or feature subtree with this provider to securely and type-safely provide the Figma Personal Access Token (PAT) and target Figma file key. This enables all child hooks and utilities to access the Figma Variables REST API with consistent authentication and scoping.
 *
 * This is the central source of truth for Figma authentication and file context within the app.
 *
 * Fallback JSON files are parsed once during provider initialization to avoid repeated parsing and provide early validation.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figmavars/hooks/contexts';
 *
 * function App() {
 *   return (
 *     <FigmaVarsProvider token={process.env.FIGMA_PAT!} fileKey="AbC123">
 *       <MyDashboard />
 *     </FigmaVarsProvider>
 *   );
 * }
 * ```
 *
 * @public
 */
export const FigmaVarsProvider = ({
  children,
  token,
  fileKey,
  fallbackFile,
  fallbackKind,
  swrConfig,
}: FigmaVarsProviderProps) => {
  // Generate a unique provider ID for this instance to avoid SWR cache collisions
  // Use React's useId() for stable, SSR-safe IDs
  const reactId = useId()
  const providerId = useMemo(() => {
    return `figma-vars-provider-${reactId}`
  }, [reactId])

  // Parse fallback JSON once and cache the result
  // Errors are caught and stored to prevent provider from crashing during render
  const validatedFallback = useMemo(() => {
    if (fallbackFile === undefined) {
      return undefined
    }

    let parsed: unknown = fallbackFile

    // If string, parse JSON with error handling
    if (typeof fallbackFile === 'string') {
      try {
        parsed = JSON.parse(fallbackFile) as unknown
      } catch {
        // Log error but don't crash the provider
        if (process.env.NODE_ENV !== 'production') {
          console.error(FALLBACK_PARSE_ERROR)
        }
        return undefined
      }
    }

    const classified = classifyFallbackData(parsed, fallbackKind)
    if (!classified && process.env.NODE_ENV !== 'production') {
      console.warn(INVALID_FALLBACK_WARNING)
    }

    return classified
  }, [fallbackFile, fallbackKind])

  const parsedFallbackFile = validatedFallback?.data

  const value: FigmaTokenContextType = useMemo(() => {
    const base = {
      token,
      fileKey,
      providerId,
      validatedFallback,
      ...(swrConfig !== undefined && { swrConfig }),
    }

    if (fallbackFile === undefined) {
      return base
    }

    return {
      ...base,
      fallbackFile, // Keep for backward compatibility
      parsedFallbackFile, // Pre-parsed version for hooks to use
    }
  }, [
    token,
    fileKey,
    fallbackFile,
    parsedFallbackFile,
    providerId,
    swrConfig,
    validatedFallback,
  ])

  return (
    <FigmaTokenContext.Provider value={value}>
      {children}
    </FigmaTokenContext.Provider>
  )
}
