import type { BulkUpdatePayload } from 'types/mutations'

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
    throw new Error('A Figma API token and file key are required.')
  }

  const url = `https://api.figma.com/v1/files/${fileKey}/variables`
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
    throw new Error(responseData.message || 'Failed to perform bulk update.')
  }

  return responseData
}
