import type { ReactNode } from 'react'

/**
 * Central context shape for FigmaVars—provides authentication and file context to all hooks and consumers in the tree.
 *
 * @remarks
 * - `token`: Figma Personal Access Token (PAT) for authenticating Figma REST API requests. You can generate a PAT in your Figma account settings (https://www.figma.com/developers/api#access-tokens).
 * - `fileKey`: Figma file key uniquely identifying the current Figma file context. You can find the file key in the Figma file URL—it is the string after `/file/` and before the next `/` (e.g., https://www.figma.com/file/<fileKey>/...).
 *
 * This type defines the single source of truth for authentication and file context, available via the FigmaVarsProvider context and typically accessed using `useFigmaTokenContext`.
 * All variable, collection, and mode hooks rely on this context to determine scope and authorization.
 *
 * @example
 * ```tsx
 * import { useFigmaTokenContext } from '@figma-vars/hooks';
 *
 * function TokenStatus() {
 *   const { token, fileKey } = useFigmaTokenContext();
 *   if (!token) return <div>Figma API token missing.</div>;
 *   return <div>
 *     <div>Token: {token.slice(0, 4)}... (hidden)</div>
 *     <div>File key: {fileKey}</div>
 *   </div>;
 * }
 * ```
 *
 * @public
 */
export interface FigmaTokenContextType {
  /**
   * Figma Personal Access Token (PAT), or null if not set. Required for all authenticated Figma REST API operations.
   * Generate a PAT in Figma account settings: https://www.figma.com/developers/api#access-tokens
   */
  token: string | null
  /**
   * Figma file key for the current file context, or null if not set.
   * The file key is the string after '/file/' in a Figma file URL (e.g., https://www.figma.com/file/<fileKey>/...).
   */
  fileKey: string | null
}

/**
 * Props for the FigmaVarsProvider component, which injects Figma API authentication and file scoping for all descendant hooks and utilities.
 *
 * @remarks
 * - `children`: React nodes to render within the provider—this wraps your app, feature, or test tree.
 * - `token`: Figma Personal Access Token (PAT) for authenticating API calls. Obtain one in your Figma account settings: https://www.figma.com/developers/api#access-tokens
 * - `fileKey`: Figma file key identifying the file to scope all variable/collection operations to. Extract the file key from your Figma file URL: https://www.figma.com/file/<fileKey>/...
 *
 * Use this to wrap your application, dashboard, or Storybook preview, ensuring all consumers have access to the proper Figma API context and authentication.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figma-vars/hooks';
 *
 * // At the root of your app:
 * <FigmaVarsProvider token={myToken} fileKey={myFileKey}>
 *   <App />
 * </FigmaVarsProvider>
 * ```
 *
 * @public
 */
export interface FigmaVarsProviderProps {
  /**
   * The React nodes to render inside the provider.
   */
  children: ReactNode
  /**
   * Figma Personal Access Token (PAT) to inject into context. Required for all authenticated API operations.
   * Generate your PAT in Figma account settings: https://www.figma.com/developers/api#access-tokens
   */
  token: string | null
  /**
   * Figma file key (ID) to provide context for all variable and collection operations.
   * The file key is found in the Figma file URL, after `/file/` and before the next `/` (e.g., https://www.figma.com/file/<fileKey>/...).
   */
  fileKey: string | null
}
