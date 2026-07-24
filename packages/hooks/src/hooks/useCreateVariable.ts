import { useFigmaTokenContext } from '../contexts/useFigmaTokenContext'
import { useMutation } from './useMutation'
import type { CreateVariablePayload } from '@figmavars/core'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  mutator,
} from '@figmavars/core'

/**
 * Create a Figma variable in the provider's file.
 *
 * @remarks
 * `mutate` accepts a {@link CreateVariablePayload}. It returns the response or
 * `undefined` after storing a request failure in `error`.
 *
 * @returns Mutation state and a `mutate` function.
 *
 * @example
 * ```tsx
 * import { useCreateVariable } from '@figmavars/hooks';
 *
 * function CreateVariableButton() {
 *   const { mutate, isLoading, isError, error } = useCreateVariable();
 *
 *   const handleCreate = async () => {
 *     const result = await mutate({
 *       name: 'new-variable',
 *       variableCollectionId: 'VariableCollectionId:1:1',
 *       resolvedType: 'COLOR'
 *     });
 *     if (result) {
 *       console.log('Created variable:', result);
 *     }
 *   };
 *
 *   if (isLoading) return <div>Creating...</div>;
 *   if (isError) return <div>Error: {error?.message}</div>;
 *   return <button onClick={handleCreate}>Create Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useCreateVariable = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED)
    }
    if (!fileKey) {
      throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
    }
    return await mutator(FIGMA_FILE_VARIABLES_PATH(fileKey), token, 'CREATE', {
      variables: [
        {
          action: 'CREATE',
          ...payload,
        },
      ],
    })
  })
  return mutation
}
