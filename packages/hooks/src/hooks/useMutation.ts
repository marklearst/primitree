import { useReducer, useCallback, useRef, useEffect } from 'react'
import type {
  MutationState,
  MutationResult,
  MutationOptions,
} from '@primitree/core'

type MutationStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Reduce async mutation state for mutation hooks.
 *
 * @remarks
 * Handles `loading`, `success`, and `error` transitions.
 * {@link useMutation} calls this reducer.
 *
 * @typeParam TData - Mutation result data.
 *
 * @example
 * ```ts
 * import { mutationReducer } from '@primitree/hooks';
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
 * Track async mutation state and expose a mutation trigger.
 *
 * @remarks
 * Returns status, error, result data, and `mutate`.
 * The hook stores the current callback in a ref.
 * The latest request updates state; earlier requests leave state unchanged.
 *
 * @typeParam TData - Mutation result data.
 * @typeParam TPayload - Payload passed to the mutation function.
 * @param mutationFn - Async function that performs the mutation.
 * @param options - Mutation configuration.
 * @returns State, status flags, and a `mutate(payload)` function.
 *
 * @example
 * ```ts
 * import { useMutation } from '@primitree/hooks';
 *
 * // Example: use for custom async logic
 * const { mutate, isLoading, isSuccess, error } = useMutation(async (payload: MyPayload) => {
 *   // Your async mutation logic here (e.g., API call)
 *   return result;
 * });
 *
 * // With error rethrowing enabled:
 * const { mutate } = useMutation(async (payload) => result, { throwOnError: true });
 * try {
 *   await mutate(payload);
 * } catch (error) {
 *   // Handle error
 * }
 * ```
 *
 * @internal
 */
export const useMutation = <TData, TPayload>(
  mutationFn: (payload: TPayload) => Promise<TData>,
  options?: MutationOptions
): MutationResult<TData, TPayload> => {
  const { throwOnError = false } = options ?? {}
  const initialState: MutationState<TData> = {
    status: 'idle',
    data: null,
    error: null,
  }
  const [state, dispatch] = useReducer(mutationReducer<TData>, initialState)

  // Store the latest mutationFn and options in refs to avoid recreating mutate on every render
  const mutationFnRef = useRef(mutationFn)
  const optionsRef = useRef({ throwOnError })
  const isMountedRef = useRef(true)
  // Track the current mutation ID to handle race conditions
  const mutationIdRef = useRef(0)

  // Update the refs when they change
  useEffect(() => {
    mutationFnRef.current = mutationFn
    optionsRef.current = { throwOnError }
  }, [mutationFn, throwOnError])

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const mutate = useCallback(
    async (payload: TPayload) => {
      if (!isMountedRef.current) {
        return undefined
      }

      // Increment mutation ID to track this specific mutation
      const currentMutationId = ++mutationIdRef.current

      dispatch({ type: 'loading' })
      try {
        const result = await mutationFnRef.current(payload)
        // Only update state if:
        // 1. Component is still mounted
        // 2. This is still the latest mutation (no newer mutation has started)
        if (
          isMountedRef.current &&
          currentMutationId === mutationIdRef.current
        ) {
          dispatch({ type: 'success', payload: result })
        }
        return result
      } catch (err) {
        const error = err as Error
        // Only update state if this is still the latest mutation
        if (
          isMountedRef.current &&
          currentMutationId === mutationIdRef.current
        ) {
          dispatch({ type: 'error', payload: error })
        }
        // Rethrow error if throwOnError is enabled
        if (optionsRef.current.throwOnError) {
          throw error
        }
        return undefined
      }
    },
    [] // Empty deps array - mutationFn and options are accessed via refs
  )

  return {
    mutate,
    ...state,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  }
}
