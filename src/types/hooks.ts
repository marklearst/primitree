import type { VariableMode } from './figma'

/**
 * The return type for the `useVariableModes` hook.
 */
export interface UseVariableModesResult {
  /** A flat array of all modes across all collections. */
  modes: VariableMode[]
  /** A map of collection IDs to an array of modes belonging to that collection. */
  modesByCollectionId: Record<string, VariableMode[]>
  /** A map of mode IDs to the corresponding mode object for quick lookups. */
  modesById: Record<string, VariableMode>
}
