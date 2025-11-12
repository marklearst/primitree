import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that deletes a Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * Returns a mutation object with status flags and error info. To trigger deletion, call `mutate(variableId)` with the variable's ID as a string.
 * Throws if the Figma Personal Access Token (PAT) is missing from context.
 * Use this for advanced workflows, admin tooling, or custom variable management UIs.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@figma-vars/hooks';
 *
 * function DeleteVariableButton({ variableId }: { variableId: string }) {
 *   const { mutate, isLoading, isSuccess, error } = useDeleteVariable();
 *
 *   const handleDelete = () => {
 *     mutate(variableId); // variableId must be a string
 *   };
 *
 *   if (!mutate) return <div>Not authorized. Figma token missing.</div>;
 *   if (isLoading) return <div>Deleting variable…</div>;
 *   if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable deleted successfully!</div>;
 *
 *   return <button onClick={handleDelete}>Delete Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useDeleteVariable = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(async (variableId: string) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    return await mutator(
      FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId),
      token,
      'DELETE',
      undefined
    )
  })
  return mutation
}
