import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'
import { useMutation } from './useMutation'
import type { BulkUpdatePayload } from 'types/mutations'
import { FIGMA_VARIABLES_ENDPOINT } from '../constants'
import { mutator } from '../api/mutator'

type BulkUpdateVariablesArgs = {
  fileKey: string
  payload: BulkUpdatePayload
}

/**
 * Hook for performing a bulk update of Figma variables.
 *
 * This hook provides a stateful API to create, update, or delete multiple variables
 * in a single API call. It abstracts the logic for making the API request and managing the mutation state.
 *
 * @returns {object} An object containing the mutation state and trigger functions.
 * @property {(args: BulkUpdateVariablesArgs) => Promise<any|undefined>} mutate - Function to trigger the mutation.
 * @property {(args: BulkUpdateVariablesArgs) => Promise<any>} mutateAsync - An async version of `mutate` that will throw on error.
 * @property {any} data - The metadata returned from a successful mutation.
 * @property {boolean} isLoading - True if the mutation is in progress.
 * @property {boolean} isSuccess - True if the mutation was successful.
 * @property {boolean} isError - True if the mutation failed.
 * @property {Error|null} error - The error object if the mutation failed.
 *
 * @see https://www.figma.com/developers/api#post-variables-v1
 *
 * @example
 * ```tsx
 * const { mutate: bulkUpdate, isLoading } = useBulkUpdateVariables();
 *
 * const handleBulkUpdate = async (fileKey: string, payload: BulkUpdatePayload) => {
 *   try {
 *     const result = await bulkUpdate({ fileKey, payload });
 *     console.log("Bulk update successful!", result);
 *   } catch (e) {
 *     console.error("Bulk update failed", e);
 *   }
 * };
 * ```
 */
export const useBulkUpdateVariables = () => {
  const { token } = useFigmaTokenContext()

  const mutation = useMutation(
    async ({ fileKey, payload }: BulkUpdateVariablesArgs) => {
      if (!token) {
        throw new Error('A Figma API token is required.')
      }
      const url = FIGMA_VARIABLES_ENDPOINT(fileKey)
      return await mutator(
        url,
        token,
        'POST',
        payload as unknown as Record<string, unknown>
      )
    }
  )

  return mutation
}
