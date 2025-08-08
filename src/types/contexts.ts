import type { ReactNode } from 'react'

/**
 * @internal
 * The shape of the context provided by `FigmaVarsProvider`.
 */
export interface FigmaTokenContextType {
  /** The Figma Personal Access Token. */
  token: string | null
  /** The key of the Figma file to access. */
  fileKey: string | null
}

/**
 * Props for the `FigmaVarsProvider` component.
 */
export interface FigmaVarsProviderProps {
  /** The child components that will have access to the context. */
  children: ReactNode
  /**
   * Your Figma Personal Access Token.
   * @see https://www.figma.com/developers/api#authentication
   */
  token: string | null
  /**
   * The unique identifier of the Figma file you want to access.
   * You can get this from the file's URL.
   */
  fileKey: string | null
}
