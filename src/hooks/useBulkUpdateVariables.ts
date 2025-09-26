import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { BulkUpdatePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * Updates multiple variables in the Figma file in a single request.
 *
 * This hook provides a stateful API to perform a bulk update, returning the mutation's
 * current state including `isLoading`, `isSuccess`, and `isError`.
 *
 * @function useBulkUpdateVariables
 * @memberof Hooks
 * @since 1.0.0
 * @returns {MutationResult<any, BulkUpdatePayload>} The mutation object with state and trigger function.
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma Variables API - Bulk Update Variables}
 * @see {@link useMutation} - The underlying mutation hook
 *
 * @example
 * ```tsx
 * import { useBulkUpdateVariables } from '@figma-vars/hooks';
 *
 * function BulkVariableEditor() {
 *   const { mutate, isLoading, isSuccess, error } = useBulkUpdateVariables();
 *
 *   const handleBulkUpdate = () => {
 *     mutate({
 *       variableIds: ['VariableID:123:456', 'VariableID:123:457'],
 *       variableCollectionId: 'VariableCollectionId:123:456',
 *       updates: {
 *         'VariableID:123:456': {
 *           name: 'Primary Color Updated',
 *           description: 'Updated primary brand color'
 *         },
 *         'VariableID:123:457': {
 *           name: 'Secondary Color Updated',
 *           description: 'Updated secondary brand color'
 *         }
 *       }
 *     });
 *   };
 *
 *   if (isLoading) return <div>Updating variables...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variables updated successfully!</div>;
 *
 *   return <button onClick={handleBulkUpdate}>Update All Variables</button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Bulk update color variables with new values
 * const { mutate } = useBulkUpdateVariables();
 * 
 * mutate({
 *   variableIds: ['VariableID:123:456', 'VariableID:123:457'],
 *   variableCollectionId: 'VariableCollectionId:123:456',
 *   updates: {
 *     'VariableID:123:456': {
 *       valuesByMode: {
 *         '42:0': { r: 0.2, g: 0.4, b: 0.8, a: 1 }
 *       }
 *     },
 *     'VariableID:123:457': {
 *       valuesByMode: {
 *         '42:0': { r: 0.8, g: 0.4, b: 0.2, a: 1 }
 *       }
 *     }
 *   }
 * });
 * ```
 */
export const useBulkUpdateVariables = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(async (payload: BulkUpdatePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator<any>(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      'PUT',
      payload as unknown as Record<string, unknown>
    )
  })

  return mutation
}
