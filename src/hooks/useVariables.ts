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
  const { token, fileKey, fallbackFile } = useFigmaTokenContext()

  // Create a custom fetcher that handles fallbackFile
  const customFetcher = async (
    url: string,
    token: string
  ): Promise<LocalVariablesResponse> => {
    if (fallbackFile) {
      return typeof fallbackFile === 'string'
        ? (JSON.parse(fallbackFile) as LocalVariablesResponse)
        : (fallbackFile as LocalVariablesResponse)
    }
    return fetcher<LocalVariablesResponse>(url, token)
  }

  // If fallbackFile is provided, we can use it even without token/fileKey
  const url =
    token && fileKey
      ? `https://api.figma.com/v1/files/${fileKey}/variables/local`
      : null
  const swrResponse = useSWR<LocalVariablesResponse>(
    (url && token) || fallbackFile
      ? ([url || 'fallback', token || 'fallback'] as const)
      : null,
    (url && token) || fallbackFile
      ? ([u, t]: readonly [string, string]) => customFetcher(u, t)
      : () => Promise.resolve(undefined as unknown as LocalVariablesResponse)
  )

  return swrResponse
}
