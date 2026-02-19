import {
  FIGMA_API_BASE_URL,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import type { VariableAction, BulkUpdatePayload } from 'types/mutations.js'
import { FigmaApiError } from 'types/figma'

/**
 * Options for configuring mutator behavior.
 *
 * @public
 */
export interface MutatorOptions {
  /**
   * Optional AbortSignal to cancel the request.
   */
  signal?: AbortSignal
  /**
   * Optional timeout in milliseconds. Creates an AbortSignal internally if provided.
   */
  timeout?: number
  /**
   * Optional fetch implementation override (useful for testing or custom fetch implementations).
   */
  fetch?: typeof fetch
  /**
   * Optional base URL override. Defaults to 'https://api.figma.com'.
   * Useful for testing with mocks or proxies.
   */
  baseUrl?: string
}

/**
 * Low-level utility to send authenticated POST, PUT, or DELETE requests to the Figma Variables REST API.
 *
 * @remarks
 * This function performs authenticated HTTP mutations (POST, PUT, DELETE) against the specified Figma API endpoint.
 * It handles JSON serialization of the request body, parses JSON responses, and propagates detailed errors.
 * Intended primarily for internal use by mutation hooks, but also suitable for direct custom API mutations.
 *
 * Supports request cancellation via AbortSignal and timeout handling.
 *
 * @typeParam TResponse - The expected response type returned from the Figma API.
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) used for authentication.
 * @param action - The action for the mutation: 'CREATE', 'UPDATE', or 'DELETE'.
 * @param body - Optional request payload. For bulk operations, use BulkUpdatePayload. For individual operations, use objects with `variables` array.
 * @param options - Optional configuration for abort signal, timeout, or custom fetch implementation.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws a FigmaApiError if the token is not provided or if the HTTP response is unsuccessful.
 * @throws Throws an AbortError if the request is aborted or times out.
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
 *
 * // With timeout:
 * const result = await mutator(url, token, 'UPDATE', payload, { timeout: 5000 });
 * ```
 */
export async function mutator<TResponse = unknown>(
  url: string,
  token: string,
  action: VariableAction,
  body?:
    | BulkUpdatePayload
    | { variables?: Array<Record<string, unknown>> }
    | Record<string, unknown>,
  options?: MutatorOptions
): Promise<TResponse> {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const {
    signal: providedSignal,
    timeout,
    fetch: customFetch = fetch,
    baseUrl = FIGMA_API_BASE_URL,
  } = options ?? {}

  // Create timeout signal if timeout is provided and no signal is provided
  // Note: If both providedSignal and timeout are provided, providedSignal takes precedence
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let timeoutAbortController: AbortController | undefined

  const signal =
    providedSignal ||
    (timeout
      ? ((timeoutAbortController = new AbortController()),
        (timeoutId = setTimeout(() => {
          timeoutAbortController?.abort()
        }, timeout)),
        timeoutAbortController.signal)
      : undefined)

  try {
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
      ...(signal !== undefined && { signal }),
    }
    if (body) {
      init.body = JSON.stringify(body)
    }

    const requestUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`

    const response = await customFetch(requestUrl, init)

    // Clear timeout immediately after response to prevent spurious abort
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }

    if (!response.ok) {
      const statusCode = response.status
      let errorMessage = 'An API error occurred'

      // Parse Retry-After header for rate limit errors
      let retryAfter: number | undefined
      if (statusCode === 429) {
        const retryAfterHeader = response.headers.get('Retry-After')
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10)
          if (!Number.isNaN(parsed)) {
            retryAfter = parsed
          }
        }
      }

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

      throw new FigmaApiError(errorMessage, statusCode, retryAfter)
    }

    // Handle successful '204 No Content' responses, which have no body
    if (response.status === 204 || !response.body) {
      // Cast empty object to the generic response type, allowing callers to specify void or an object
      return {} as TResponse
    }

    // For all other successful responses, parse the JSON body
    return response.json() as Promise<TResponse>
  } catch (err) {
    // Clear timeout on error to prevent abort signal firing after error handling
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    throw err
  }
}
