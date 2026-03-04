import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import type { BulkUpdatePayload } from 'types/mutations'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that performs a bulk update of multiple Figma variables in a single request via the Figma Variables API.
 *
 * @remarks
 * This hook is designed to perform a batch operation for creating, updating, and deleting variables, collections, and modes.
 * It provides an ergonomic API with `mutate` and loading/error state for easy integration.
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
 * import { useBulkUpdateVariables } from '@figma-vars/hooks';
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
