import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

/**
 * A hook for deleting a Figma variable.
 *
 * This hook provides a `mutate` function to trigger the deletion of a variable.
 * It handles the loading, error, and data states of the mutation.
 *
 * @returns An object containing the mutation function and the current state of the mutation.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading, error } = useDeleteVariable();
 *
 * const handleDeleteVariable = (variableId: string) => {
 *   mutate(variableId);
 * };
 * ```
 */
export const useDeleteVariable = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(async (variableId: string) => {
    if (!token) {
      throw new Error('A Figma API token is required.')
    }
    const url = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)
    return await mutator(url, token, 'DELETE')
  })

  return mutation
}
