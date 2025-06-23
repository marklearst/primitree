import { createContext, useContext } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from 'types/contexts'

const FigmaTokenContext = createContext<FigmaTokenContextType | undefined>(
  undefined
)

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
}: FigmaVarsProviderProps) => {
  return (
    <FigmaTokenContext.Provider value={{ token, fileKey }}>
      {children}
    </FigmaTokenContext.Provider>
  )
}

/**
 * React hook to access the current Figma Personal Access Token and file key from context.
 *
 * @remarks
 * Retrieves the token and file key provided by the nearest `FigmaVarsProvider`.
 * Throws a descriptive error if used outside of the provider to prevent silent failures.
 *
 * Use this hook in any component or hook that requires authenticated access to the Figma Variables API scoped to a file.
 *
 * @returns The current FigmaTokenContextType containing `{ token, fileKey }`.
 *
 * @throws Throws if called outside of a `FigmaVarsProvider` context.
 *
 * @example
 * ```tsx
 * import { useFigmaTokenContext } from '@figma-vars/hooks/contexts';
 *
 * function DebugToken() {
 *   const { token, fileKey } = useFigmaTokenContext();
 *   return (
 *     <div>
 *       <p>Token: {token?.slice(0, 6)}... (hidden for security)</p>
 *       <p>File Key: {fileKey}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @public
 */
export const useFigmaTokenContext = (): FigmaTokenContextType => {
  const context = useContext(FigmaTokenContext)
  if (context === undefined) {
    throw new Error(
      'useFigmaTokenContext must be used within a FigmaVarsProvider'
    )
  }
  return context
}
