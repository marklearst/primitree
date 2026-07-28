import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { useMutation } from './useMutation'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  mutator,
} from '@primitree/core'

/**
 * Delete a Figma variable from the provider's file.
 *
 * @remarks
 * `mutate` accepts a variable ID. It returns the response or `undefined`
 * after storing a request failure in `error`.
 *
 * @returns Mutation state and a `mutate` function.
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@primitree/hooks';
 *
 * function DeleteVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, isError, error } = useDeleteVariable();
 *
 *   const onDelete = async () => {
 *     const result = await mutate(id);
 *     if (result) {
 *       console.log('Deleted variable');
 *     }
 *   };
 *
 *   if (isLoading) return <div>Deleting...</div>;
 *   if (isError) return <div>Error: {error?.message}</div>;
 *   return <button onClick={onDelete}>Delete Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useDeleteVariable = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(async (variableId: string) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    if (!fileKey) {
      throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
    }
    return await mutator(FIGMA_FILE_VARIABLES_PATH(fileKey), token, 'DELETE', {
      variables: [
        {
          action: 'DELETE',
          id: variableId,
        },
      ],
    })
  })
  return mutation
}
