/**
 * @packageDocumentation
 * Barrel file for API utilities and mutators in @figma-vars/hooks.
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
 * import { fetcher, mutator } from '@figma-vars/hooks/api';
 *
 * async function loadVariables() {
 *   const variables = await fetcher('/variables', 'YOUR_FIGMA_TOKEN');
 *   // process variables
 * }
 * ```
 *
 * @public
 */
export { fetcher } from "api/fetcher";
export { mutator } from "api/mutator";
