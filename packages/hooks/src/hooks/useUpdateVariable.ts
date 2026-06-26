import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { useMutation } from './useMutation'
import type { UpdateVariablePayload } from '@figmavars/core'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  mutator,
} from '@figmavars/core'

/**
 * Update a Figma variable in the provider's file.
 *
 * @remarks
 * `mutate` accepts a variable ID and {@link UpdateVariablePayload}. It returns
 * the response or `undefined` after storing a request failure in `error`.
 *
 * @returns Mutation state and a `mutate` function.
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figmavars/hooks';
 *
 * function UpdateVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, isError, error } = useUpdateVariable();
 *
 *   const onUpdate = async () => {
 *     const result = await mutate({ variableId: id, payload: { name: 'new-name' } });
 *     if (result) {
 *       console.log('Updated variable');
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
