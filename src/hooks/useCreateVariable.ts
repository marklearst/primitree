import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { CreateVariablePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * Creates a new variable in the Figma file.
 *
 * This hook provides a stateful API to create a new variable, returning the mutation's
 * current state including `isLoading`, `isSuccess`, `isError`, and the created data.
 *
 * @returns {object} The mutation object.
 * @property {Function} mutate - The function to trigger the variable creation. It takes the variable payload as an argument.
 * @property {boolean} isLoading - True if the mutation is currently in flight.
 * @property {boolean} isSuccess - True if the mutation has completed successfully.
 * @property {boolean} isError - True if the mutation has failed.
 * @property {object} data - The data returned from the successful mutation.
 * @property {Error} error - The error object if the mutation fails.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading, isSuccess } = useCreateVariable();
 *
 * const handleCreate = () => {
 *   mutate({
 *     name: "new-brand-color",
 *     collectionId: "VariableCollectionId:1:1",
 *     resolvedType: "COLOR",
 *     valuesByMode: { "2:1": { r: 1, g: 0, b: 0, a: 1 } }
 *   });
 * };
 *
 * return (
 *   <button onClick={handleCreate} disabled={isLoading}>
 *     {isLoading ? 'Creating...' : 'Create Variable'}
 *   </button>
 * );
 * ```
 */
export const useCreateVariable = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator<any>(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      'POST',
      payload as unknown as Record<string, unknown>
    )
  })
  return mutation
}
