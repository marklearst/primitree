import useSWR from 'swr'
import { fetcher } from 'api/fetcher'
import type { PublishedVariablesResponse } from 'types/figma'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { FIGMA_PUBLISHED_VARIABLES_PATH } from 'constants/index'

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
  const { token, fileKey, fallbackFile } = useFigmaTokenContext()

  // Create a custom fetcher that handles fallbackFile
  const customFetcher = async (
    url: string,
    token: string
  ): Promise<PublishedVariablesResponse> => {
    if (fallbackFile) {
      if (typeof fallbackFile === 'string') {
        return JSON.parse(fallbackFile) as PublishedVariablesResponse
      }
      return fallbackFile as unknown as PublishedVariablesResponse
    }
    return fetcher<PublishedVariablesResponse>(url, token)
  }

  // Use the published variables endpoint instead of local
  const url = token && fileKey ? FIGMA_PUBLISHED_VARIABLES_PATH(fileKey) : null
  const swrResponse = useSWR<PublishedVariablesResponse>(
    (url && token) || fallbackFile
      ? ([url || 'fallback', token || 'fallback'] as const)
      : null,
    (url && token) || fallbackFile
      ? ([u, t]: readonly [string, string]) => customFetcher(u, t)
      : () =>
          Promise.resolve(undefined as unknown as PublishedVariablesResponse)
  )

  return swrResponse
}
