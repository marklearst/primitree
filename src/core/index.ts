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
 * @example
 * ```ts
 * import { fetcher, FIGMA_FILE_VARIABLES_PATH } from '@figma-vars/hooks/core'
 *
 * const data = await fetcher(FIGMA_FILE_VARIABLES_PATH(fileKey) + '/local', token)
 * ```
 */

export { fetcher, mutator } from 'api'
export * from 'constants/index'
export { filterVariables } from 'utils'
export * from 'types/figma'
export * from 'types/mutations'
