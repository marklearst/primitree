import useSWR from 'swr'
import { fetcher } from '@primitree/core'
import type { PublishedVariablesResponse } from '@primitree/core'
import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { getPublishedVariablesKey } from '../utils/swrKeys'

/**
 * Read published Figma variables for the provider's file.
 *
 * @remarks
 * The hook reads validated published fallback data without a request. Without
 * that fallback, SWR fetches the published variables endpoint when the
 * provider has a file key and token.
 *
 * @returns SWR response object with `data`, `error`, `isLoading`, and `isValidating`.
 *
 * @public
 *
 * @example
 * ```tsx
 * import { usePublishedVariables } from '@primitree/hooks';
 *
 * function LibraryTokens() {
 *   const { data, isLoading, error } = usePublishedVariables();
 *
 *   if (isLoading) return <div>Loading published variables...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   const variables = Object.values(data?.meta.variables ?? {});
 *   return <ul>{variables.map(v => <li key={v.id}>{v.name}</li>)}</ul>;
 * }
 * ```
 */
export const usePublishedVariables = () => {
  const { token, fileKey, validatedFallback, providerId, swrConfig } =
    useFigmaTokenContext()

  const publishedFallback =
    validatedFallback?.kind === 'published' ? validatedFallback.data : undefined
  const hasFallback = Boolean(publishedFallback)

  const key = getPublishedVariablesKey({
    fileKey,
    token,
    providerId,
    hasFallback,
  })

  const swrResponse = useSWR<PublishedVariablesResponse>(
    key,
    async (...args: [readonly [string, string]] | [string, string]) => {
      // Use only validated published fallback data for this endpoint.
      if (publishedFallback) {
        return publishedFallback
      }

      const [u, t] = Array.isArray(args[0])
        ? args[0]
        : ([args[0], args[1]] as const)

      if (!u || !t) {
        throw new Error('Missing URL or token for live API request')
      }

      return fetcher<PublishedVariablesResponse>(u, t)
    },
    swrConfig
  )

  return swrResponse
}
