/**
 * @packageDocumentation
 * Utility exports from `@figmavars/core`.
 *
 * @example
 * ```ts
 * import { filterVariables, isFigmaApiError } from '@figmavars/hooks';
 *
 * const filtered = filterVariables(allVariables, { resolvedType: 'COLOR' });
 * ```
 *
 * @public
 */
export { filterVariables } from '@figmavars/core'
export type { FilterVariablesCriteria } from '@figmavars/core'
export {
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
  isRateLimited,
  getRetryAfter,
} from '@figmavars/core'
export {
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from '@figmavars/core'
export { redactToken } from '@figmavars/core'
export type { RedactTokenOptions } from '@figmavars/core'
export { withRetry } from '@figmavars/core'
export type { RetryOptions } from '@figmavars/core'
