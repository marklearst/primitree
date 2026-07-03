/**
 * React 19 hooks for built design tokens and the Figma Variables REST API.
 *
 * @remarks
 * `TokensProvider` reads DTCG token data. `FigmaVariablesProvider` supplies a file
 * key and Personal Access Token to the live REST API hooks.
 *
 * @module hooks
 */

/**
 * Provide a Figma file key and Personal Access Token to live API hooks.
 *
 * @remarks
 * Browser code and page scripts can read a token passed to this provider.
 * Do not expose a token to untrusted client code or include it in a public
 * browser bundle.
 *
 * @example
 * ```tsx
 * import { FigmaVariablesProvider } from '@primitree/hooks';
 *
 * function App({ token }: { token: string }) {
 *   return (
 *     <FigmaVariablesProvider token={token} fileKey="your-file-key">
 *       <YourComponent />
 *     </FigmaVariablesProvider>
 *   );
 * }
 * ```
 */
export { FigmaVariablesProvider } from './contexts'

/**
 * Hooks for reading and changing Figma variables through the REST API.
 *
 * @remarks
 * The group includes reads, mutations, cache invalidation, and selectors for
 * collections and modes.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useVariables, useCreateVariable } from '@primitree/hooks';
 *
 * function Example() {
 *   const { data, isLoading } = useVariables();
 *   const { mutate } = useCreateVariable();
 *   // Use the hooks in your component logic
 * }
 * ```
 */
export {
  useVariables,
  usePublishedVariables,
  useVariableCollections,
  useVariableModes,
  useVariableById,
  useCollectionById,
  useModesByCollection,
  useFigmaToken,
  useCreateVariable,
  useUpdateVariable,
  useDeleteVariable,
  useBulkUpdateVariables,
  useInvalidateVariables,
} from './hooks'

/**
 * Hooks for design-token files from `primitree build`.
 *
 * @remarks
 * These hooks consume DTCG token files and a Resolver without calling the
 * Figma API or requiring a Personal Access Token.
 *
 * @example
 * ```tsx
 * import { TokensProvider, useToken, useTheme } from '@primitree/hooks';
 *
 * function Brand() {
 *   const brand = useToken('semantic.color.bg.brand');
 *   const { setContext } = useTheme();
 *   return (
 *     <button
 *       style={{ background: brand.css ?? undefined }}
 *       onClick={() => setContext('semantic', 'dark')}>
 *       Go dark
 *     </button>
 *   );
 * }
 * ```
 */
export { TokensProvider, useTokens, useToken, useTheme } from './tokens'
export type {
  TokensProviderProps,
  TokensContextValue,
  UseTokenResult,
  UseThemeResult,
} from './tokens'

/**
 * Read the Figma file and authentication context.
 *
 * @remarks
 * The return value includes the token, file key, fallback data, and SWR
 * configuration from the nearest provider.
 *
 * @example
 * ```tsx
 * import { useFigmaTokenContext } from '@primitree/hooks';
 * const { token, fileKey } = useFigmaTokenContext();
 * ```
 */
export { useFigmaTokenContext } from './contexts'

/**
 * Figma Variables filters, error helpers, guards, redaction, and retry.
 *
 * @remarks
 * These functions come from `@primitree/core`.
 *
 * @example
 * ```ts
 * import { filterVariables, isFigmaApiError, getErrorStatus } from '@primitree/hooks';
 * const filtered = filterVariables(variables, { resolvedType: 'COLOR' });
 *
 * // Error handling
 * if (isFigmaApiError(error)) {
 *   console.log('Status:', error.statusCode);
 * }
 * ```
 */
export {
  filterVariables,
  withRetry,
  redactToken,
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
  isRateLimited,
  getRetryAfter,
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from './utils'

/**
 * Public Figma Variables, mutation, hook, and provider types.
 *
 * @remarks
 * @example
 * ```ts
 * import type { FigmaVariable, CreateVariablePayload } from '@primitree/hooks';
 * ```
 */
export * from './types'
