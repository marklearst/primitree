import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'

/**
 * Read the Figma Personal Access Token from context.
 *
 * @remarks
 * Browser code and page scripts can read the returned token. Do not expose it
 * to untrusted client code or use its presence as route authorization.
 *
 * @example
 * ```tsx
 * import { useFigmaToken } from '@figmavars/hooks';
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
