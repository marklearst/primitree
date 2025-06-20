import type { CreateVariablePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  CONTENT_TYPE_JSON,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_CREATE_VARIABLE_FAILED,
} from '../constants'

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
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const response = await fetch(FIGMA_POST_VARIABLES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': CONTENT_TYPE_JSON,
      [FIGMA_TOKEN_HEADER]: token,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || ERROR_MSG_CREATE_VARIABLE_FAILED)
  }

  return response.json()
}
