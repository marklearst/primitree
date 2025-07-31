import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

/**
 * Hook for deleting a Figma variable.
 *
 * This hook provides a stateful API to delete a variable from the Figma file.
 * It abstracts the logic for making the API request and managing the mutation state.
 *
 * @returns {object} An object containing the mutation state and trigger functions.
 * @property {(variableId: string) => Promise<void|undefined>} mutate - Function to trigger the mutation.
 * @property {(variableId: string) => Promise<void>} mutateAsync - An async version of `mutate` that will throw on error.
 * @property {undefined} data - Should be undefined for a delete operation.
 * @property {boolean} isLoading - True if the mutation is in progress.
 * @property {boolean} isSuccess - True if the mutation was successful.
 * @property {boolean} isError - True if the mutation failed.
 * @property {Error|null} error - The error object if the mutation failed.
 *
 * @example
 * ```tsx
 * const { mutate: deleteVariable, isLoading } = useDeleteVariable();
 *
 * const handleDelete = async (id: string) => {
 *   try {
 *     await deleteVariable(id);
 *     console.log("Variable deleted!");
 *     // You can then refetch your variables list or update the UI.
 *   } catch (e) {
 *     console.error("Deletion failed", e);
 *   }
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
