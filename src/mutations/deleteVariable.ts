import { useState, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type { VariableActionResponse } from 'types/mutations'

async function deleteFigmaVariable(
  token: string,
  variableId: string
): Promise<Omit<VariableActionResponse, 'variable'>> {
  const url = `https://api.figma.com/v1/variables/${variableId}`
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-FIGMA-TOKEN': token,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        error: true,
        status: response.status,
        message: errorData.message || 'Failed to delete Figma variable',
      }
    }

    return {
      error: false,
      status: response.status,
    }
  } catch (error) {
    return {
      error: true,
      status: 500,
      message:
        error instanceof Error ? error.message : 'An unknown error occurred',
    }
  }
}

export const useDeleteVariable = () => {
  const token = useFigmaToken()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Omit<
    VariableActionResponse,
    'variable'
  > | null>(null)

  const deleteVariable = useCallback(
    async (variableId: string) => {
      if (!token) {
        setError('Figma API token is not provided.')
        return
      }

      setLoading(true)
      setError(null)
      const result = await deleteFigmaVariable(token, variableId)
      setData(result)
      if (result.error) {
        setError(result.message || 'An error occurred.')
      }
      setLoading(false)
    },
    [token]
  )

  return { deleteVariable, loading, error, data }
}
