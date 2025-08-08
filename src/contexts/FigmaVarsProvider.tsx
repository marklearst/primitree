import { createContext, useContext } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from 'types/contexts'

/**
 * @internal
 * React Context to provide the Figma token and file key down the component tree.
 */
const FigmaTokenContext = createContext<FigmaTokenContextType | undefined>(
  undefined
)

/**
 * Provides the Figma token and file key to all descendant hooks.
 * This component should be placed at the root of your application or any component tree
 * that needs to interact with the Figma Variables API.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from 'figma-vars-hooks';
 *
 * const App = () => (
 *   <FigmaVarsProvider
 *     token={process.env.FIGMA_ACCESS_TOKEN}
 *     fileKey="your-figma-file-key"
 *   >
 *     <MyComponent />
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
