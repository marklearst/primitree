import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * Deletes a variable from the Figma file by its ID.
 *
 * This hook provides a stateful API to delete a variable, returning the mutation's
 * current state including `isLoading`, `isSuccess`, and `isError`.
 *
 * @returns {object} The mutation object.
 * @property {Function} mutate - The function to trigger the variable deletion. It takes the variable ID as an argument.
 * @property {boolean} isLoading - True if the mutation is currently in flight.
 * @property {boolean} isSuccess - True if the mutation has completed successfully.
 * @property {boolean} isError - True if the mutation has failed.
 * @property {Error} error - The error object if the mutation fails.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading } = useDeleteVariable();
 *
 * const handleDelete = () => {
 *   // The payload for delete is just the variable ID string.
 *   mutate("VariableID:1:2");
 * };
 *
 * return (
 *   <button onClick={handleDelete} disabled={isLoading}>
 *     {isLoading ? 'Deleting...' : 'Delete Variable'}
 *   </button>
 * );
 * ```
 */
export const useDeleteVariable = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(async (variableId: string) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator<any>(
      FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId),
      token,
      'DELETE'
    )
  })
  return mutation
}
