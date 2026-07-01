import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { useMutation } from './useMutation'
import type { BulkUpdatePayload } from '@primitree/core'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  mutator,
} from '@primitree/core'

/**
 * Create, update, or delete Figma collections, modes, and variables in one request.
 *
 * @remarks
 * `mutate` accepts a {@link BulkUpdatePayload}. It returns the response or
 * `undefined` after storing a request failure in `error`.
 *
 * @returns Mutation state and a `mutate` function.
 *
 * @example
 * ```tsx
 * import { useBulkUpdateVariables } from '@primitree/hooks';
 *
 * function BulkUpdateButton() {
 *   const { mutate, isLoading, isError, error } = useBulkUpdateVariables();
 *
 *   const handleBulkUpdate = async () => {
 *     const result = await mutate({
 *       variables: [{ action: 'UPDATE', id: 'VariableId:123', name: 'new-name' }],
 *     });
 *     if (result) {
 *       console.log('Bulk update successful');
 *     }
 *   };
 *
 *   if (isLoading) return <div>Updating...</div>;
 *   if (isError) return <div>Error: {error?.message}</div>;
 *   return <button onClick={handleBulkUpdate}>Bulk Update</button>;
 * }
 * ```
 *
 * @public
 */
export const useBulkUpdateVariables = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(async (payload: BulkUpdatePayload) => {
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
      payload
    )
  })
  return mutation
}
