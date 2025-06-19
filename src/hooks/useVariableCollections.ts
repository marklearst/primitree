import { useState, useEffect, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type { FigmaCollection, LocalVariablesResponse } from 'types'

interface UseVariableCollectionsReturn {
  collections: FigmaCollection[] | null
  collectionsById: Record<string, FigmaCollection> | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Fetches local Figma variable collections for a given file ID.
 * @param fileId - The Figma file ID to fetch collections from.
 */
const useVariableCollections = (
  fileId: string
): UseVariableCollectionsReturn => {
  const [collectionsById, setCollectionsById] = useState<Record<
    string,
    FigmaCollection
  > | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const token = useFigmaToken()

  const fetchCollections = useCallback(async () => {
    if (!token) {
      setError(new Error('Figma API token is not provided.'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      const url = `https://api.figma.com/v1/files/${fileId}/variables/local`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-FIGMA-TOKEN': token,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Figma collections: ${response.status} ${response.statusText}`
        )
      }

      const json: LocalVariablesResponse = await response.json()
      if (json.meta) {
        setCollectionsById(json.meta.variableCollections)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching collections')
      )
    } finally {
      setLoading(false)
    }
  }, [fileId, token])

  const refresh = useCallback(() => {
    fetchCollections()
  }, [fetchCollections])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  const collections = collectionsById ? Object.values(collectionsById) : null

  return { collections, collectionsById, loading, error, refresh }
}

export default useVariableCollections
