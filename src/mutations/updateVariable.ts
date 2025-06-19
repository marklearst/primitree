import useFigmaAuth from '../hooks/useFigmaAuth';
import { FigmaOperationResponse } from '../hooks/types';

/**
 * Update an existing Figma variable in a file.
 * @param fileKey The Figma file ID
 * @param variableId The variable ID
 * @param newVariableData The new variable data (see Figma Variables API)
 * @returns Promise<FigmaOperationResponse>
 */
export async function updateVariable(
  fileKey: string,
  variableId: string,
  newVariableData: any // TODO: Replace 'any' with a proper type if available
): Promise<FigmaOperationResponse> {
  const token = useFigmaAuth();
  if (!token) throw new Error('API token is not provided');

  const url = `https://api.figma.com/v1/files/${fileKey}/variables/${variableId}`;
  const result = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-FIGMA-TOKEN': token,
    },
    body: JSON.stringify(newVariableData),
  });

  if (!result.ok) {
    throw new Error('Failed to update Figma variable');
  }

  return result.json();
}
