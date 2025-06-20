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
 * A hook for performing a bulk update of Figma variables.
 *
 * This hook provides a `mutate` function to trigger the bulk update.
 * It handles the loading, error, and data states of the mutation.
 *
 * @returns An object containing the mutation function and the current state of the mutation.
 *
 * @example
 * ```tsx
 * const { mutate, isLoading, error } = useBulkUpdateVariables();
 *
 * const handleBulkUpdate = (fileKey: string, payload: BulkUpdatePayload) => {
 *   mutate({ fileKey, payload });
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
