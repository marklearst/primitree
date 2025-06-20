import type { CreateVariablePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../constants'
import { mutator } from '../api/mutator'

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

  return await mutator(
    FIGMA_POST_VARIABLES_ENDPOINT,
    token,
    'POST',
    payload as unknown as Record<string, unknown>
  )
}
