import useSWR from 'swr'
import { useFigmaTokenContext } from '../contexts/FigmaVarsProvider'
import { fetcher } from '../api/fetcher'
import type { LocalVariablesResponse } from '../types'
import { FIGMA_LOCAL_VARIABLES_ENDPOINT } from '../constants'

/**
 * Fetches all local variables, collections, and modes for the file specified in the `FigmaVarsProvider`.
 * This is the primary data-fetching hook and serves as the foundation for other hooks like `useVariableCollections` and `useVariableModes`.
 *
 * "Local variables" are all variables and collections defined in the current file.
 *
 * It uses `swr` for efficient data fetching, caching, and revalidation.
 *
 * @returns {object} The response from `useSWR` for the local variables endpoint.
 * @property {LocalVariablesResponse} data - The raw API response from Figma.
 * @property {boolean} isLoading - True if the request is in flight.
 * @property {boolean} isValidating - True if the data is being revalidated.
 * @property {Error} error - Any error that occurred during fetching.
 *
 * @see https://www.figma.com/developers/api#get-local-variables-v1
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useVariables();
 *
 * if (isLoading) return <div>Loading variables...</div>;
 * if (error) return <div>Error fetching variables: {error.message}</div>;
 *
 * const collections = data ? Object.values(data.meta.variableCollections) : [];
 * console.log(collections);
 * ```
 */
export const useVariables = () => {
  const { token, fileKey } = useFigmaTokenContext()

  const endpoint = fileKey ? FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey) : null

  const { data, error, isLoading, isValidating } =
    useSWR<LocalVariablesResponse>(
      token && endpoint ? [endpoint, token] : null,
      fetcher
    )

  return {
    data,
    isLoading,
    isValidating,
    error,
  }
}
