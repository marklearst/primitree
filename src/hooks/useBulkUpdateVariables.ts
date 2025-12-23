import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import type { BulkUpdatePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that performs a bulk update of multiple Figma variables in a single request via the Figma Variables API.
 *
 * @remarks
 * This hook is designed to perform a batch operation for creating, updating, and deleting variables, collections, and modes.
 * It provides an ergonomic API with `mutate` and loading/error state for easy integration.
 *
 * @example
 * ```tsx
 * import { useBulkUpdateVariables } from '@figma-vars/hooks';
 *
 * function BulkUpdateButton() {
 *   const { mutate, isLoading, error } = useBulkUpdateVariables();
 *
 *   const handleBulkUpdate = () => {
 *     mutate({
 *       variables: [{ action: 'UPDATE', id: 'VariableId:123', name: 'new-name' }],
 *     });
 *   };
 *
 *   if (isLoading) return <div>Updating...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <button onClick={handleBulkUpdate}>Bulk Update</button>;
 * }
 * ```
 *
 * @public
 */
export const useBulkUpdateVariables = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(async (payload: BulkUpdatePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      'CREATE',
      payload as unknown as Record<string, unknown>
    )
  })
  return mutation
}
