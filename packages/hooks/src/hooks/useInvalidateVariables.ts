import { useSWRConfig } from 'swr'
import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { getInvalidationKeys } from '../utils/swrKeys'

/**
 * Return functions that invalidate or revalidate Figma Variables SWR entries.
 *
 * @remarks
 * Both functions target live API data and validated fallback data for the
 * current provider.
 *
 * @returns Object with `invalidate` and `revalidate` functions.
 *
 * @example
 * ```tsx
 * import { useInvalidateVariables, useUpdateVariable } from '@figmavars/hooks';
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
   * Marks this provider's live and fallback cache keys stale. SWR refetches
   * them on the next read.
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
   * Requests a fresh value for each live and fallback cache key now.
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
