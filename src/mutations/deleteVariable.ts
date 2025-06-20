/**
 * Deletes a variable from a Figma file.
 *
 * This function sends a DELETE request to the Figma API to remove a single variable.
 * It requires a valid Figma token with `file_variables:write` scope.
 *
 * @param token - The Figma Personal Access Token.
 * @param variableId - The ID of the variable to delete.
 * @returns A promise that resolves when the variable has been successfully deleted. The Figma API returns no content on a successful DELETE.
 * @throws Will throw an error if the fetch call fails or if the API returns an error response.
 *
 * @example
 * ```ts
 * deleteVariable("your-figma-token", "VariableID:1:1")
 *   .then(() => console.log("Variable deleted successfully"))
 *   .catch(error => console.error(error));
 * ```
 */
export const deleteVariable = async (token: string, variableId: string) => {
  if (!token) {
    throw new Error('A Figma API token is required.')
  }

  const url = `https://api.figma.com/v1/variables/${variableId}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-FIGMA-TOKEN': token,
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || 'Failed to delete Figma variable.')
  }

  // A successful DELETE request to this endpoint returns a 204 No Content,
  // so there is no JSON body to parse.
  return
}
