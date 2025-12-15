import { useMemo } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from 'types/contexts'
import { FigmaTokenContext } from './FigmaTokenContext'

// Generate a unique ID for each provider instance to avoid SWR cache collisions
let providerIdCounter = 0

/**
 * React context provider that supplies the Figma Personal Access Token and file key to all descendant components.
 *
 * @remarks
 * Wrap your application or feature subtree with this provider to securely and type-safely provide the Figma Personal Access Token (PAT) and target Figma file key. This enables all child hooks and utilities to access the Figma Variables REST API with consistent authentication and scoping.
 *
 * This is the central source of truth for Figma authentication and file context within the app.
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
  const providerId = useMemo(() => {
    providerIdCounter += 1
    return `figma-vars-provider-${providerIdCounter}`
  }, [])

  const value: FigmaTokenContextType = useMemo(() => {
    const base = {
      token,
      fileKey,
      providerId,
      ...(swrConfig !== undefined && { swrConfig }),
    }
    return fallbackFile === undefined ? base : { ...base, fallbackFile }
  }, [token, fileKey, fallbackFile, providerId, swrConfig])

  return (
    <FigmaTokenContext.Provider value={value}>
      {children}
    </FigmaTokenContext.Provider>
  )
}
