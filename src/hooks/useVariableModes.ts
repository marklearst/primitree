import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection, VariableMode } from 'types'
import type { UseVariableModesResult } from 'types/hooks'

/**
 * A convenience hook to access and process variable modes from the data fetched by `useVariables`.
 * This hook does not perform its own data fetching; it's a lightweight selector that memoizes the processed mode data.
 *
 * Use this hook when you need mode data, structured for easy access.
 *
 * @returns An object containing all modes as an array (`modes`), modes grouped by collection ID (`modesByCollectionId`), and modes indexed by their own ID (`modesById`).
 *
 * @example
 * ```tsx
 * const { modesById } = useVariableModes();
 * const lightMode = modesById['mode-123'];
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
