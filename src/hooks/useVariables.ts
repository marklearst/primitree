import useSWR from 'swr'
import { useFigmaTokenContext } from 'contexts/FigmaTokenContext'
import { fetcher } from 'api/fetcher'
import type { LocalVariablesResponse } from 'types'
import { FIGMA_LOCAL_VARIABLES_ENDPOINT } from '../constants'

/**
 * The primary hook for fetching all local variables, collections, and modes for the file specified in the `FigmaVarsProvider`.
 * This hook serves as the foundation for other data hooks like `useVariableCollections` and `useVariableModes`.
 *
 * It uses `swr` for efficient data fetching, caching, and revalidation.
 *
 * @returns An object containing the raw API response (`data`), loading state (`isLoading`), validation state (`isValidating`), and any errors (`error`).
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useVariables();
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 *
 * const collections = Object.values(data?.meta.variableCollections ?? {});
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
