import type { CreateVariablePayload } from 'types/mutations'

/**
 * Creates a new variable in a Figma file.
 *
 * This function sends a POST request to the Figma API to create a new variable.
 * It requires a valid Figma token with `file_variables:write` scope.
 *
 * @param token - The Figma Personal Access Token.
 * @param payload - The data for the new variable, including its name, collection ID, and type.
 * @returns A promise that resolves with the created variable data from the Figma API.
 * @throws Will throw an error if the fetch call fails or if the API returns an error response.
 *
 * @example
 * ```ts
 * const newVariableData = {
 *   name: "new-color",
 *   variableCollectionId: "VariableCollectionId:1:1",
 *   resolvedType: "COLOR"
 * };
 *
 * createVariable("your-figma-token", newVariableData)
 *   .then(result => console.log("Variable created:", result))
 *   .catch(error => console.error(error));
 * ```
 */
export const createVariable = async (
  token: string,
  payload: CreateVariablePayload
) => {
  if (!token) {
    throw new Error('A Figma API token is required.')
  }

  const response = await fetch('https://api.figma.com/v1/variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FIGMA-TOKEN': token,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || 'Failed to create Figma variable.')
  }

  return response.json()
}
