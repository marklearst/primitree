import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that deletes a Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * This hook provides a `mutate` function to trigger the deletion and exposes loading and error states.
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@figma-vars/hooks';
 *
 * function DeleteVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, error } = useDeleteVariable();
 *
 *   const onDelete = () => mutate(id);
 *
 *   if (isLoading) return <div>Deleting...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <button onClick={onDelete}>Delete Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useDeleteVariable = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(async (variableId: string) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator(
      FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId),
      token,
      'DELETE',
      undefined as unknown as Record<string, unknown>
    )
  })
  return mutation
}
