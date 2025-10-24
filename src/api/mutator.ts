import {
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from 'constants/index'

type HttpMethod = 'POST' | 'PUT' | 'DELETE'

/**
 * Low-level utility to send authenticated POST, PUT, or DELETE requests to the Figma Variables REST API.
 *
 * @remarks
 * This function performs authenticated HTTP mutations (POST, PUT, DELETE) against the specified Figma API endpoint.
 * It handles JSON serialization of the request body, parses JSON responses, and propagates detailed errors.
 * Intended primarily for internal use by mutation hooks, but also suitable for direct custom API mutations.
 *
 * @typeParam T - The expected response type returned from the Figma API.
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) used for authentication.
 * @param method - The HTTP method for the mutation: 'POST', 'PUT', or 'DELETE'.
 * @param body - Optional request payload sent as a JSON string.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws an Error if the token is not provided.
 * @throws Throws an Error if the HTTP response is unsuccessful, including the error message from the API or a default message.
 *
 * @example
 * ```ts
 * import { mutator } from '@figma-vars/hooks/api';
 *
 * async function updateVariable(fileKey: string, token: string, variableId: string) {
 *   const url = `https://api.figma.com/v1/files/${fileKey}/variables/${variableId}`;
 *   const payload = { name: 'Updated Name' };
 *   const result = await mutator(url, token, 'PUT', payload);
 *   return result;
 * }
 * ```
 */
export const mutator = async <T>(
  url: string,
  token: string,
  method: HttpMethod,
  body?: Record<string, unknown>
): Promise<T> => {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const response = await fetch(url, {
    method,
    headers: {
      [FIGMA_TOKEN_HEADER]: token,
      'Content-Type': CONTENT_TYPE_JSON,
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const message =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : ERROR_MSG_FETCH_FIGMA_DATA_FAILED
    throw new Error(message)
  }

  // 204 No Content response - resolve with undefined
  if (response.status === 204) {
    return Promise.resolve(undefined as T)
  }

  return response.json()
}
