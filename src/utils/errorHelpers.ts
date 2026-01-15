import { FigmaApiError } from 'types/figma'

/**
 * Type guard to check if an error is a FigmaApiError instance.
 *
 * @remarks
 * Use this to safely check if an error has HTTP status code information before accessing `statusCode`.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a FigmaApiError, `false` otherwise.
 *
 * @example
 * ```tsx
 * import { isFigmaApiError } from '@figma-vars/hooks';
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
 * Extracts the HTTP status code from an error, if available.
 *
 * @remarks
 * Returns the status code from FigmaApiError, or `null` if the error doesn't have status information.
 *
 * @param error - The error to extract status code from.
 * @returns The HTTP status code, or `null` if not available.
 *
 * @example
 * ```tsx
 * import { getErrorStatus } from '@figma-vars/hooks';
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
 * Extracts a human-readable error message from an error.
 *
 * @remarks
 * Returns the error message, falling back to a default message if the error doesn't have one.
 *
 * @param error - The error to extract message from.
 * @param defaultMessage - Optional default message if error has no message. Defaults to "An error occurred".
 * @returns The error message string.
 *
 * @example
 * ```tsx
 * import { getErrorMessage } from '@figma-vars/hooks';
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
 * Checks if an error represents a specific HTTP status code.
 *
 * @remarks
 * Convenience function to check if an error has a specific status code.
 *
 * @param error - The error to check.
 * @param statusCode - The HTTP status code to check for.
 * @returns `true` if the error has the specified status code, `false` otherwise.
 *
 * @example
 * ```tsx
 * import { hasErrorStatus } from '@figma-vars/hooks';
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
