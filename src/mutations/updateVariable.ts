import { useState, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type {
  UpdateVariablePayload,
  VariableActionResponse,
} from 'types/mutations'

async function updateFigmaVariable(
  token: string,
  variableId: string,
  payload: UpdateVariablePayload
): Promise<VariableActionResponse> {
  const url = `https://api.figma.com/v1/variables/${variableId}`
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-FIGMA-TOKEN': token,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        error: true,
        status: response.status,
        message: errorData.message || 'Failed to update Figma variable',
      }
    }

    // On successful PUT, Figma API returns a 204 No Content, so no JSON body to parse
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

export const useUpdateVariable = () => {
  const token = useFigmaToken()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VariableActionResponse | null>(null)

  const updateVariable = useCallback(
    async (variableId: string, payload: UpdateVariablePayload) => {
      if (!token) {
        setError('Figma API token is not provided.')
        return
      }

      setLoading(true)
      setError(null)
      const result = await updateFigmaVariable(token, variableId, payload)
      setData(result)
      if (result.error) {
        setError(result.message || 'An error occurred.')
      }
      setLoading(false)
    },
    [token]
  )

  return { updateVariable, loading, error, data }
}
