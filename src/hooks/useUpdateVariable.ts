import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import type { UpdateVariablePayload } from 'types/mutations'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that updates an existing Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * The hook returns a `mutate` function to trigger the update with given payload and exposes state flags.
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
 * import { useUpdateVariable } from '@figma-vars/hooks';
 *
 * function UpdateVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, isError, error } = useUpdateVariable();
 *
 *   const onUpdate = async () => {
 *     const result = await mutate({ variableId: id, payload: { name: 'new-name' } });
 *     if (result) {
 *       console.log('Updated successfully');
 *     }
 *   };
 *
 *   if (isLoading) return <div>Updating...</div>;
 *   if (isError) return <div>Error: {error?.message}</div>;
 *   return <button onClick={onUpdate}>Update Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useUpdateVariable = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(
    async ({
      variableId,
      payload,
    }: {
      variableId: string
      payload: UpdateVariablePayload
    }) => {
      if (!token) {
        throw new Error(ERROR_MSG_TOKEN_REQUIRED)
      }
      if (!fileKey) {
        throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
      }
      return await mutator(
        FIGMA_FILE_VARIABLES_PATH(fileKey),
        token,
        'UPDATE',
        {
          variables: [
            {
              action: 'UPDATE',
              id: variableId,
              ...payload,
            },
          ],
        }
      )
    }
  )
  return mutation
}
