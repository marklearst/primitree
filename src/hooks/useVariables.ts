import useSWR from 'swr'
import { fetcher } from 'api/fetcher'
import type { LocalVariablesResponse } from 'types/figma'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { getVariablesKey } from 'utils/swrKeys'

/**
 * Hook to fetch and manage Figma Variables, including collections and modes.
 *
 * @remarks
 * This hook uses SWR for caching and revalidation. It fetches the variables for the
 * file key provided via the FigmaVarsProvider context. If a fallbackFile is provided,
 * it will use that instead of making an API request, which is useful for users without
 * Figma Enterprise accounts or for offline development.
 *
 * @returns SWR response object with `data`, `error`, `isLoading`, and `isValidating`.
 *
 * @public
 */
export const useVariables = () => {
  const {
    token,
    fileKey,
    fallbackFile,
    parsedFallbackFile,
    providerId,
    swrConfig,
  } = useFigmaTokenContext()

  const hasFallback = Boolean(fallbackFile || parsedFallbackFile)

  const key = getVariablesKey({
    fileKey,
    token,
    providerId,
    hasFallback,
  })

  const swrResponse = useSWR<LocalVariablesResponse>(
    key,
    async (...args: [readonly [string, string]] | [string, string]) => {
      // Use pre-parsed fallback file from provider (handles both string and object fallbackFile)
      if (parsedFallbackFile) {
        return parsedFallbackFile as LocalVariablesResponse
      }

      // Legacy support: if fallbackFile is an object but parsedFallbackFile wasn't set
      // This can happen if the provider didn't validate the structure correctly
      if (fallbackFile && typeof fallbackFile === 'object') {
        return fallbackFile as LocalVariablesResponse
      }

      // At this point we expect live credentials; guard just in case
      const [u, t] = Array.isArray(args[0])
        ? args[0]
        : ([args[0], args[1]] as const)

      if (!u || !t) {
        throw new Error('Missing URL or token for live API request')
      }

      return fetcher<LocalVariablesResponse>(u, t)
    },
    swrConfig
  )

  return swrResponse
}
