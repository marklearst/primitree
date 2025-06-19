import { useState, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type {
  CreateVariablePayload,
  VariableActionResponse,
} from 'types/mutations'

async function createFigmaVariable(
  token: string,
  payload: CreateVariablePayload
): Promise<VariableActionResponse> {
  const url = `https://api.figma.com/v1/variables`
  try {
    const response = await fetch(url, {
      method: 'POST',
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
        message: errorData.message || 'Failed to create Figma variable',
      }
    }

    const result = await response.json()
    return {
      error: false,
      status: response.status,
      variable: result,
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

export const useCreateVariable = () => {
  const token = useFigmaToken()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VariableActionResponse | null>(null)

  const createVariable = useCallback(
    async (payload: CreateVariablePayload) => {
      if (!token) {
        setError('Figma API token is not provided.')
        return
      }

      setLoading(true)
      setError(null)
      const result = await createFigmaVariable(token, payload)
      setData(result)
      if (result.error) {
        setError(result.message || 'An error occurred.')
      }
      setLoading(false)
    },
    [token]
  )

  return { createVariable, loading, error, data }
}
