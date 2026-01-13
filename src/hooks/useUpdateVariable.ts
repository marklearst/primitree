import { useFigmaTokenContext } from 'contexts/useFigmaTokenContext'
import { useMutation } from 'hooks/useMutation'
import type { UpdateVariablePayload } from 'types/mutations'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from 'constants/index'
import { mutator } from 'api/mutator'

/**
 * React hook that updates an existing Figma variable by ID using the Figma Variables API.
 *
 * @remarks
 * The hook returns a `mutate` function to trigger the update with given payload and exposes state flags.
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figma-vars/hooks';
 *
 * function UpdateVariableButton({ id }: { id: string }) {
 *   const { mutate, isLoading, error } = useUpdateVariable();
 *
 *   const onUpdate = () => mutate({ variableId: id, payload: { name: 'new-name' } });
 *
 *   if (isLoading) return <div>Updating...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <button onClick={onUpdate}>Update Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useUpdateVariable = () => {
  const { token, fileKey } = useFigmaTokenContext()
  const mutation = useMutation(
    async ({
      variableId,
      payload,
    }: {
      variableId: string
      payload: UpdateVariablePayload
    }) => {
      if (!token) {
        throw new Error(ERROR_MSG_TOKEN_REQUIRED)
      }
      if (!fileKey) {
        throw new Error(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED)
      }
      return await mutator(
        FIGMA_FILE_VARIABLES_PATH(fileKey),
        token,
        'UPDATE',
        {
          variables: [
            {
              action: 'UPDATE',
              id: variableId,
              ...payload,
            },
          ],
        } as unknown as Record<string, unknown>
      )
    }
  )
  return mutation
}
