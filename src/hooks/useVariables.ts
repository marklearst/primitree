import useSWR from 'swr'
import { fetcher } from 'api/fetcher'
import type { LocalVariablesResponse } from 'types/figma'
import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'

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
  const { token, fileKey, fallbackFile, providerId, swrConfig } =
    useFigmaTokenContext()

  const url = fileKey
    ? `https://api.figma.com/v1/files/${fileKey}/variables/local`
    : null

  const hasLive = Boolean(token && url)
  const hasFallback = Boolean(fallbackFile)

  const key = hasLive
    ? ([url as string, token as string] as const)
    : hasFallback
      ? ([`fallback-${providerId ?? 'default'}`, 'fallback'] as const)
      : null

  const swrResponse = useSWR<LocalVariablesResponse>(
    key,
    async (...args: [readonly [string, string]] | [string, string]) => {
      const [u, t] = Array.isArray(args[0])
        ? args[0]
        : ([args[0], args[1]] as const)

      if (fallbackFile) {
        return typeof fallbackFile === 'string'
          ? (JSON.parse(fallbackFile) as LocalVariablesResponse)
          : (fallbackFile as LocalVariablesResponse)
      }

      // At this point we expect live credentials; guard just in case
      if (!u || !t) {
        throw new Error('Missing URL or token for live API request')
      }

      return fetcher<LocalVariablesResponse>(u, t)
    },
    swrConfig
  )

  return swrResponse
}
