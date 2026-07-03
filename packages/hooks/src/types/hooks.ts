import type { VariableMode, UpdateVariablePayload } from '@primitree/core'

/**
 * Arguments passed to `useUpdateVariable().mutate`.
 *
 * @remarks
 * `variableId` identifies the record. `payload` contains the fields to change.
 *
 * @property variableId - The unique Figma variable ID from variable metadata or Figma plugin developer tools.
 * @property payload - The payload object with one or more variable properties to update (e.g., name, description, valuesByMode).
 *
 * @example
 * ```ts
 * import type { UpdateVariableArgs } from '@primitree/hooks';
 *
 * const args: UpdateVariableArgs = {
 *   variableId: 'VariableID:123:456',
 *   payload: { name: 'Updated Name', description: 'Updated description' }
 * };
 * mutate(args)
 * ```
 *
 * @public
 */
export interface UpdateVariableArgs {
  /** The unique Figma variable ID to update. */
  variableId: string
  /** The payload object with updated properties for the variable. */
  payload: UpdateVariablePayload
}

/**
 * Variable modes and ID-keyed lookup maps.
 *
 * @remarks
 * {@link useVariableModes} builds these values from local collection data.
 *
 * @property modes - Flat array of all VariableMode objects in the file.
 * @property modesByCollectionId - Lookup map of collection IDs to arrays of VariableMode objects (for grouping modes by collection).
 * @property modesById - Lookup map of mode IDs to VariableMode objects (for fast direct access).
 *
 * @example
 * ```ts
 * import { useVariableModes } from '@primitree/hooks';
 *
 * function ThemeSwitcher() {
 *   const { modes, modesById } = useVariableModes();
 *   // Build UI for switching themes based on mode names
 *   return (
 *     <select>
 *       {modes.map(mode => (
 *         <option key={mode.modeId} value={mode.modeId}>{mode.name}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 *
 * @public
 */
export interface UseVariableModesResult {
  /** Flat array of all VariableMode objects in the file. */
  modes: VariableMode[]
  /** Lookup map of collection IDs to arrays of VariableMode objects. */
  modesByCollectionId: Record<string, VariableMode[]>
  /** Lookup map of mode IDs to VariableMode objects. */
  modesById: Record<string, VariableMode>
}
