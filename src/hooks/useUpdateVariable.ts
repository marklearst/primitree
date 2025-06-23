import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { UpdateVariableArgs } from 'types/hooks'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that updates a Figma variable by its ID via the Figma Variables API.
 *
 * @remarks
 * Returns a mutation object with status flags, error info, and a trigger function. Call `mutate({ variableId, payload })` to update a variable—provide the target variable's ID and the update payload.
 * Throws if the Figma Personal Access Token (PAT) is missing from context.
 * Use for advanced UI tooling or bulk edit workflows.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figma-vars/hooks';
 *
 * function UpdateVariableButton({ variableId }: { variableId: string }) {
 *   const { mutate, isLoading, isSuccess, error } = useUpdateVariable();
 *
 *   const handleUpdate = () => {
 *     mutate({
 *       variableId,
 *       payload: {
 *         name: 'Updated Name',
 *         description: 'Updated description',
 *       },
 *     });
 *   };
 *
 *   if (!mutate) return <div>Not authorized. Figma token missing.</div>;
 *   if (isLoading) return <div>Updating variable…</div>;
 *   if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable updated successfully!</div>;
 *
 *   return <button onClick={handleUpdate}>Update Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useUpdateVariable = () => {
  const { token } = useFigmaTokenContext()
  const mutation = useMutation(
    async ({ variableId, payload }: UpdateVariableArgs) => {
      if (!token) {
        throw new Error(ERROR_MSG_TOKEN_REQUIRED)
      }
      const url = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)
      return await mutator(
        url,
        token,
        'UPDATE',
        payload as unknown as Record<string, unknown>
      )
    }
  )

  return mutation
}
