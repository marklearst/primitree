import useSWR from 'swr'
import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { fetcher } from 'api/fetcher'
import type { LocalVariablesResponse } from 'types'
import { FIGMA_LOCAL_VARIABLES_ENDPOINT } from 'constants/index'

/**
 * React hook that fetches all local variables, collections, and modes for the current Figma file via the Variables API.
 *
 * @remarks
 * Returns an object with SWR state for the Figma local variables endpoint, including:
 * - `data`: the variables response object (or undefined)
 * - `isLoading`: boolean loading state
 * - `isValidating`: boolean validation state
 * - `error`: error object (if any)
 *
 * Use this as the single source of truth for all variables, collections, and modes within the current file context.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useVariables } from '@figma-vars/hooks';
 *
 * function VariablesPanel() {
 *   const { data, isLoading, error } = useVariables();
 *   if (isLoading) return <span>Loading variables…</span>;
 *   if (error) return <span style={{ color: 'red' }}>Error: {error.message}</span>;
 *   if (!data) return <span>No variables found.</span>;
 *   return <pre>{JSON.stringify(data, null, 2)}</pre>;
 * }
 * ```
 *
 * @public
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
