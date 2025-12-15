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

import { fetcher } from '../api/fetcher.js'
import { mutator } from '../api/mutator.js'
import { filterVariables } from '../utils/filterVariables.js'

export { fetcher, mutator, filterVariables }
export * from '../constants/index.js'
export type * from '../types/figma.js'
export type * from '../types/mutations.js'
