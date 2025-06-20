import useSWR from 'swr'
import useFigmaToken from 'hooks/useFigmaToken'
import { fetchWithAuth } from 'utils/fetchHelpers'
import type { LocalVariablesResponse, FigmaVariable } from 'types'
import { FIGMA_VARIABLES_ENDPOINT } from 'constants'

/**
 * A hook to fetch all local variables for a given file.
 *
 * @param fileKey - The key of the file to fetch variables from.
 * @returns An object containing the variables, loading state, and any errors.
 */
export const useVariables = (fileKey: string) => {
  const token = useFigmaToken()
  const { data, error, isLoading, isValidating } =
    useSWR<LocalVariablesResponse>(
      token ? FIGMA_VARIABLES_ENDPOINT(fileKey) : null,
      fetchWithAuth
    )

  const variables: FigmaVariable[] = data?.meta
    ? Object.values(data.meta.variables)
    : []
  const variablesById: Record<string, FigmaVariable> = data?.meta
    ? data.meta.variables
    : {}

  return {
    variables,
    variablesById,
    isLoading,
    isValidating,
    error:
      error ??
      (data && 'message' in data ? new Error((data as any).message) : null),
  }
}
