import { useSWRConfig } from 'swr'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { FIGMA_PUBLISHED_VARIABLES_PATH } from 'constants/index'

/**
 * Hook that provides cache invalidation utilities for Figma variables.
 *
 * @remarks
 * Returns functions to invalidate and revalidate SWR cache for variables hooks.
 * Use this after mutations to ensure fresh data is fetched.
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
  const { fileKey, providerId } = useFigmaTokenContext()

  /**
   * Invalidates all variable-related SWR cache entries.
   * This will cause all variable hooks to refetch on next access.
   */
  const invalidate = () => {
    if (!fileKey) return

    // Invalidate local variables
    const localKey = [
      `https://api.figma.com/v1/files/${fileKey}/variables/local`,
      'token-placeholder',
    ] as const
    mutate(localKey)

    // Invalidate published variables
    const publishedKey = [
      FIGMA_PUBLISHED_VARIABLES_PATH(fileKey),
      'token-placeholder',
    ] as const
    mutate(publishedKey)

    // Invalidate fallback cache if exists
    if (providerId) {
      const fallbackKey = [`fallback-${providerId}`, 'fallback'] as const
      mutate(fallbackKey)
    }
  }

  /**
   * Revalidates all variable-related SWR cache entries immediately.
   * This will trigger immediate refetch of all variable hooks.
   */
  const revalidate = () => {
    if (!fileKey) return

    // Revalidate local variables
    const localKey = [
      `https://api.figma.com/v1/files/${fileKey}/variables/local`,
      'token-placeholder',
    ] as const
    mutate(localKey, undefined, { revalidate: true })

    // Revalidate published variables
    const publishedKey = [
      FIGMA_PUBLISHED_VARIABLES_PATH(fileKey),
      'token-placeholder',
    ] as const
    mutate(publishedKey, undefined, { revalidate: true })

    // Revalidate fallback cache if exists
    if (providerId) {
      const fallbackKey = [`fallback-${providerId}`, 'fallback'] as const
      mutate(fallbackKey, undefined, { revalidate: true })
    }
  }

  return {
    invalidate,
    revalidate,
  }
}
