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
 * Provide a Figma file key, token, and fallback data to live API hooks.
 *
 * @remarks
 * Browser code and page scripts can read a token passed here. Do not expose a
 * token to untrusted client code or include it in a public browser bundle.
 * The provider parses and classifies fallback JSON during render.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figmavars/hooks'
 *
 * function App({ token }: { token: string }) {
 *   return (
 *     <FigmaVarsProvider token={token} fileKey="AbC123">
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
