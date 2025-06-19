import { useState, useCallback } from 'react'
import useFigmaToken from 'hooks/useFigmaToken'
import type { BulkUpdatePayload, BulkUpdateResponse } from 'types/mutations'

async function bulkUpdateFigmaVariables(
  token: string,
  fileKey: string,
  payload: BulkUpdatePayload
): Promise<BulkUpdateResponse> {
  const url = `https://api.figma.com/v1/files/${fileKey}/variables`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FIGMA-TOKEN': token,
      },
      body: JSON.stringify(payload),
    })

    const responseData = await response.json()

    if (!response.ok) {
      return {
        error: true,
        status: response.status,
        message: responseData.message || 'Failed to perform bulk update.',
      }
    }

    return {
      error: false,
      status: response.status,
      meta: responseData.meta,
    }
  } catch (error) {
    return {
      error: true,
      status: 500,
      message:
        error instanceof Error ? error.message : 'An unknown error occurred.',
    }
  }
}

export const useBulkUpdateVariables = () => {
  const token = useFigmaToken()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BulkUpdateResponse | null>(null)

  const bulkUpdate = useCallback(
    async (fileKey: string, payload: BulkUpdatePayload) => {
      if (!token) {
        setError('Figma API token is not provided.')
        return
      }

      setLoading(true)
      setError(null)
      const result = await bulkUpdateFigmaVariables(token, fileKey, payload)
      setData(result)
      if (result.error) {
        setError(result.message || 'An error occurred during the bulk update.')
      }
      setLoading(false)
    },
    [token]
  )

  return { bulkUpdate, loading, error, data }
}
