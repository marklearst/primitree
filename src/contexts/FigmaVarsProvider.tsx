import { createContext, useContext } from 'react'
import type {
  FigmaTokenContextType,
  FigmaVarsProviderProps,
} from '../types/contexts'

/**
 * @internal
 * React Context to provide the Figma token and file key down the component tree.
 * @function FigmaTokenContext
 * @memberof Contexts
 * @since 1.0.0
 */
const FigmaTokenContext = createContext<FigmaTokenContextType | undefined>(
  undefined
)

/**
 * Provides the Figma token and file key to all descendant hooks.
 * This component should be placed at the root of your application or any component tree
 * that needs to interact with the Figma Variables API.
 *
 * @function FigmaVarsProvider
 * @memberof Providers
 * @since 1.0.0
 * @param {FigmaVarsProviderProps} props - The provider props
 * @param {string} props.token - The Figma Personal Access Token
 * @param {string} props.fileKey - The Figma file key from the file URL
 * @param {React.ReactNode} props.children - The child components that will have access to the context
 * @returns {JSX.Element} The provider component
 * @see {@link https://www.figma.com/developers/api#authentication|Figma API Authentication}
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figma-vars/hooks';
 *
 * function App() {
 *   const token = process.env.REACT_APP_FIGMA_TOKEN;
 *   const fileKey = 'abc123def456'; // From Figma file URL
 *
 *   return (
 *     <FigmaVarsProvider token={token} fileKey={fileKey}>
 *       <Dashboard />
 *       <VariableEditor />
 *     </FigmaVarsProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With Next.js and environment variables
 * import { FigmaVarsProvider } from '@figma-vars/hooks';
 *
 * export default function MyApp({ Component, pageProps }) {
 *   return (
 *     <FigmaVarsProvider
 *       token={process.env.NEXT_PUBLIC_FIGMA_TOKEN}
 *       fileKey={process.env.NEXT_PUBLIC_FIGMA_FILE_KEY}
 *     >
 *       <Component {...pageProps} />
 *     </FigmaVarsProvider>
 *   );
 * }
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
 * @function useFigmaTokenContext
 * @memberof Hooks
 * @since 1.0.0
 * @returns {FigmaTokenContextType} The Figma token and file key.
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
