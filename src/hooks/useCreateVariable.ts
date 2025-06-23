import { useFigmaTokenContext } from 'contexts/FigmaVarsProvider'
import { useMutation } from 'hooks/useMutation'
import type { CreateVariablePayload } from 'types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that creates a new Figma variable in the current file using the Figma Variables API.
 *
 * @remarks
 * Returns a mutation object with status flags and error info. To trigger creation, call `mutate(payload)` with a `CreateVariablePayload` object containing:
 * - `name`: the variable name
 * - `variableCollectionId`: target collection ID
 * - `resolvedType`: variable type
 * - `valuesByMode`: values for one or more modes
 *
 * Throws if the Figma Personal Access Token (PAT) is missing from context.
 * Use for advanced workflows, automated variable management, or custom UI tooling.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useCreateVariable } from '@figma-vars/hooks';
 *
 * function CreateVariableComponent() {
 *   const { mutate, isLoading, isSuccess, error } = useCreateVariable();
 *
 *   const handleCreate = () => {
 *     mutate({
 *       name: 'Primary Color',
 *       variableCollectionId: 'VariableCollectionId:123:456',
 *       resolvedType: 'COLOR',
 *       valuesByMode: {
 *         '42:0': { r: 0.2, g: 0.4, b: 0.8, a: 1 }
 *       }
 *     });
 *   };
 *
 *   if (isLoading) return <div>Creating variable…</div>;
 *   if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable created successfully!</div>;
 *
 *   return <button onClick={handleCreate}>Create Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useCreateVariable = () => {
  const { token } = useFigmaTokenContext()
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }
  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    return await mutator<any>(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      'POST',
      payload as unknown as Record<string, unknown>
    )
  })
  return mutation
}
