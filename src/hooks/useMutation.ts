import { useReducer, useCallback } from 'react'
import type { MutationState, MutationResult } from 'types/mutations'

type MutationStatus = 'idle' | 'loading' | 'success' | 'error'

export function mutationReducer<TData>(
  state: MutationState<TData>,
  action: { type: MutationStatus; payload?: TData | Error }
): MutationState<TData> {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading', error: null }
    case 'success':
      return { ...state, status: 'success', data: action.payload as TData }
    case 'error':
      return { ...state, status: 'error', error: action.payload as Error }
    default:
      return state
  }
}

/**
 * @internal
 * A generic hook, inspired by `react-query`, to handle API mutations.
 * This hook is not meant to be used directly by consumers of the library.
 * Instead, specific mutation hooks (e.g., `useCreateVariable`) are built upon it.
 *
 * @template TData - The type of data returned by the mutation
 * @template TPayload - The type of payload passed to the mutation function
 * @param {(payload: TPayload) => Promise<TData>} mutationFn - The async function that performs the mutation.
 * @returns {MutationResult<TData, TPayload>} An object with the mutation state and functions to trigger it.
 */
export const useMutation = <TData, TPayload>(
  mutationFn: (payload: TPayload) => Promise<TData>
): MutationResult<TData, TPayload> => {
  const initialState: MutationState<TData> = {
    status: 'idle',
    data: null,
    error: null,
  }
  const [state, dispatch] = useReducer(mutationReducer<TData>, initialState)

  const mutate = useCallback(
    async (payload: TPayload) => {
      dispatch({ type: 'loading' })
      try {
        const result = await mutationFn(payload)
        dispatch({ type: 'success', payload: result })
        return result
      } catch (err) {
        dispatch({ type: 'error', payload: err as Error })
        return undefined
      }
    },
    [mutationFn]
  )

  return {
    mutate,
    ...state,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  }
}
