import { useFigmaTokenContext } from '../contexts/FigmaVarsProvider'
import { useMutation } from './useMutation'
import type { CreateVariablePayload } from '../types/mutations'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../constants/index'
import { mutator } from '../api/mutator'

/**
 * Creates a new variable in the Figma file.
 *
 * This hook provides a stateful API to create a new variable, returning the mutation's
 * current state including `isLoading`, `isSuccess`, `isError`, and the created data.
 *
 * @function useCreateVariable
 * @memberof Hooks
 * @since 1.0.0
 * @returns {MutationResult<any, CreateVariablePayload>} The mutation object with state and trigger function.
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma Variables API - Create Variable}
 * @see {@link useMutation} - The underlying mutation hook
 *
 * @example
 * ```tsx
 * import { useCreateVariable } from '@figma-vars/hooks';
 *
 * function VariableCreator() {
 *   const { mutate, isLoading, isSuccess, error, data } = useCreateVariable();
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
 *   if (isLoading) return <div>Creating variable...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (isSuccess) return <div>Variable created: {data?.name}</div>;
 *
 *   return <button onClick={handleCreate}>Create Variable</button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Create a string variable
 * const { mutate } = useCreateVariable();
 * 
 * mutate({
 *   name: 'Button Text',
 *   variableCollectionId: 'VariableCollectionId:123:456',
 *   resolvedType: 'STRING',
 *   description: 'Default button text content',
 *   valuesByMode: {
 *     '42:0': 'Click me'
 *   },
 *   scopes: ['TEXT_CONTENT']
 * });
 * ```
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
