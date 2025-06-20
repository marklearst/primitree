import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import type { CreateVariablePayload } from '../types/mutations'
import { FIGMA_POST_VARIABLES_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

/**
 * Hook for creating a new Figma variable.
 *
 * This hook provides a stateful API to create a new variable in the Figma file.
 * It abstracts the logic for making the API request and managing the mutation state.
 *
 * @returns {object} An object containing the mutation state and trigger functions.
 * @property {(payload: CreateVariablePayload) => Promise<any|undefined>} mutate - Function to trigger the mutation.
 * @property {(payload: CreateVariablePayload) => Promise<any>} mutateAsync - An async version of `mutate` that will throw on error.
 * @property {any} data - The data returned from a successful mutation.
 * @property {boolean} isLoading - True if the mutation is in progress.
 * @property {boolean} isSuccess - True if the mutation was successful.
 * @property {boolean} isError - True if the mutation failed.
 * @property {Error|null} error - The error object if the mutation failed.
 *
 * @example
 * ```tsx
 * const { mutate: createVariable, isLoading, error } = useCreateVariable();
 *
 * const handleCreate = async () => {
 *   const newVariable = {
 *     name: "new-color",
 *     variableCollectionId: "VariableCollectionId:1:1",
 *     resolvedType: "COLOR"
 *   };
 *   try {
 *     const result = await createVariable(newVariable);
 *     console.log("Variable created!", result);
 *   } catch (e) {
 *     console.error("Creation failed", e);
 *   }
 * };
 * ```
 */
export const useCreateVariable = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error('A Figma API token is required.')
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
