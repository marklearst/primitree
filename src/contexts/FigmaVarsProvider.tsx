import { useMemo, useId } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from 'types/contexts'
import { FigmaTokenContext } from './FigmaTokenContext'
import { validateFallbackData } from 'utils/typeGuards'

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
 * import { FigmaVarsProvider } from '@figma-vars/hooks/contexts';
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
  const parsedFallbackFile = useMemo(() => {
    if (!fallbackFile) {
      return undefined
    }

    // If already parsed (object), validate structure using type guard
    if (typeof fallbackFile === 'object') {
      const validated = validateFallbackData(fallbackFile)
      if (validated) {
        return validated
      }
      // Invalid structure - log warning but don't crash
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[figma-vars-hooks] fallbackFile object does not match expected Figma Variables API response structure. ' +
            'Expected { meta: { variableCollections: {...}, variables: {...} } }'
        )
      }
      return undefined
    }

    // If string, parse JSON with error handling
    if (typeof fallbackFile === 'string') {
      try {
        const parsed: unknown = JSON.parse(fallbackFile)
        const validated = validateFallbackData(parsed)
        if (validated) {
          return validated
        }
        // Invalid structure - log warning but don't crash
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[figma-vars-hooks] Parsed fallbackFile JSON does not match expected Figma Variables API response structure. ' +
              'Expected { meta: { variableCollections: {...}, variables: {...} } }'
          )
        }
        return undefined
      } catch (error) {
        // Log error but don't crash the provider
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            `[figma-vars-hooks] Failed to parse fallbackFile JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
        return undefined
      }
    }

    return undefined
  }, [fallbackFile])

  const value: FigmaTokenContextType = useMemo(() => {
    const base = {
      token,
      fileKey,
      providerId,
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
  }, [token, fileKey, fallbackFile, parsedFallbackFile, providerId, swrConfig])

  return (
    <FigmaTokenContext.Provider value={value}>
      {children}
    </FigmaTokenContext.Provider>
  )
}
