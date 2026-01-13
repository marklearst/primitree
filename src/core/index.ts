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

import { fetcher } from 'api/fetcher'
import { mutator } from 'api/mutator'
import { filterVariables } from 'utils/filterVariables'

export { fetcher, mutator, filterVariables }
export * from 'constants/index'
export type * from 'types/figma'
export type * from 'types/mutations'
