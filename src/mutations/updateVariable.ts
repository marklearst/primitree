import type { UpdateVariablePayload } from 'types/mutations'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  CONTENT_TYPE_JSON,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_UPDATE_VARIABLE_FAILED,
} from '../constants'

/**
 * Updates an existing variable in a Figma file.
 *
 * This function sends a PUT request to the Figma API to modify a single variable.
 * It requires a valid Figma token with `file_variables:write` scope.
 *
 * @param token - The Figma Personal Access Token.
 * @param variableId - The ID of the variable to update.
 * @param payload - The data to update for the variable.
 * @returns A promise that resolves when the variable has been successfully updated. The Figma API returns no content on a successful PUT.
 * @throws Will throw an error if the fetch call fails or if the API returns an error response.
 *
 * @example
 * ```ts
 * const updatedData = {
 *   name: "new-color-name",
 *   description: "An updated description"
 * };
 *
 * updateVariable("your-figma-token", "VariableID:1:1", updatedData)
 *   .then(() => console.log("Variable updated successfully"))
 *   .catch(error => console.error(error));
 * ```
 */
export const updateVariable = async (
  token: string,
  variableId: string,
  payload: UpdateVariablePayload
) => {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const url = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': CONTENT_TYPE_JSON,
      [FIGMA_TOKEN_HEADER]: token,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || ERROR_MSG_UPDATE_VARIABLE_FAILED)
  }

  // A successful PUT request to this endpoint returns a 204 No Content,
  // so there is no JSON body to parse.
  return
}
