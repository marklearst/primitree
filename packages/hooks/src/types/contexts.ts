import type { ReactNode } from 'react'
import type { SWRConfiguration } from 'swr'
import type {
  ClassifiedFallbackData,
  FallbackDataKind,
  LocalVariablesResponse,
  PublishedVariablesResponse,
} from '@primitree/core'

/**
 * FigmaVariablesProvider value.
 *
 * @remarks
 * Browser code and page scripts can read `token`. Do not pass a secret to
 * untrusted client code.
 *
 * @example
 * ```tsx
 * import { useFigmaTokenContext } from '@primitree/hooks';
 *
 * function TokenStatus() {
 *   const { token, fileKey } = useFigmaTokenContext();
 *   if (!token) return <div>Figma API token missing.</div>;
 *   return <div>
 *     <div>Token configured: {String(Boolean(token))}</div>
 *     <div>File key: {fileKey}</div>
 *   </div>;
 * }
 * ```
 *
 * @public
 */
export interface FigmaTokenContextType {
  /**
   * Figma Personal Access Token, or `null`. Page scripts can read this value.
   */
  token: string | null
  /**
   * Figma file key, or `null`.
   */
  fileKey: string | null
  /**
   * Variables response data or JSON used without a live request.
   * @deprecated Pass fallback data to {@link FigmaVariablesProvider}. Read validated
   * data with {@link useVariables} or {@link usePublishedVariables}.
   */
  fallbackFile?: LocalVariablesResponse | PublishedVariablesResponse | string
  /**
   * FigmaVariablesProvider parses fallback variable data from fallbackFile. Hooks
   * should read this field instead of fallbackFile.
   * @internal
   */
  parsedFallbackFile?:
    LocalVariablesResponse | PublishedVariablesResponse | undefined
  /**
   * Validated fallback data with its runtime response kind.
   * @internal
   */
  validatedFallback?: ClassifiedFallbackData | undefined
  /**
   * Unique identifier for this provider instance, used to avoid SWR cache collisions.
   * @internal
   */
  providerId?: string
  /**
   * SWR configuration for hooks under this provider.
   */
  swrConfig?: SWRConfiguration | undefined
}

/**
 * Props for {@link FigmaVariablesProvider}.
 *
 * @remarks
 * Browser code and page scripts can read `token`. Do not include a token in a
 * public client bundle.
 *
 * @example
 * ```tsx
 * import { FigmaVariablesProvider } from '@primitree/hooks';
 *
 * <FigmaVariablesProvider token={myToken} fileKey={myFileKey}>
 *   <App />
 * </FigmaVariablesProvider>
 * ```
 *
 * @public
 */
export interface FigmaVariablesProviderProps {
  /**
   * The React nodes to render inside the provider.
   */
  children: ReactNode
  /**
   * Figma Personal Access Token, or `null`. Page scripts can read this value.
   */
  token: string | null
  /**
   * Figma file key, or `null`.
   */
  fileKey: string | null
  /**
   * Variables response data or JSON used without a live request.
   */
  fallbackFile?: LocalVariablesResponse | PublishedVariablesResponse | string
  /**
   * Response kind for fallback data whose shape does not reveal the kind,
   * such as a response with empty collection and variable maps.
   */
  fallbackKind?: FallbackDataKind
  /**
   * SWR configuration for caching, revalidation, and error handling.
   *
   * @example
   * ```tsx
   * <FigmaVariablesProvider
   *   token={token}
   *   fileKey={fileKey}
   *   swrConfig={{
   *     revalidateOnFocus: false,
   *     dedupingInterval: 5000,
   *     errorRetryCount: 3,
   *   }}
   * >
   *   <App />
   * </FigmaVariablesProvider>
   * ```
   */
  swrConfig?: SWRConfiguration
}
