import useSWR from 'swr'
import { fetcher } from 'api/fetcher'
import type { PublishedVariablesResponse } from 'types/figma'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { getPublishedVariablesKey } from 'utils/swrKeys'

/**
 * Hook to fetch published Figma Variables from a file.
 *
 * @remarks
 * This hook fetches variables that have been published to a library in Figma.
 * Published variables are shared across files and represent the "source of truth"
 * for design tokens in a design system. Use this hook when you need to access
 * variables that are consumed from a library, rather than local file variables.
 *
 * **When to use:**
 * - Fetching design tokens from a published library
 * - Building design system dashboards that track published tokens
 * - Monitoring changes to shared variables across a design system
 * - Validating consistency between published and local variables
 *
 * **Rate Limiting:**
 * The Figma API has rate limits. Published variables are typically more stable
 * than local variables, so they can be cached longer. SWR handles caching and
 * revalidation automatically, but be mindful of frequent refetches in production.
 *
 * @returns SWR response object with `data`, `error`, `isLoading`, and `isValidating`.
 *
 * @public
 *
 * @example
 * ```tsx
 * import { usePublishedVariables } from '@figma-vars/hooks';
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
  const {
    token,
    fileKey,
    fallbackFile,
    parsedFallbackFile,
    providerId,
    swrConfig,
  } = useFigmaTokenContext()

  const hasFallback = Boolean(fallbackFile || parsedFallbackFile)

  const key = getPublishedVariablesKey({
    fileKey,
    token,
    providerId,
    hasFallback,
  })

  const swrResponse = useSWR<PublishedVariablesResponse>(
    key,
    async (...args: [readonly [string, string]] | [string, string]) => {
      // Use pre-parsed fallback file from provider (handles both string and object fallbackFile)
      if (parsedFallbackFile) {
        return parsedFallbackFile as PublishedVariablesResponse
      }

      // Legacy support: if fallbackFile is an object but parsedFallbackFile wasn't set
      // This can happen if the provider didn't validate the structure correctly
      if (fallbackFile && typeof fallbackFile === 'object') {
        return fallbackFile as PublishedVariablesResponse
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
