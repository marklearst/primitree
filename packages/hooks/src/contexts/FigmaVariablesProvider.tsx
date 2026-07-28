import { useMemo, useId } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVariablesProviderProps,
} from '../types/contexts'
import { FigmaTokenContext } from './FigmaTokenContext'
import { classifyFallbackData } from '@primitree/core'

const INVALID_FALLBACK_WARNING =
  '[primitree] fallbackFile does not match local or published Figma Variables API response data. Set fallbackKind for an empty response.'

const FALLBACK_PARSE_ERROR = '[primitree] Failed to parse fallbackFile JSON.'

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
 * import { FigmaVariablesProvider } from '@primitree/hooks'
 *
 * function App({ token }: { token: string }) {
 *   return (
 *     <FigmaVariablesProvider token={token} fileKey="AbC123">
 *       <MyDashboard />
 *     </FigmaVariablesProvider>
 *   );
 * }
 * ```
 *
 * @public
 */
export const FigmaVariablesProvider = ({
  children,
  token,
  fileKey,
  fallbackFile,
  fallbackKind,
  swrConfig,
}: FigmaVariablesProviderProps) => {
  // Generate a unique provider ID for this instance to avoid SWR cache collisions
  // Use React's useId() for stable, SSR-safe IDs
  const reactId = useId()
  const providerId = useMemo(() => {
    return `primitree-provider-${reactId}`
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
