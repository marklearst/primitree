/**
 * @packageDocumentation
 * Barrel file for API utilities and mutators in @primitree/core.
 *
 * @summary
 * Central entry point for all API-related utilities used to interact with the Figma Variables REST API.
 *
 * @remarks
 * This module re-exports the core fetch and mutation functions that provide network communication and RESTful operations for Figma Variables.
 * Import from here to access low-level API functions supporting hooks and other utilities.
 *
 * @example
 * ```ts
 * import { fetcher, mutator } from '@primitree/core';
 *
 * async function loadVariables() {
 *   const variables = await fetcher('/variables', 'YOUR_FIGMA_TOKEN');
 *   // process variables
 * }
 * ```
 *
 * @public
 */
export { fetcher } from './fetcher'
export { mutator } from './mutator'
export type { FetcherOptions } from './fetcher'
export type { MutatorOptions } from './mutator'
