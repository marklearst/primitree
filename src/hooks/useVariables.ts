import { useState, useEffect, useRef, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type { FigmaVariable, LocalVariablesResponse } from 'types'

// For NodeJS.Timeout type in browser code, just use number
type Timeout = ReturnType<typeof setTimeout>

interface UseVariablesReturn {
  variables: FigmaVariable[] | null
  variablesById: Record<string, FigmaVariable> | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Fetches local Figma variables for a given file ID.
 * Supports polling and manual refresh.
 * @param fileId - The Figma file ID to fetch variables from.
 * @param options - { pollInterval?: number }
 */
const useVariables = (
  fileId: string,
  options?: { pollInterval?: number }
): UseVariablesReturn => {
  const [variablesById, setVariablesById] = useState<Record<
    string,
    FigmaVariable
  > | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const token = useFigmaToken()
  const pollRef = useRef<Timeout | null>(null)

  const fetchVariables = useCallback(async () => {
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
          `Failed to fetch Figma variables: ${response.status} ${response.statusText}`
        )
      }

      const json: LocalVariablesResponse = await response.json()
      if (json.meta) {
        setVariablesById(json.meta.variables)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching variables')
      )
    } finally {
      setLoading(false)
    }
  }, [fileId, token])

  // Manual refresh
  const refresh = useCallback(() => {
    fetchVariables()
  }, [fetchVariables])

  // Initial fetch & polling
  useEffect(() => {
    fetchVariables()

    if (options?.pollInterval) {
      pollRef.current = setInterval(fetchVariables, options.pollInterval)
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
  }, [fetchVariables, options?.pollInterval])

  const variables = variablesById ? Object.values(variablesById) : null

  return { variables, variablesById, loading, error, refresh }
}

export default useVariables
