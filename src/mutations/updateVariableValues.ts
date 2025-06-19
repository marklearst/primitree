import useFigmaToken from '../hooks/useFigmaToken';
import { FigmaOperationResponse } from '../hooks/types';

/**
 * Update a variable's value across modes (Figma Variables API).
 * @param variableId The variable ID
 * @param values The new values for each mode
 * @returns Promise<FigmaOperationResponse>
 */
export async function updateVariableValues(
  variableId: string,
  values: any // TODO: Replace 'any' with a proper type if available
): Promise<FigmaOperationResponse> {
  const token = useFigmaToken();
  if (!token) throw new Error('API token is not provided');

  const url = `https://api.figma.com/v1/variables/${variableId}/values`;
  const result = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-FIGMA-TOKEN': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(values),
  });

  if (!result.ok) {
    throw new Error('Failed to update variable values');
  }

  return result.json();
}
