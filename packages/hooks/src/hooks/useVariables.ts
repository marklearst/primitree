import useSWR from 'swr'
import { fetcher } from '@figmavars/core'
import type { LocalVariablesResponse } from '@figmavars/core'
import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { getVariablesKey } from '../utils/swrKeys'

/**
 * Read local Figma variables for the provider's file.
 *
 * @remarks
 * A validated local fallback skips the request. Otherwise SWR fetches the
 * local variables endpoint with the provider's file key and token.
 *
 * @returns SWR response object with `data`, `error`, `isLoading`, and `isValidating`.
 *
 * @public
 */
export const useVariables = () => {
  const { token, fileKey, validatedFallback, providerId, swrConfig } =
    useFigmaTokenContext()

  const localFallback =
    validatedFallback?.kind === 'local' ? validatedFallback.data : undefined
  const hasFallback = Boolean(localFallback)

  const key = getVariablesKey({
    fileKey,
    token,
    providerId,
    hasFallback,
  })

  const swrResponse = useSWR<LocalVariablesResponse>(
    key,
    async (...args: [readonly [string, string]] | [string, string]) => {
      // Use only validated local fallback data for this endpoint.
      if (localFallback) {
        return localFallback
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
