import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that deletes a Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * This hook provides a `mutate` function to trigger the deletion and exposes loading and error states.
 *
 * ## Return Value
 *
 * The `mutate` function returns `Promise<TData | undefined>`:
 * - On success: Returns the API response data
 * - On error: Returns `undefined` (error stored in `error` state)
 *
 * Use `isSuccess`/`isError` flags or check the return value to handle results.
 *
 * @returns MutationResult with `mutate`, status flags (`isLoading`, `isSuccess`, `isError`),
 * `data` (API response), and `error` (if failed).
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@figma-vars/hooks';
 *
 * function DeleteVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, isError, error } = useDeleteVariable();
 *
 *   const onDelete = async () => {
 *     const result = await mutate(id);
 *     if (result) {
 *       console.log('Deleted successfully');
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
