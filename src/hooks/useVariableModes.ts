import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection, VariableMode } from 'types'
import type { UseVariableModesResult } from 'types/hooks'

/**
 * A memoized selector hook to access and process variable modes from the data fetched by `useVariables`.
 *
 * This hook is a lightweight, performant way to get only mode data. It avoids
 * unnecessary re-renders in components that only care about modes, as it will only
 * update when the mode data itself changes. It provides modes in several useful formats.
 *
 * @returns {UseVariableModesResult} An object containing the modes in different formats.
 * @property {VariableMode[]} modes - An array of all `VariableMode` objects.
 * @property {Object<string, VariableMode[]>} modesByCollectionId - A map where keys are collection IDs and values are arrays of modes belonging to that collection.
 * @property {Object<string, VariableMode>} modesById - A map of all `VariableMode` objects, keyed by their `modeId`.
 *
 * @example
 * ```tsx
 * const { modesById, modesByCollectionId } = useVariableModes();
 * const lightMode = modesById['42:0'];
 * const collectionModes = modesByCollectionId['VariableCollectionId:123:456'];
 *
 * if (!lightMode) return <div>Mode not found.</div>;
 *
 * return <div>Mode: {lightMode.name}</div>
 * ```
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
