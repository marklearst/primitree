import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import type { CreateVariablePayload } from 'types/mutations'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that creates a new Figma variable in the current file using the Figma Variables API.
 *
 * @remarks
 * The hook returns a `mutate` function to trigger the creation along with state flags and data.
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
 * import { useCreateVariable } from '@figma-vars/hooks';
 *
 * function CreateVariableButton() {
 *   const { mutate, isLoading, isError, error } = useCreateVariable();
 *
 *   const handleCreate = async () => {
 *     const result = await mutate({
 *       name: 'new-variable',
 *       variableCollectionId: 'VariableCollectionId:1:1',
 *       resolvedType: 'COLOR'
 *     });
 *     if (result) {
 *       console.log('Created successfully:', result);
 *     }
 *   };
 *
 *   if (isLoading) return <div>Creating...</div>;
 *   if (isError) return <div>Error: {error?.message}</div>;
 *   return <button onClick={handleCreate}>Create Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useCreateVariable = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    if (!fileKey) {
      throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
    }
    return await mutator(FIGMA_FILE_VARIABLES_PATH(fileKey), token, 'CREATE', {
      variables: [
        {
          action: 'CREATE',
          ...payload,
        },
      ],
    })
  })
  return mutation
}
