/**
 * Build SWR cache keys for hooks.
 *
 * @remarks
 * Fetch hooks and invalidation utilities use the same key shapes.
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
 * Fallback data uses a fallback key instead of a live API key.
 *
 * @param params - Key construction parameters
 * @returns SWR key tuple, or null without credentials or fallback data.
 *
 * @internal
 */
export function getVariablesKey(
  params: VariablesKeyParams
): readonly [string, string] | null {
  const { fileKey, token, providerId, hasFallback } = params

  // Fallback data uses a separate cache key.
  if (hasFallback) {
    return [`fallback-${providerId ?? 'default'}`, 'fallback'] as const
  }

  // Live data needs both credentials.
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
 * Fallback data uses a fallback key instead of a live API key.
 *
 * @param params - Key construction parameters
 * @returns SWR key tuple, or null without credentials or fallback data.
 *
 * @internal
 */
export function getPublishedVariablesKey(
  params: PublishedVariablesKeyParams
): readonly [string, string] | null {
  const { fileKey, token, providerId, hasFallback } = params

  // Fallback data uses a separate cache key.
  if (hasFallback) {
    return [`fallback-${providerId ?? 'default'}`, 'fallback'] as const
  }

  // Live data needs both credentials.
  if (token && fileKey) {
    const url = `https://api.figma.com/v1/files/${fileKey}/variables/published`
    return [url, token] as const
  }

  return null
}

/**
 * List cache keys that invalidation must clear.
 * Includes live endpoints and the fallback key when their inputs exist.
 *
 * @param params - Key construction parameters
 * @returns SWR keys for matching live and fallback data.
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
