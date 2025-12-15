import {
  FIGMA_API_BASE_URL,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import type { VariableAction, BulkUpdatePayload } from 'types/mutations.js'
import { FigmaApiError } from 'types/figma'

/**
 * Low-level utility to send authenticated POST, PUT, or DELETE requests to the Figma Variables REST API.
 *
 * @remarks
 * This function performs authenticated HTTP mutations (POST, PUT, DELETE) against the specified Figma API endpoint.
 * It handles JSON serialization of the request body, parses JSON responses, and propagates detailed errors.
 * Intended primarily for internal use by mutation hooks, but also suitable for direct custom API mutations.
 *
 * @typeParam TResponse - The expected response type returned from the Figma API.
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) used for authentication.
 * @param action - The action for the mutation: 'CREATE', 'UPDATE', or 'DELETE'.
 * @param body - Optional request payload. For bulk operations, use BulkUpdatePayload. For individual operations, use objects with `variables` array.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws a FigmaApiError if the token is not provided or if the HTTP response is unsuccessful.
 *
 * @example
 * ```ts
 * import { mutator } from '@figma-vars/hooks/api';
 *
 * async function updateVariable(fileKey: string, token: string, variableId: string) {
 *   const url = `https://api.figma.com/v1/files/${fileKey}/variables`;
 *   const payload = { variables: [{ action: 'UPDATE', id: variableId, name: 'Updated Name' }] };
 *   const result = await mutator(url, token, 'UPDATE', payload);
 *   return result;
 * }
 * ```
 */
export async function mutator<TResponse = unknown>(
  url: string,
  token: string,
  action: VariableAction,
  body?:
    | BulkUpdatePayload
    | { variables?: Array<Record<string, unknown>> }
    | Record<string, unknown>
): Promise<TResponse> {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const methodMap: Record<VariableAction, 'POST' | 'PUT' | 'DELETE'> = {
    CREATE: 'POST',
    UPDATE: 'PUT',
    DELETE: 'DELETE',
  }
  const method = methodMap[action]

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      [FIGMA_TOKEN_HEADER]: token,
    },
  }
  if (body) {
    init.body = JSON.stringify(body)
  }

  const requestUrl =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${FIGMA_API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`

  const response = await fetch(requestUrl, init)

  if (!response.ok) {
    const statusCode = response.status
    let errorMessage = 'An API error occurred'

    // Try to extract error message from JSON response
    try {
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorData = await response.json()
        errorMessage = errorData.err || errorData.message || errorMessage
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }

    throw new FigmaApiError(errorMessage, statusCode)
  }

  // Handle successful '204 No Content' responses, which have no body
  if (response.status === 204 || !response.body) {
    // Cast empty object to the generic response type, allowing callers to specify void or an object
    return {} as TResponse
  }

  // For all other successful responses, parse the JSON body
  return response.json() as Promise<TResponse>
}
