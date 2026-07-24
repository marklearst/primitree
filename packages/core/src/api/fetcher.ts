// utils/fetchHelpers.ts

import {
  FIGMA_API_BASE_URL,
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from '../constants/index'
import { FigmaApiError } from '../types/figma'

/**
 * Options for {@link fetcher}.
 *
 * @public
 */
export interface FetcherOptions {
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
 * Send an authenticated GET request to the Figma REST API.
 *
 * @remarks
 * The function parses JSON responses. It throws {@link FigmaApiError} for an
 * unsuccessful response and preserves `Retry-After` for HTTP 429 responses.
 *
 * @param url - Absolute Figma URL or path relative to `baseUrl`.
 * @param token - Figma Personal Access Token.
 * @param options - Request signal, timeout, fetch implementation, and base URL.
 *
 * @returns Parsed JSON response.
 *
 * @throws Error when `token` is empty.
 * @throws FigmaApiError when Figma returns an unsuccessful response.
 * @throws AbortError when the signal aborts or the timeout expires.
 *
 * @example
 * ```ts
 * import { fetcher } from '@figmavars/core';
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
    const requestUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`

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

      // Try to extract error message from response body
      try {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const errorData = await response.json()
          if (errorData?.message) {
            errorMessage = errorData.message
          } else if (errorData?.err) {
            errorMessage = errorData.err
          }
        } else if (
          contentType.includes('text/plain') ||
          contentType.includes('text/html')
        ) {
          // For text responses (e.g., 502 Bad Gateway), use the body text
          const textBody = await response.text()
          if (textBody) {
            // Truncate long HTML/text responses to a reasonable length
            const maxLength = 200
            errorMessage =
              textBody.length > maxLength
                ? `${textBody.slice(0, maxLength)}...`
                : textBody
          }
        }
      } catch {
        // Ignore parse errors, use default message
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
