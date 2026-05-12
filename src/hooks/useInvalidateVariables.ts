import { useSWRConfig } from 'swr'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { getInvalidationKeys } from 'utils/swrKeys'

/**
 * Hook that provides cache invalidation utilities for Figma variables.
 *
 * @remarks
 * Returns functions to invalidate and revalidate SWR cache for variables hooks.
 * Use this after mutations to ensure fresh data is fetched.
 *
 * Supports both live API usage (with token and fileKey) and fallback-only usage
 * (with fallbackFile but no fileKey).
 *
 * @returns Object with `invalidate` and `revalidate` functions.
 *
 * @example
 * ```tsx
 * import { useInvalidateVariables, useUpdateVariable } from '@figma-vars/hooks';
 *
 * function UpdateButton() {
 *   const { mutate } = useUpdateVariable();
 *   const { invalidate } = useInvalidateVariables();
 *
 *   const handleUpdate = async () => {
 *     await mutate({ variableId: 'id', payload: { name: 'New Name' } });
 *     invalidate(); // Refetch all variable queries
 *   };
 * }
 * ```
 *
 * @public
 */
export const useInvalidateVariables = () => {
  const { mutate } = useSWRConfig()
  const { token, fileKey, parsedFallbackFile, providerId } =
    useFigmaTokenContext()

  const hasFallback = Boolean(parsedFallbackFile)

  /**
   * Invalidates all variable-related SWR cache entries.
   * This will cause all variable hooks to refetch on next access.
   *
   * Works for both live API usage (with token/fileKey) and fallback-only usage.
   */
  const invalidate = () => {
    // Get all possible keys that should be invalidated
    const keys = getInvalidationKeys({
      fileKey,
      token,
      providerId,
      hasFallback,
    })

    // Invalidate each key
    for (const key of keys) {
      mutate(key)
    }
  }

  /**
   * Revalidates all variable-related SWR cache entries immediately.
   * This will trigger immediate refetch of all variable hooks.
   *
   * Works for both live API usage (with token/fileKey) and fallback-only usage.
   */
  const revalidate = () => {
    // Get all possible keys that should be revalidated
    const keys = getInvalidationKeys({
      fileKey,
      token,
      providerId,
      hasFallback,
    })

    // Revalidate each key
    for (const key of keys) {
      mutate(key, undefined, { revalidate: true })
    }
  }

  return {
    invalidate,
    revalidate,
  }
}
