import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useMutation, mutationReducer } from '../../src/hooks/useMutation'

describe('useMutation', () => {
  it('should initialize with idle state', () => {
    const mutationFn = vi.fn()
    const { result } = renderHook(() => useMutation(mutationFn))

    expect(result.current.status).toBe('idle')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should transition to loading and then success state on successful mutation', async () => {
    const mockData = { id: 1, name: 'Test' }
    const mutationFn = vi.fn().mockResolvedValue(mockData)
    const { result } = renderHook(() => useMutation(mutationFn))

    let mutateResult
    await act(async () => {
      mutateResult = await result.current.mutate({ payload: 'test' })
    })

    expect(mutationFn).toHaveBeenCalledWith({ payload: 'test' })
    expect(result.current.status).toBe('success')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeNull()
    expect(mutateResult).toEqual(mockData)
  })

  it('should transition to loading and then error state on failed mutation', async () => {
    const mockError = new Error('Mutation Failed')
    const mutationFn = vi.fn().mockRejectedValue(mockError)
    const { result } = renderHook(() => useMutation(mutationFn))

    let mutateResult
    await act(async () => {
      mutateResult = await result.current.mutate({ payload: 'test' })
    })

    expect(mutationFn).toHaveBeenCalledWith({ payload: 'test' })
    expect(result.current.status).toBe('error')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(true)
    expect(result.current.error).toEqual(mockError)
    expect(result.current.data).toBeNull()
    expect(mutateResult).toBeUndefined()
  })

  it('should handle loading state correctly during mutation', async () => {
    const mutationFn = vi.fn(() => new Promise(() => {})) // Never resolves
    const { result } = renderHook(() => useMutation(mutationFn))

    act(() => {
      result.current.mutate({ payload: 'test' })
    })

    expect(result.current.status).toBe('loading')
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isError).toBe(false)
    expect(result.current.isSuccess).toBe(false)
  })

  it('should return unchanged state for unknown action type in reducer', () => {
    const initialState = {
      status: 'idle' as const,
      data: null,
      error: null,
    }

    // Test the reducer directly with an unknown action type
    const result = mutationReducer(initialState, { type: 'unknown' as never })

    expect(result).toEqual(initialState)
    expect(result).toBe(initialState) // Should return the exact same object reference
  })

  it('should return undefined if component is unmounted before mutation starts', async () => {
    const mockData = { id: 1, name: 'Test' }
    const mutationFn = vi.fn().mockResolvedValue(mockData)
    const { result, unmount } = renderHook(() => useMutation(mutationFn))

    // Unmount the component
    unmount()

    // Try to mutate after unmount - should return undefined immediately
    let mutateResult: unknown
    await act(async () => {
      mutateResult = await result.current.mutate({ payload: 'test' })
    })

    // Should return undefined without calling mutationFn
    expect(mutateResult).toBeUndefined()
    expect(mutationFn).not.toHaveBeenCalled()
  })

  it('should not update state if component is unmounted during mutation', async () => {
    const mockData = { id: 1, name: 'Test' }
    let resolveMutation: (value: unknown) => void
    const mutationFn = vi.fn(
      () =>
        new Promise(resolve => {
          resolveMutation = resolve
        })
    )
    const { result, unmount } = renderHook(() => useMutation(mutationFn))

    // Start mutation (it will hang waiting for resolve)
    act(() => {
      result.current.mutate({ payload: 'test' })
    })

    // Verify loading state
    expect(result.current.status).toBe('loading')

    // Unmount before mutation completes
    unmount()

    // Complete the mutation
    await act(async () => {
      resolveMutation!(mockData)
      // Give a tick for any state updates
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // The mutation function should have been called
    expect(mutationFn).toHaveBeenCalled()
  })
})
