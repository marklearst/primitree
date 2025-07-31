import { useState, useCallback } from 'react'

type MutationStatus = 'idle' | 'loading' | 'success' | 'error'

interface UseMutationResult<TData, TError, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | undefined>
  mutateAsync: (variables: TVariables) => Promise<TData>
  status: MutationStatus
  data: TData | undefined
  error: TError | null
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
}

type MutationFn<TData, TVariables> = (variables: TVariables) => Promise<TData>

/**
 * @internal
 * A generic hook, inspired by `react-query`, to handle API mutations.
 * This hook is not meant to be used directly by consumers of the library.
 * Instead, specific mutation hooks (e.g., `useCreateVariable`) are built upon it.
 *
 * @param mutationFn The async function that performs the mutation.
 * @returns An object with the mutation state and functions to trigger it.
 */
export const useMutation = <TData = unknown, TError = Error, TVariables = void>(
  mutationFn: MutationFn<TData, TVariables>
): UseMutationResult<TData, TError, TVariables> => {
  const [status, setStatus] = useState<MutationStatus>('idle')
  const [data, setData] = useState<TData | undefined>()
  const [error, setError] = useState<TError | null>(null)

  const mutate = useCallback(
    async (variables: TVariables) => {
      setStatus('loading')
      try {
        const result = await mutationFn(variables)
        setData(result)
        setStatus('success')
        setError(null)
        return result
      } catch (e) {
        setError(e as TError)
        setStatus('error')
        // We return undefined here because we don't want to throw
        // and let the caller handle the error state via the `isError` and `error` properties.
        return undefined
      }
    },
    [mutationFn]
  )

  const mutateAsync = useCallback(
    async (variables: TVariables) => {
      setStatus('loading')
      try {
        const result = await mutationFn(variables)
        setData(result)
        setStatus('success')
        setError(null)
        return result
      } catch (e) {
        setError(e as TError)
        setStatus('error')
        throw e
      }
    },
    [mutationFn]
  )

  const isLoading = status === 'loading'
  const isSuccess = status === 'success'
  const isError = status === 'error'

  return {
    mutate,
    mutateAsync,
    status,
    data,
    error,
    isLoading,
    isSuccess,
    isError,
  }
}
