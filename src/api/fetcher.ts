// utils/fetchHelpers.ts

import {
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from 'constants/index'

/**
 * Low-level utility to fetch data from the Figma Variables REST API with authentication.
 *
 * @remarks
 * Sends an authenticated HTTP GET request to the given Figma API endpoint using the provided Personal Access Token (PAT).
 * Parses JSON responses and throws detailed errors for failed requests.
 * Intended for internal use by hooks but can be used directly for custom API interactions.
 *
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) for authentication.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws an Error if the token is not provided.
 * @throws Throws an Error if the HTTP response is not ok, including the message returned by the Figma API or a default error message.
 *
 * @example
 * ```ts
 * import { fetcher } from '@figma-vars/hooks/api';
 *
 * async function loadVariables(fileKey: string, token: string) {
 *   const url = `https://api.figma.com/v1/files/${fileKey}/variables`;
 *   const data = await fetcher(url, token);
 *   return data;
 * }
 * ```
 */
export async function fetcher<TResponse = unknown>(
  url: string,
  token: string
): Promise<TResponse> {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      [FIGMA_TOKEN_HEADER]: token,
      'Content-Type': CONTENT_TYPE_JSON,
    },
  })

  if (!response.ok) {
    let errorMessage = ERROR_MSG_FETCH_FIGMA_DATA_FAILED
    try {
      const errorData = await response.json()
      if (errorData?.message) {
        errorMessage = errorData.message
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<TResponse>
}
