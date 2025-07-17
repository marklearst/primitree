import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'

/**
 * Retrieves the Figma API token from the FigmaVarsProvider.
 * This hook must be used within a component wrapped by FigmaVarsProvider.
 *
 * @returns The Figma Personal Access Token, or `null` if it has not been provided.
 *
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const figmaToken = useFigmaToken();
 *   // Now you can use the token for manual API calls if needed.
 *   return <div>...</div>;
 * };
 * ```
 */
const useFigmaToken = (): string | null => {
  const { token } = useFigmaTokenContext()
  return token
}

export default useFigmaToken
