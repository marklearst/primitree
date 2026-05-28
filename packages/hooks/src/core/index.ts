/**
 * @packageDocumentation
 *
 * Core (non-React) exports for @figma-vars/hooks.
 *
 * @remarks
 * This entrypoint intentionally avoids importing React or SWR.
 * It is suitable for integrations built with TanStack Query, Axios, server-side scripts,
 * or any custom data-fetching layer.
 *
 * As of v5 this entrypoint re-exports the standalone `@figma-vars/core` package.
 * New code should depend on `@figma-vars/core` directly; this subpath remains for
 * backwards compatibility.
 *
 * @example
 * ```ts
 * import { fetcher, FIGMA_FILE_VARIABLES_PATH } from '@figma-vars/hooks/core'
 *
 * const data = await fetcher(FIGMA_FILE_VARIABLES_PATH(fileKey) + '/local', token)
 * ```
 */
export * from '@figma-vars/core'
