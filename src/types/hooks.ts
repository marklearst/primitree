/**
 * @fileoverview TypeScript type definitions for hook return types.
 * These types define the structure of data returned by various hooks in the library.
 * @since 1.0.0
 */

import type { VariableMode } from './figma'

/**
 * The return type for the `useVariableModes` hook.
 * Provides multiple ways to access and organize variable modes from Figma collections.
 * 
 * @typedef {Object} UseVariableModesResult
 * @memberof Types
 * @since 1.0.0
 * @see {@link useVariableModes} - The hook that returns this type
 * @property {VariableMode[]} modes A flat array of all modes across all collections.
 * @property {Record<string, VariableMode[]>} modesByCollectionId A map of collection IDs to an array of modes belonging to that collection.
 * @property {Record<string, VariableMode>} modesById A map of mode IDs to the corresponding mode object for quick lookups.
 */
export interface UseVariableModesResult {
  /** A flat array of all modes across all collections. */
  modes: VariableMode[]
  /** A map of collection IDs to an array of modes belonging to that collection. */
  modesByCollectionId: Record<string, VariableMode[]>
  /** A map of mode IDs to the corresponding mode object for quick lookups. */
  modesById: Record<string, VariableMode>
}
