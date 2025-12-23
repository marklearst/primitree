import { useReducer, useCallback } from 'react'
import type { MutationState, MutationResult } from 'types/mutations'

type MutationStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Internal reducer to manage async mutation state for all mutation hooks.
 *
 * @remarks
 * Handles mutation status transitions (`loading`, `success`, `error`) and enforces consistent error/data handling across the library.
 * Used by {@link useMutation} and not intended for direct use in external code.
 *
 * @typeParam TData - The type of data returned by the mutation.
 *
 * @example
 * ```ts
 * import { mutationReducer } from '@figma-vars/hooks';
 * const [state, dispatch] = useReducer(mutationReducer, initialState);
 * // Internal pattern for mutation state management
 * ```
 *
 * @internal
 */
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
 * Internal React hook for async mutation state, status flags, and mutation trigger.
 *
 * @remarks
 * Returns a mutation object with status, error, and result data. Preferred pattern: use higher-level hooks (e.g., `useCreateVariable`, `useUpdateVariable`) rather than using this directly in production code.
 * The provided `mutationFn` must be an async function that performs the actual mutation (API call, etc). See example for pattern.
 *
 * @typeParam TData - Type returned by the mutation.
 * @typeParam TPayload - Payload accepted by the mutation function.
 * @param mutationFn - Async function performing the mutation logic.
 * @returns Mutation state, status flags, and a `mutate(payload)` trigger function.
 *
 * @example
 * ```ts
 * import { useMutation } from '@figma-vars/hooks';
 *
 * // Example: use for custom async logic
 * const { mutate, isLoading, isSuccess, error } = useMutation(async (payload: MyPayload) => {
 *   // Your async mutation logic here (e.g., API call)
 *   return result;
 * });
 *
 * // Call mutate(payload) to trigger the mutation.
 * ```
 *
 * @internal
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
