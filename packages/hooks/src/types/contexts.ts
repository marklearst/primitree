import type { ReactNode } from 'react'
import type { SWRConfiguration } from 'swr'
import type {
  ClassifiedFallbackData,
  FallbackDataKind,
  LocalVariablesResponse,
  PublishedVariablesResponse,
} from '@figmavars/core'

/**
 * Value supplied by {@link FigmaVarsProvider}.
 *
 * @remarks
 * Browser code and page scripts can read `token`. Do not pass a secret to
 * untrusted client code.
 *
 * @example
 * ```tsx
 * import { useFigmaTokenContext } from '@figmavars/hooks';
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
   * @deprecated Pass fallback data to {@link FigmaVarsProvider}. Read validated
   * data with {@link useVariables} or {@link usePublishedVariables}.
   */
  fallbackFile?: LocalVariablesResponse | PublishedVariablesResponse | string
  /**
   * Pre-parsed fallback variable data. Set automatically by FigmaVarsProvider
   * when fallbackFile is provided. Hooks should prefer this over fallbackFile.
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
   * SWR configuration used by hooks under this provider.
   */
  swrConfig?: SWRConfiguration | undefined
}

/**
 * Props for {@link FigmaVarsProvider}.
 *
 * @remarks
 * Browser code and page scripts can read `token`. Do not include a token in a
 * public client bundle.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figmavars/hooks';
 *
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
   * <FigmaVarsProvider
   *   token={token}
   *   fileKey={fileKey}
   *   swrConfig={{
   *     revalidateOnFocus: false,
   *     dedupingInterval: 5000,
   *     errorRetryCount: 3,
   *   }}
   * >
   *   <App />
   * </FigmaVarsProvider>
   * ```
   */
  swrConfig?: SWRConfiguration
}
