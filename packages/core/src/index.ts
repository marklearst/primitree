/**
 * Framework-independent Figma Variables and token graph utilities.
 *
 * @remarks
 * The package exports Figma Variables REST clients, endpoint builders, data
 * types, normalization, alias resolution, diffs, error helpers, and retry
 * support. It also exports functions to build, inspect, resolve, and compare
 * token graphs. It has no React or SWR dependency.
 *
 * @example
 * ```ts
 * import { fetcher, FIGMA_LOCAL_VARIABLES_ENDPOINT } from '@primitree/core'
 *
 * const data = await fetcher(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey), token)
 * ```
 *
 * @module core
 */
export * from './normalize/index'
export * from './diff/index'
export * from './graph/index'

export { fetcher } from './api/fetcher'
export type { FetcherOptions } from './api/fetcher'
export { mutator } from './api/mutator'
export type { MutatorOptions } from './api/mutator'

export * from './constants/index'

export * from './types/figma'
export * from './types/mutations'

export { filterVariables } from './utils/filterVariables'
export type { FilterVariablesCriteria } from './utils/filterVariables'
export {
  isFigmaApiError,
  getErrorStatus,
  getErrorMessage,
  hasErrorStatus,
  isRateLimited,
  getRetryAfter,
} from './utils/errorHelpers'
export {
  classifyFallbackData,
  isLocalVariablesResponse,
  isPublishedVariablesResponse,
  validateFallbackData,
} from './utils/typeGuards'
export type {
  ClassifiedFallbackData,
  FallbackDataKind,
} from './utils/typeGuards'
export { redactToken } from './utils/redactToken'
export type { RedactTokenOptions } from './utils/redactToken'
export { withRetry } from './utils/retry'
export type { RetryOptions } from './utils/retry'
