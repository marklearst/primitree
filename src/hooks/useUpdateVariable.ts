import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import type { UpdateVariablePayload } from 'types/mutations'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

type UpdateVariableArgs = {
  variableId: string
  payload: UpdateVariablePayload
}

/**
 * Hook for updating an existing Figma variable.
 *
 * This hook provides a stateful API to update a variable in the Figma file.
 * It abstracts the logic for making the API request and managing the mutation state.
 *
 * @returns {object} An object containing the mutation state and trigger functions.
 * @property {(args: UpdateVariableArgs) => Promise<void|undefined>} mutate - Function to trigger the mutation.
 * @property {(args: UpdateVariableArgs) => Promise<void>} mutateAsync - An async version of `mutate` that will throw on error.
 * @property {undefined} data - Should be undefined for an update operation.
 * @property {boolean} isLoading - True if the mutation is in progress.
 * @property {boolean} isSuccess - True if the mutation was successful.
 * @property {boolean} isError - True if the mutation failed.
 * @property {Error|null} error - The error object if the mutation failed.
 *
 * @example
 * ```tsx
 * const { mutate: updateVariable, isLoading } = useUpdateVariable();
 *
 * const handleUpdate = async (id: string, data: UpdateVariablePayload) => {
 *   try {
 *     await updateVariable({ variableId: id, payload: data });
 *     console.log("Variable updated!");
 *   } catch (e) {
 *     console.error("Update failed", e);
 *   }
 * };
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
