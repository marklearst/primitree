import { useState, useEffect } from 'react'
import useFigmaToken from './useFigmaToken'
import type { FigmaCollection, HookState } from '../types'

const useVariableCollections = (
  fileKey: string
): HookState<FigmaCollection[]> => {
  const [state, setState] = useState<HookState<FigmaCollection[]>>({
    data: null,
    loading: true,
    error: null,
  })
  const token = useFigmaToken()

  useEffect(() => {
    const fetchCollections = async () => {
      if (!token) {
        setState((s) => ({
          ...s,
          loading: false,
          error: new Error('API token is not provided'),
        }))
        return
      }
      const url = `https://api.figma.com/v1/files/${fileKey}/variable_collections`
      try {
        const response = await fetch(url, {
          headers: {
            'X-FIGMA-TOKEN': token,
          },
        })
        if (!response.ok)
          throw new Error(
            `Failed to fetch Figma collections: ${response.statusText}`
          )
        const data = await response.json()
        setState({
          data: data.meta.variableCollections,
          loading: false,
          error: null,
        })
      } catch (error) {
        setState((s) => ({
          ...s,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to fetch'),
        }))
      }
    }
    fetchCollections()
  }, [fileKey, token])

  return state
}

export default useVariableCollections
