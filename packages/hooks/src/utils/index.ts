/**
 * @packageDocumentation
 * Utility exports from `@primitree/core`.
 *
 * @example
 * ```ts
 * import { filterVariables, isFigmaApiError } from '@primitree/hooks';
 *
 * const filtered = filterVariables(allVariables, { resolvedType: 'COLOR' });
 * ```
 *
 * @public
 */
export { filterVariables } from '@primitree/core'
export type { FilterVariablesCriteria } from '@primitree/core'
export {
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
  isRateLimited,
  getRetryAfter,
} from '@primitree/core'
export {
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from '@primitree/core'
export { redactToken } from '@primitree/core'
export type { RedactTokenOptions } from '@primitree/core'
export { withRetry } from '@primitree/core'
export type { RetryOptions } from '@primitree/core'
