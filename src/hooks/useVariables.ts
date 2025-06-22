import useSWR from 'swr'
import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { fetcher } from 'api/fetcher'
import type { LocalVariablesResponse } from 'types'
import { FIGMA_LOCAL_VARIABLES_ENDPOINT } from 'constants/index'

/**
 * Fetches all local variables, collections, and modes for the file specified in the `FigmaVarsProvider`.
 * This is the primary data-fetching hook and serves as the foundation for other hooks like `useVariableCollections` and `useVariableModes`.
 *
 * "Local variables" are all variables and collections defined in the current file.
 *
 * It uses `swr` for efficient data fetching, caching, and revalidation.
 *
 * @returns {{data: LocalVariablesResponse | undefined, isLoading: boolean, isValidating: boolean, error: Error | undefined}} The response from `useSWR` for the local variables endpoint.
 * @see {@link https://www.figma.com/developers/api#get-local-variables-v1|Figma Variables API Documentation}
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
