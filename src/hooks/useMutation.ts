import { useReducer, useCallback, useRef, useEffect } from 'react'
import type {
  MutationState,
  MutationResult,
  MutationOptions,
} from 'types/mutations'

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
 * Uses `useRef` to store the latest `mutationFn` to avoid recreating `mutate` on every render, following React 19.2 best practices.
 *
 * Race Condition Handling: When multiple mutations are triggered, only the most recent mutation's
 * result will update the state. Earlier mutations that complete later are ignored to prevent stale data.
 *
 * @typeParam TData - Type returned by the mutation.
 * @typeParam TPayload - Payload accepted by the mutation function.
 * @param mutationFn - Async function performing the mutation logic.
 * @param options - Optional configuration for mutation behavior.
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
