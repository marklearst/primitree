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
 * A hook for updating a Figma variable.
 *
 * This hook provides a `mutate` function to trigger the update of a variable.
 * It handles the loading, error, and data states of the mutation.
 *
 * @returns An object containing the mutation function and the current state of the mutation.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading, error } = useUpdateVariable();
 *
 * const handleUpdateVariable = (variableId: string, payload: UpdateVariablePayload) => {
 *   mutate({ variableId, payload });
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
