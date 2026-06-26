import { FigmaApiError } from '../types/figma'

/**
 * Check whether a value is a {@link FigmaApiError}.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a FigmaApiError, `false` otherwise.
 *
 * @example
 * ```tsx
 * import { isFigmaApiError } from '@figmavars/core';
 *
 * try {
 *   await mutate(payload);
 * } catch (error) {
 *   if (isFigmaApiError(error)) {
 *     if (error.statusCode === 401) {
 *       // Handle authentication error
 *     } else if (error.statusCode === 429) {
 *       // Handle rate limit
 *     }
 *   }
 * }
 * ```
 *
 * @public
 */
export function isFigmaApiError(error: unknown): error is FigmaApiError {
  return error instanceof FigmaApiError
}

/**
 * Return the HTTP status from a {@link FigmaApiError}.
 *
 * @param error - The error to extract status code from.
 * @returns The HTTP status code, or `null` if not available.
 *
 * @example
 * ```tsx
 * import { getErrorStatus } from '@figmavars/core';
 *
 * const status = getErrorStatus(error);
 * if (status === 401) {
 *   // Handle unauthorized
 * }
 * ```
 *
 * @public
 */
export function getErrorStatus(error: unknown): number | null {
  if (isFigmaApiError(error)) {
    return error.statusCode
  }
  return null
}

/**
 * Return an error message or the supplied fallback.
 *
 * @param error - The error to extract message from.
 * @param defaultMessage - Optional default message if error has no message. Defaults to "An error occurred".
 * @returns The error message string.
 *
 * @example
 * ```tsx
 * import { getErrorMessage } from '@figmavars/core';
 *
 * const message = getErrorMessage(error);
 * toast.error(message);
 * ```
 *
 * @public
 */
export function getErrorMessage(
  error: unknown,
  defaultMessage = 'An error occurred'
): string {
  if (error instanceof Error) {
    return error.message || defaultMessage
  }
  if (typeof error === 'string') {
    return error
  }
  return defaultMessage
}

/**
 * Check whether an error has an HTTP status code.
 *
 * @param error - The error to check.
 * @param statusCode - The HTTP status code to check for.
 * @returns `true` if the error has the specified status code, `false` otherwise.
 *
 * @example
 * ```tsx
 * import { hasErrorStatus } from '@figmavars/core';
 *
 * if (hasErrorStatus(error, 401)) {
 *   // Handle unauthorized
 * }
 * ```
 *
 * @public
 */
export function hasErrorStatus(error: unknown, statusCode: number): boolean {
  return getErrorStatus(error) === statusCode
}

/**
 * Check whether an error is a Figma HTTP 429 response.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a rate limit error (429), `false` otherwise.
 *
 * @example
 * ```tsx
 * import { isRateLimited } from '@figmavars/core';
 *
 * if (isRateLimited(error)) {
 *   // Handle rate limit, maybe retry after delay
 * }
 * ```
 *
 * @public
 */
export function isRateLimited(error: unknown): boolean {
  return hasErrorStatus(error, 429)
}

/**
 * Return the `Retry-After` value from a Figma HTTP 429 error.
 *
 * @param error - The error to extract retry-after from.
 * @returns The number of seconds to wait, or `null` if not available.
 *
 * @example
 * ```tsx
 * import { getRetryAfter } from '@figmavars/core';
 *
 * const retryAfter = getRetryAfter(error);
 * if (retryAfter !== null) {
 *   setTimeout(() => {
 *     // Retry the request
 *   }, retryAfter * 1000);
 * }
 * ```
 *
 * @public
 */
export function getRetryAfter(error: unknown): number | null {
  if (isFigmaApiError(error) && error.statusCode === 429) {
    return error.retryAfter ?? null
  }
  return null
}
