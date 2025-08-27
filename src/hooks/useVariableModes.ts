import { useMemo } from "react";
import { useVariables } from "hooks/useVariables";
import type { FigmaCollection, VariableMode } from "types";
import type { UseVariableModesResult } from "types/hooks";

/**
 * React hook that extracts and memoizes all variable modes from loaded Figma variables data.
 *
 * @remarks
 * Returns an object with:
 * - `modes`: an array of all modes
 * - `modesByCollectionId`: a lookup table mapping collection IDs to arrays of modes
 * - `modesById`: a lookup table mapping mode IDs to VariableMode objects
 *
 * Useful for building UI pickers, mapping, advanced theme controls, or custom variable management tools. Call this hook anywhere you need fast, up-to-date access to modes for the current file context.
 *
 * @example
 * ```tsx
 * import { useVariableModes } from '@figma-vars/hooks';
 *
 * function ModeList() {
 *   const { modes } = useVariableModes();
 *   if (!modes.length) return <div>No modes found.</div>;
 *   return (
 *     <ul>
 *       {modes.map(mode => (
 *         <li key={mode.modeId}>{mode.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @public
 */
export const useVariableModes = (): UseVariableModesResult => {
  const { data } = useVariables();

  return useMemo(() => {
    const modes: VariableMode[] = [];
    const modesByCollectionId: Record<string, VariableMode[]> = {};
    const modesById: Record<string, VariableMode> = {};

    if (data?.meta) {
      for (const collection of Object.values(data.meta.variableCollections) as FigmaCollection[]) {
        modes.push(...collection.modes);
        modesByCollectionId[collection.id] = collection.modes;
        for (const mode of collection.modes) {
          modesById[mode.modeId] = mode;
        }
      }
    }

    return {
      modes,
      modesByCollectionId,
      modesById,
    };
  }, [data]);
};
