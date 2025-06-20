import useSWR from 'swr'
import useFigmaToken from 'hooks/useFigmaToken'
import { fetchWithAuth } from 'utils/fetchHelpers'
import type { LocalVariablesResponse, FigmaCollection } from 'types'
import { FIGMA_VARIABLES_ENDPOINT } from 'constants'

/**
 * A hook to fetch all variable collections for a given file.
 * @param fileKey - The key of the Figma file to fetch collections from.
 * @returns An object containing the variable collections, loading state, and any errors.
 */
export const useVariableCollections = (fileKey: string) => {
  const token = useFigmaToken()
  const { data, error, isLoading, isValidating } =
    useSWR<LocalVariablesResponse>(
      token ? FIGMA_VARIABLES_ENDPOINT(fileKey) : null,
      fetchWithAuth
    )

  const collections: FigmaCollection[] = data?.meta
    ? Object.values(data.meta.variableCollections)
    : []
  const collectionsById: Record<string, FigmaCollection> = data?.meta
    ? data.meta.variableCollections
    : {}

  return {
    collections,
    collectionsById,
    isLoading,
    isValidating,
    error:
      error ??
      (data && 'message' in data ? new Error((data as any).message) : null),
  }
}
