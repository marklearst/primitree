import type { BulkUpdatePayload } from 'types/mutations'
import {
  FIGMA_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from '../constants'
import { mutator } from '../api/mutator'

/**
 * Performs a bulk update of variables in a Figma file.
 * This endpoint can be used to create, update, or delete multiple variables in a single API call.
 *
 * @param token - The Figma Personal Access Token.
 * @param fileKey - The key of the Figma file where the variables reside.
 * @param payload - The bulk update payload, containing arrays of variables to create, update, and/or delete.
 * @returns A promise that resolves with the metadata from the Figma API about the bulk operation.
 * @throws Will throw an error if the fetch call fails or if the API returns an error response.
 *
 * @example
 * ```ts
 * const payload = {
 *   create: [{ name: "new-var", variableCollectionId: "VC:1:1", resolvedType: "FLOAT" }],
 *   update: [{ id: "VariableID:123:456", name: "updated-name" }],
 *   delete: ["VariableID:789:101"]
 * };
 *
 * bulkUpdateVariables("your-token", "your-file-key", payload)
 *   .then(response => console.log("Bulk update successful:", response))
 *   .catch(error => console.error(error));
 * ```
 */
export const bulkUpdateVariables = async (
  token: string,
  fileKey: string,
  payload: BulkUpdatePayload
) => {
  if (!token || !fileKey) {
    throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
  }

  const url = FIGMA_VARIABLES_ENDPOINT(fileKey)
  return await mutator(
    url,
    token,
    'POST',
    payload as unknown as Record<string, unknown>
  )
}
