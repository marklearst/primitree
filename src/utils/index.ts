/**
 * @packageDocumentation
 * Barrel file for stateless utility functions in @figma-vars/hooks.
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
 * import { filterVariables, isFigmaApiError } from '@figma-vars/hooks/utils';
 *
 * const filtered = filterVariables(allVariables, { resolvedType: 'COLOR' });
 * ```
 *
 * @public
 */
export { filterVariables } from 'utils/filterVariables'
export type { FilterVariablesCriteria } from 'utils/filterVariables'
export {
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
  isRateLimited,
  getRetryAfter,
} from 'utils/errorHelpers'
export {
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
} from 'utils/typeGuards'
export { redactToken } from 'utils/redactToken'
export type { RedactTokenOptions } from 'utils/redactToken'
export { withRetry } from 'utils/retry'
export type { RetryOptions } from 'utils/retry'
