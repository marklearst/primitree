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
