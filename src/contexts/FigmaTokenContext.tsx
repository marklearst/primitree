import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * @internal
 * The shape of the context provided by `FigmaVarsProvider`.
 */
interface FigmaTokenContextType {
  /** The Figma Personal Access Token. */
  token: string | null
  /** The key of the Figma file to access. */
  fileKey: string | null
}

/**
 * @internal
 * React Context to provide the Figma token and file key down the component tree.
 */
const FigmaTokenContext = createContext<FigmaTokenContextType | undefined>(
  undefined
)

/**
 * Props for the `FigmaVarsProvider` component.
 */
interface FigmaVarsProviderProps {
  /** The React children to render within the provider. */
  children: ReactNode
  /** The Figma Personal Access Token. Can be sourced from anywhere (e.g., env variables, localStorage). */
  token: string | null
  /** The key of the Figma file to be accessed by the hooks. */
  fileKey: string | null
}

/**
 * A React Context Provider that makes the Figma token and file key available to all `figma-vars-hooks`.
 * Wrap your application or component tree with this provider.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figma-vars/hooks';
 *
 * const App = () => (
 *   <FigmaVarsProvider
 *     token="your-figma-token"
 *     fileKey="your-figma-file-key"
 *   >
 *     <YourComponentThatUsesTheHooks />
 *   </FigmaVarsProvider>
 * );
 * ```
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
 * @internal
 * A hook to access the Figma token and file key from the context.
 * Throws an error if used outside of a `FigmaVarsProvider`.
 * @returns The Figma token and file key.
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
