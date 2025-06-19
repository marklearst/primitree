import useFigmaToken from '../hooks/useFigmaToken'
import type { FigmaOperationResponse } from '../types'

/**
 * Delete a Figma variable from a file.
 * @param fileKey The Figma file ID
 * @param variableId The variable ID
 * @returns Promise<FigmaOperationResponse>
 */
export async function deleteVariable(
  fileKey: string,
  variableId: string
): Promise<FigmaOperationResponse> {
  const token = useFigmaToken()
  if (!token) throw new Error('API token is not provided')

  const url = `https://api.figma.com/v1/files/${fileKey}/variables/${variableId}`
  const result = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-FIGMA-TOKEN': token,
    },
  })

  if (!result.ok) {
    throw new Error('Failed to delete Figma variable')
  }

  return result.json()
}
