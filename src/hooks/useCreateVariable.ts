import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import type { CreateVariablePayload } from '../types/mutations'
import { FIGMA_POST_VARIABLES_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

/**
 * A hook for creating a new Figma variable.
 *
 * This hook provides a `mutate` function to trigger the creation of a variable.
 * It handles the loading, error, and data states of the mutation.
 *
 * @returns An object containing the mutation function and the current state of the mutation.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading, error } = useCreateVariable();
 *
 * const handleCreateVariable = () => {
 *   const newVariableData = {
 *     name: "new-color",
 *     variableCollectionId: "VariableCollectionId:1:1",
 *     resolvedType: "COLOR"
 *   };
 *   mutate(newVariableData);
 * };
 * ```
 */
export const useCreateVariable = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error('A Figma API token is required.')
    }
    return await mutator<any>(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      'POST',
      payload as unknown as Record<string, unknown>
    )
  })

  return mutation
}
