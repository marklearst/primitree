/**
 * @packageDocumentation
 *
 * Entry point for **@figmavars/core** — the framework-agnostic foundation of the
 * FigmaVars toolchain.
 *
 * @remarks
 * Contains the typed Figma Variables REST client (`fetcher`, `mutator`), endpoint
 * constants, error helpers, retry utilities, runtime type guards, and every Figma
 * domain type. No React, no SWR — safe for Node scripts, CLIs, edge runtimes, and
 * any data-fetching layer (TanStack Query, Axios, plain fetch).
 *
 * @example
 * ```ts
 * import { fetcher, FIGMA_LOCAL_VARIABLES_ENDPOINT } from '@figmavars/core'
 *
 * const data = await fetcher(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey), token)
 * ```
 */
export * from './normalize/index'
export * from './diff/index'

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
