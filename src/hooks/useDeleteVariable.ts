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
 * @function useDeleteVariable
 * @memberof Hooks
 * @since 1.0.0
 * @returns {MutationResult<void, string>} The mutation object with state and trigger function.
 * @see {@link https://www.figma.com/developers/api#delete-variables|Figma Variables API - Delete Variable}
 * @see {@link useMutation} - The underlying mutation hook
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@figma-vars/hooks';
 *
 * function VariableDeleter({ variableId }) {
 *   const { mutate, isLoading, isSuccess, error } = useDeleteVariable();
 *
 *   const handleDelete = () => {
 *     if (confirm('Are you sure you want to delete this variable?')) {
 *       mutate(variableId);
 *     }
 *   };
 *
 *   if (isLoading) return <div>Deleting variable...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable deleted successfully!</div>;
 *
 *   return <button onClick={handleDelete}>Delete Variable</button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Delete a variable by ID
 * const { mutate, isLoading } = useDeleteVariable();
 * 
 * const deleteVariable = (id: string) => {
 *   mutate(id); // Pass the variable ID directly
 * };
 * 
 * // Usage
 * deleteVariable('VariableID:123:456');
 * ```
 */
export const useDeleteVariable = () => {
  const { token } = useFigmaTokenContext()
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }
  const mutation = useMutation(async (variableId: string) => {

    return await mutator<any>(
      FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId),
      token,
      'DELETE'
    )
  })
  return mutation
}
