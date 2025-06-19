import useFigmaAuth from '../hooks/useFigmaAuth';
import { FigmaOperationResponse } from '../hooks/types';

/**
 * Create a new Figma variable in a file.
 * @param fileKey The Figma file ID
 * @param variableData The variable data (see Figma Variables API)
 * @returns Promise<FigmaOperationResponse>
 */
export async function createVariable(
  fileKey: string,
  variableData: any // TODO: Replace 'any' with a proper type if available
): Promise<FigmaOperationResponse> {
  // Get token (can be refactored to pass as arg if needed)
  const token = useFigmaAuth();
  if (!token) throw new Error('API token is not provided');

  const url = `https://api.figma.com/v1/files/${fileKey}/variables`;
  const result = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FIGMA-TOKEN': token,
    },
    body: JSON.stringify(variableData),
  });

  if (!result.ok) {
    throw new Error('Failed to create Figma variable');
  }

  return result.json();
}
