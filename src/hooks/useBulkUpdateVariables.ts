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
 * @returns {object} The mutation object.
 * @property {Function} mutate - The function to trigger the bulk update. It takes the bulk update payload as an argument.
 * @property {boolean} isLoading - True if the mutation is currently in flight.
 * @property {boolean} isSuccess - True if the mutation has completed successfully.
 * @property {boolean} isError - True if the mutation has failed.
 * @property {object} data - The data returned from the successful mutation.
 * @property {Error} error - The error object if the mutation fails.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading } = useBulkUpdateVariables();
 *
 * const handleBulkUpdate = () => {
 *   mutate({
 *     variableIds: ["VariableID:1:2", "VariableID:1:3"],
 *     variableCollectionId: "VariableCollectionId:1:1",
 *     valuesByMode: { "2:1": { r: 0, g: 0, b: 1, a: 1 } }
 *   });
 * };
 *
 * return (
 *   <button onClick={handleBulkUpdate} disabled={isLoading}>
 *     {isLoading ? 'Updating all...' : 'Bulk Update Variables'}
 *   </button>
 * );
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
