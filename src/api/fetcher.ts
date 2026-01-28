// utils/fetchHelpers.ts

import {
  FIGMA_API_BASE_URL,
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from 'constants/index'
import { FigmaApiError } from 'types/figma'

/**
 * Options for configuring fetcher behavior.
 *
 * @public
 */
export interface FetcherOptions {
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
}

/**
 * Low-level utility to fetch data from the Figma Variables REST API with authentication.
 *
 * @remarks
 * Sends an authenticated HTTP GET request to the given Figma API endpoint using the provided Personal Access Token (PAT).
 * Parses JSON responses and throws detailed errors for failed requests.
 * Intended for internal use by hooks but can be used directly for custom API interactions.
 *
 * Supports request cancellation via AbortSignal and timeout handling.
 *
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) for authentication.
 * @param options - Optional configuration for abort signal, timeout, or custom fetch implementation.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws an Error if the token is not provided.
 * @throws Throws an Error if the HTTP response is not ok, including the message returned by the Figma API or a default error message.
 * @throws Throws an AbortError if the request is aborted or times out.
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
 *
 * // With timeout:
 * const data = await fetcher(url, token, { timeout: 5000 });
 *
 * // With abort signal:
 * const controller = new AbortController();
 * const data = await fetcher(url, token, { signal: controller.signal });
 * controller.abort(); // Cancel the request
 * ```
 */
export async function fetcher<TResponse = unknown>(
  url: string,
  token: string,
  options?: FetcherOptions
): Promise<TResponse> {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const {
    signal: providedSignal,
    timeout,
    fetch: customFetch = fetch,
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
    const requestUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${FIGMA_API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`

    const response = await customFetch(requestUrl, {
      method: 'GET',
      headers: {
        [FIGMA_TOKEN_HEADER]: token,
        'Content-Type': CONTENT_TYPE_JSON,
      },
      ...(signal !== undefined && { signal }),
    })

    // Clear timeout immediately after response to prevent spurious abort
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }

    if (!response.ok) {
      let errorMessage = ERROR_MSG_FETCH_FIGMA_DATA_FAILED
      const statusCode = response.status

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
          if (errorData?.message) {
            errorMessage = errorData.message
          } else if (errorData?.err) {
            errorMessage = errorData.err
          }
        }
      } catch {
        // Ignore JSON parse errors, use default message
      }

      throw new FigmaApiError(errorMessage, statusCode, retryAfter)
    }

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
