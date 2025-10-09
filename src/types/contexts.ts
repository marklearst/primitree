/**
 * @fileoverview TypeScript type definitions for React context types.
 * These types define the structure of context values and provider props.
 * @since 1.0.0
 */

import type { ReactNode } from 'react'

/**
 * @internal
 * The shape of the context provided by `FigmaVarsProvider`.
 * 
 * @typedef {Object} FigmaTokenContextType
 * @memberof Types
 * @since 1.0.0
 * @property {string | null} token The Figma Personal Access Token.
 * @property {string | null} fileKey The key of the Figma file to access.
 */
export interface FigmaTokenContextType {
  /** The Figma Personal Access Token. */
  token: string | null
  /** The key of the Figma file to access. */
  fileKey: string | null
}

/**
 * Props for the `FigmaVarsProvider` component.
 * 
 * @typedef {Object} FigmaVarsProviderProps
 * @memberof Types
 * @since 1.0.0
 * @property {ReactNode} children The child components that will have access to the context.
 * @property {string | null} token The Figma Personal Access Token for API authentication.
 * @property {string | null} fileKey The Figma file key extracted from the file URL.
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
