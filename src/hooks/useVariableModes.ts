import useSWR from 'swr'
import useFigmaToken from 'hooks/useFigmaToken'
import { fetchWithAuth } from 'utils/fetchHelpers'
import type {
  LocalVariablesResponse,
  FigmaCollection,
  VariableMode,
} from 'types'
import type { UseVariableModesResult } from 'types/hooks'
import { FIGMA_VARIABLES_ENDPOINT } from 'constants'

/**
 * A hook to fetch all variable modes for a given file.
 *
 * @param fileKey - The key of the file to fetch variables from.
 * @returns An object containing the variable modes, loading state, and any errors.
 */
export const useVariableModes = (fileKey: string): UseVariableModesResult => {
  const token = useFigmaToken()
  const { data, error, isLoading, isValidating } =
    useSWR<LocalVariablesResponse>(
      token ? FIGMA_VARIABLES_ENDPOINT(fileKey) : null,
      fetchWithAuth
    )

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
    isLoading,
    isValidating,
    error:
      error ??
      (data && 'message' in data ? new Error((data as any).message) : null),
  }
}
