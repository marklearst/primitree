import type { VariableMode } from "./figma";
import type { UpdateVariablePayload } from "./mutations";

/**
 * Arguments for updating a Figma variable via the useUpdateVariable hook.
 *
 * @remarks
 * Use with the useUpdateVariable hook to specify which Figma variable to update and the properties to set. This enables fine-grained updates for custom UIs, bulk editors, and automation tools.
 *
 * @property variableId - The unique Figma variable ID to update. This can be found in variable metadata or Figma plugin dev tools.
 * @property payload - The payload object with one or more variable properties to update (e.g., name, description, valuesByMode).
 *
 * @example
 * ```ts
 * import type { UpdateVariableArgs } from '@figma-vars/hooks';
 *
 * const args: UpdateVariableArgs = {
 *   variableId: 'VariableID:123:456',
 *   payload: { name: 'Updated Name', description: 'Updated description' }
 * };
 * // Pass to mutate(): mutate(args)
 * ```
 *
 * @public
 */
export interface UpdateVariableArgs {
  /** The unique Figma variable ID to update. */
  variableId: string;
  /** The payload object with updated properties for the variable. */
  payload: UpdateVariablePayload;
}

/**
 * Return value of the useVariableModes hook—provides all variable modes and lookup tables for the current Figma file context.
 *
 * @remarks
 * Returned by useVariableModes. Use this to quickly map modes by ID, by collection, or as a flat array for UI display, theming, and conditional logic.
 *
 * @property modes - Flat array of all VariableMode objects in the file.
 * @property modesByCollectionId - Lookup map of collection IDs to arrays of VariableMode objects (for grouping modes by collection).
 * @property modesById - Lookup map of mode IDs to VariableMode objects (for fast direct access).
 *
 * @example
 * ```ts
 * import { useVariableModes } from '@figma-vars/hooks';
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
  modes: VariableMode[];
  /** Lookup map of collection IDs to arrays of VariableMode objects. */
  modesByCollectionId: Record<string, VariableMode[]>;
  /** Lookup map of mode IDs to VariableMode objects. */
  modesById: Record<string, VariableMode>;
}
