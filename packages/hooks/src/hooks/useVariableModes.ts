import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection, VariableMode } from '../types'
import type { UseVariableModesResult } from '../types/hooks'

/**
 * Read local variable modes as arrays and ID-keyed maps.
 *
 * @remarks
 * The hook groups modes by collection ID and indexes them by mode ID.
 *
 * @example
 * ```tsx
 * import { useVariableModes } from '@figmavars/hooks';
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
  const { data } = useVariables()

  return useMemo(() => {
    const modes: VariableMode[] = []
    const modesByCollectionId: Record<string, VariableMode[]> = {}
    const modesById: Record<string, VariableMode> = {}

    if (data?.meta) {
      for (const collection of Object.values(
        data.meta.variableCollections
      ) as FigmaCollection[]) {
        modes.push(...collection.modes)
        modesByCollectionId[collection.id] = collection.modes
        for (const mode of collection.modes) {
          modesById[mode.modeId] = mode
        }
      }
    }

    return {
      modes,
      modesByCollectionId,
      modesById,
    }
  }, [data])
}
