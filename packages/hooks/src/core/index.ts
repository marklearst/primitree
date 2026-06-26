/**
 * Non-React compatibility entry point for `@figmavars/hooks`.
 *
 * @remarks
 * This entry point re-exports `@figmavars/core` without importing React or
 * SWR. New code can depend on `@figmavars/core`; this path supports existing
 * `@figmavars/hooks/core` imports.
 *
 * @example
 * ```ts
 * import { fetcher, FIGMA_LOCAL_VARIABLES_ENDPOINT } from '@figmavars/hooks/core'
 *
 * const data = await fetcher(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey), token)
 * ```
 *
 * @module hooks-core
 */
export * from '@figmavars/core'
