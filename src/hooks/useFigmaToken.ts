import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'

/**
 * React hook that provides access to the Figma Personal Access Token (PAT) from context.
 *
 * @remarks
 * Returns the PAT provided to the FigmaVarsProvider, or `null` if no token is available. Use this hook to authenticate API requests, secure routes, or prompt users to enter their token if missing. Centralizes Figma authentication for all hooks and utilities.
 *
 * @example
 * ```tsx
 * import { useFigmaToken } from '@figma-vars/hooks';
 *
 * function AuthStatus() {
 *   const token = useFigmaToken();
 *   if (!token) return <div>Please provide a Figma API token.</div>;
 *   return <div>Token available.</div>;
 * }
 * ```
 *
 * @public
 */
const useFigmaToken = (): string | null => {
  const { token } = useFigmaTokenContext()
  return token
}

export default useFigmaToken
