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
 * @function useUpdateVariable
 * @memberof Hooks
 * @since 1.0.0
 * @returns {MutationResult<any, UpdateVariableArgs>} The mutation object with state and trigger function.
 * @see {@link https://www.figma.com/developers/api#put-variables|Figma Variables API - Update Variable}
 * @see {@link useMutation} - The underlying mutation hook
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figma-vars/hooks';
 *
 * function VariableEditor() {
 *   const { mutate, isLoading, isSuccess, error } = useUpdateVariable();
 *
 *   const handleUpdate = () => {
 *     mutate({
 *       variableId: 'VariableID:123:456',
 *       payload: {
 *         name: 'Updated Variable Name',
 *         description: 'Updated description'
 *       }
 *     });
 *   };
 *
 *   if (isLoading) return <div>Updating variable...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable updated successfully!</div>;
 *
 *   return <button onClick={handleUpdate}>Update Variable</button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Update variable with new values
 * const { mutate } = useUpdateVariable();
 * 
 * mutate({
 *   variableId: 'VariableID:123:456',
 *   payload: {
 *     name: 'Primary Color',
 *     description: 'Main brand color',
 *     valuesByMode: {
 *       '42:0': { r: 0.2, g: 0.4, b: 0.8, a: 1 }
 *     }
 *   }
 * });
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
