/**
 * Shared utilities for constructing SWR cache keys consistently across hooks.
 *
 * @remarks
 * Centralizes key construction logic to prevent mismatches between fetch hooks
 * and invalidation utilities. Ensures that invalidation keys match the keys
 * used by useSWR in fetch hooks.
 *
 * @internal
 */

/**
 * Parameters for constructing a variables SWR key.
 */
export interface VariablesKeyParams {
  /** Figma file key, or null if not available */
  fileKey: string | null
  /** Figma Personal Access Token, or null if not available */
  token: string | null
  /** Provider instance ID for fallback cache scoping */
  providerId: string | undefined
  /** Whether fallback file is available */
  hasFallback: boolean
}

/**
 * Parameters for constructing a published variables SWR key.
 */
export interface PublishedVariablesKeyParams {
  /** Figma file key, or null if not available */
  fileKey: string | null
  /** Figma Personal Access Token, or null if not available */
  token: string | null
  /** Provider instance ID for fallback cache scoping */
  providerId: string | undefined
  /** Whether fallback file is available */
  hasFallback: boolean
}

/**
 * Constructs the SWR cache key for local variables.
 *
 * @remarks
 * If fallback is available, always returns a fallback key to prevent
 * fallback data from being cached under live API keys. This ensures
 * cache isolation between fallback and live data sources.
 *
 * @param params - Key construction parameters
 * @returns SWR key tuple, or null if no valid key can be constructed
 *
 * @internal
 */
export function getVariablesKey(
  params: VariablesKeyParams
): readonly [string, string] | null {
  const { fileKey, token, providerId, hasFallback } = params

  // If fallback is available, always use fallback key to prevent
  // fallback data from being cached under live API keys
  if (hasFallback) {
    return [`fallback-${providerId ?? 'default'}`, 'fallback'] as const
  }

  // Only use live key if no fallback and we have credentials
  if (token && fileKey) {
    const url = `https://api.figma.com/v1/files/${fileKey}/variables/local`
    return [url, token] as const
  }

  return null
}

/**
 * Constructs the SWR cache key for published variables.
 *
 * @remarks
 * If fallback is available, always returns a fallback key to prevent
 * fallback data from being cached under live API keys. This ensures
 * cache isolation between fallback and live data sources.
 *
 * @param params - Key construction parameters
 * @returns SWR key tuple, or null if no valid key can be constructed
 *
 * @internal
 */
export function getPublishedVariablesKey(
  params: PublishedVariablesKeyParams
): readonly [string, string] | null {
  const { fileKey, token, providerId, hasFallback } = params

  // If fallback is available, always use fallback key to prevent
  // fallback data from being cached under live API keys
  if (hasFallback) {
    return [`fallback-${providerId ?? 'default'}`, 'fallback'] as const
  }

  // Only use live key if no fallback and we have credentials
  if (token && fileKey) {
    const url = `https://api.figma.com/v1/files/${fileKey}/variables/published`
    return [url, token] as const
  }

  return null
}

/**
 * Constructs all possible SWR cache keys for invalidation purposes.
 * Returns keys for both live and fallback scenarios to ensure complete invalidation.
 *
 * @param params - Key construction parameters
 * @returns Array of SWR keys that should be invalidated
 *
 * @internal
 */
export function getInvalidationKeys(params: {
  fileKey: string | null
  token: string | null
  providerId: string | undefined
  hasFallback: boolean
}): Array<readonly [string, string]> {
  const { fileKey, token, providerId, hasFallback } = params
  const keys: Array<readonly [string, string]> = []

  // Add live keys if we have token and fileKey
  if (token && fileKey) {
    // Local variables key
    keys.push([
      `https://api.figma.com/v1/files/${fileKey}/variables/local`,
      token,
    ] as const)

    // Published variables key
    keys.push([
      `https://api.figma.com/v1/files/${fileKey}/variables/published`,
      token,
    ] as const)
  }

  // Add fallback key if fallback is available
  if (hasFallback && providerId) {
    keys.push([`fallback-${providerId}`, 'fallback'] as const)
  }

  return keys
}
