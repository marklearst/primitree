import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { BulkUpdatePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that performs a bulk update of multiple Figma variables in a single request via the Figma Variables API.
 *
 * @remarks
 * Returns a mutation object with status flags and error info.
 * Call `mutate(payload)` with a `BulkUpdatePayload` object to trigger the update—`payload` must include:
 * - `variableIds`: array of Figma variable IDs to update
 * - `variableCollectionId`: the collection context for the update
 * - `updates`: an object mapping variable IDs to their updated values or properties
 *
 * The hook throws if the Figma Personal Access Token (PAT) is missing from context.
 * Use for advanced workflows requiring atomic, multi-variable updates.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useBulkUpdateVariables } from '@figma-vars/hooks';
 *
 * function BulkUpdateComponent() {
 *   const { mutate, isLoading, isSuccess, error } = useBulkUpdateVariables();
 *
 *   const handleBulkUpdate = () => {
 *     mutate({
 *       variableIds: ['VariableID:123:456', 'VariableID:123:457'],
 *       variableCollectionId: 'VariableCollectionId:123:456',
 *       updates: {
 *         'VariableID:123:456': { name: 'Primary Color Updated' },
 *         'VariableID:123:457': { name: 'Secondary Color Updated' }
 *       }
 *     });
 *   };
 *
 *   if (!mutate) return <div>Not authorized. Figma token missing.</div>;
 *   if (isLoading) return <div>Updating variables…</div>;
 *   if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variables updated successfully!</div>;
 *
 *   return <button onClick={handleBulkUpdate}>Update All Variables</button>;
 * }
 * ```
 *
 * @public
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
