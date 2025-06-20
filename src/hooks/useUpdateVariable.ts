import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { UpdateVariablePayload } from 'types/mutations'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from 'constants/index'
import { mutator } from 'api/mutator'

type UpdateVariableArgs = {
  variableId: string
  payload: UpdateVariablePayload
}

/**
 * Updates an existing Figma variable.
 *
 * This hook provides a stateful API to update a variable, returning the mutation's
 * current state including `isLoading`, `isSuccess`, `isError`, and the updated data.
 *
 * @returns {object} The mutation object.
 * @property {Function} mutate - The function to trigger the variable update. It takes the variable payload as an argument.
 * @property {boolean} isLoading - True if the mutation is currently in flight.
 * @property {boolean} isSuccess - True if the mutation has completed successfully.
 * @property {boolean} isError - True if the mutation has failed.
 * @property {object} data - The data returned from the successful mutation.
 * @property {Error} error - The error object if the mutation fails.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading } = useUpdateVariable();
 *
 * const handleUpdate = () => {
 *   mutate({
 *     id: "VariableID:1:2",
 *     name: "updated-brand-color",
 *     resolvedType: "COLOR",
 *     valuesByMode: { "2:1": { r: 0, g: 1, b: 0, a: 1 } }
 *   });
 * };
 *
 * return (
 *   <button onClick={handleUpdate} disabled={isLoading}>
 *     {isLoading ? 'Updating...' : 'Update Variable'}
 *   </button>
 * );
 * ```
 */
export const useUpdateVariable = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(
    async ({ variableId, payload }: UpdateVariableArgs) => {
      if (!token) {
        throw new Error('A Figma API token is required.')
      }
      const url = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)
      return await mutator(
        url,
        token,
        'PUT',
        payload as unknown as Record<string, unknown>
      )
    }
  )

  return mutation
}
