import {
  FIGMA_API_BASE_URL,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../constants/index'
import type { VariableAction, BulkUpdatePayload } from '../types/mutations'
import { FigmaApiError } from '../types/figma'

/**
 * Options for {@link mutator}.
 *
 * @public
 */
export interface MutatorOptions {
  /**
   * Signal that can cancel the request.
   */
  signal?: AbortSignal
  /**
   * Request timeout in milliseconds.
   */
  timeout?: number
  /**
   * Fetch implementation. Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch
  /**
   * API base URL. Defaults to `https://api.figma.com`.
   */
  baseUrl?: string
}

/**
 * Send an authenticated POST request to the Figma Variables REST API.
 *
 * @remarks
 * Entry-level `action` fields select create, update, and delete operations.
 * The function serializes the body and parses JSON responses. It returns an
 * empty object for HTTP 204.
 *
 * @typeParam TResponse - Parsed response type.
 * @param url - Absolute Figma URL or path relative to `baseUrl`.
 * @param token - Figma Personal Access Token.
 * @param _action - Compatibility parameter. Request entries select the action.
 * @param body - Mutation request body.
 * @param options - Request signal, timeout, fetch implementation, and base URL.
 *
 * @returns Parsed JSON response, or an empty object for HTTP 204.
 *
 * @throws Error for an empty `token`.
 * @throws FigmaApiError for a non-2xx response from Figma.
 * @throws AbortError when the caller aborts the signal or the timeout expires.
 *
 * @example
 * ```ts
 * import { mutator } from '@primitree/core';
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
  _action: VariableAction,
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
  let signal = providedSignal

  if (!signal && timeout) {
    const timeoutAbortController = new AbortController()
    timeoutId = setTimeout(() => {
      timeoutAbortController.abort()
    }, timeout)
    signal = timeoutAbortController.signal
  }

  try {
    const init: RequestInit = {
      method: 'POST',
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
      let errorMessage = `Figma API request failed with status ${statusCode}.`

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

      // Try to extract error message from response body
      try {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const errorData: unknown = await response.json()
          if (typeof errorData === 'object' && errorData !== null) {
            const { err, message } = errorData as {
              err?: unknown
              message?: unknown
            }
            errorMessage =
              (typeof err === 'string' && err) ||
              (typeof message === 'string' && message) ||
              errorMessage
          }
        } else if (
          contentType.includes('text/plain') ||
          contentType.includes('text/html')
        ) {
          // For text responses (e.g., 502 Bad Gateway), use the body text
          const textBody = await response.text()
          if (textBody) {
            const redactedTextBody = textBody.replaceAll(token, '[redacted]')
            // Truncate long HTML/text responses to a reasonable length
            const maxLength = 200
            errorMessage =
              redactedTextBody.length > maxLength
                ? `${redactedTextBody.slice(0, maxLength)}...`
                : redactedTextBody
          }
        }
      } catch {
        // Ignore parse errors, use default message
      }

      errorMessage = errorMessage.replaceAll(token, '[redacted]')
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
