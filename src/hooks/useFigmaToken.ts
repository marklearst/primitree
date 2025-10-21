import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'

/**
 * Retrieves the Figma API token from the FigmaVarsProvider.
 * This hook must be used within a component wrapped by FigmaVarsProvider.
 *
 * @function useFigmaToken
 * @memberof Hooks
 * @since 1.0.0
 * @returns {string | null} The Figma Personal Access Token, or `null` if it has not been provided.
 * @see {@link https://www.figma.com/developers/api#authentication|Figma API Authentication}
 * @see {@link FigmaVarsProvider} - The provider component that supplies the token
 *
 * @example
 * ```tsx
 * import { useFigmaToken } from '@figma-vars/hooks';
 *
 * function CustomAPIComponent() {
 *   const figmaToken = useFigmaToken();
 *
 *   const makeCustomAPICall = async () => {
 *     if (!figmaToken) {
 *       console.error('No Figma token available');
 *       return;
 *     }
 *
 *     // Use token for custom API calls
 *     const response = await fetch('https://api.figma.com/v1/me', {
 *       headers: {
 *         'X-FIGMA-TOKEN': figmaToken
 *       }
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       {figmaToken ? 'Token available' : 'No token provided'}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Check token availability before making API calls
 * const MyComponent = () => {
 *   const figmaToken = useFigmaToken();
 *
 *   if (!figmaToken) {
 *     return <div>Please provide a Figma token</div>;
 *   }
 *
 *   return <div>Ready to interact with Figma API</div>;
 * };
 * ```
 */
const useFigmaToken = (): string | null => {
  const { token } = useFigmaTokenContext()
  return token
}

export default useFigmaToken
