/**
 * @packageDocumentation
 * Barrel file for stateless utility functions in @figmavars/hooks.
 *
 * @summary
 * Provides centralized exports of utility functions for manipulating and querying Figma variables and design tokens.
 *
 * @remarks
 * Utilities exported here are pure functions, fully typed, and designed for use in UI filtering, scripting, and custom workflows.
 * Import from this barrel for consistent and type-safe access to these helpers.
 *
 * @example
 * ```ts
 * import { filterVariables, isFigmaApiError } from '@figmavars/hooks/utils';
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
