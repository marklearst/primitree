import { useState, useEffect, useRef, useCallback } from 'react'
import useFigmaToken from './useFigmaToken'
import type { FigmaVariable, VariablesResponse } from '../types'

// For NodeJS.Timeout type in browser code, just use number
type Timeout = ReturnType<typeof setTimeout>

/**
 * Fetches Figma variables for a given document (file) ID.
 * Supports polling and manual refresh.
 * @param documentId - The Figma file ID
 * @param options - { pollInterval?: number }
 */
const useVariables = (
  documentId: string,
  options?: { pollInterval?: number }
) => {
  const [variables, setVariables] = useState<FigmaVariable[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const token = useFigmaToken()
  const pollRef = useRef<Timeout | null>(null)

  const fetchVariables = useCallback(async () => {
    if (!token) {
      setError(new Error('API token is not provided'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      const url = `https://api.figma.com/v1/files/${documentId}/variables`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-FIGMA-TOKEN': token,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Figma variables: ${response.statusText}`
        )
      }

      const json: VariablesResponse = await response.json()
      setVariables(json.meta.variables) // Adjust if shape is different
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch variables')
      )
    } finally {
      setLoading(false)
    }
  }, [documentId, token])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchVariables, options?.pollInterval])

  return { variables, loading, error, refresh }
}

export default useVariables
