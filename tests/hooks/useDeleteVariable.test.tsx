import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useDeleteVariable } from '../../src/hooks/useDeleteVariable'
import * as FigmaTokenHook from '../../src/contexts/useFigmaTokenContext'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../../src/constants/index'

// Mock the mutator to avoid actual API calls
vi.mock('../../src/api/mutator')

const mockedMutator = mutator as Mock

describe('useDeleteVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('should return an error state if figma token is not provided', async () => {
    // Spy on the context hook and mock its return value for this test
    const spy = vi
      .spyOn(FigmaTokenHook, 'useFigmaTokenContext')
      .mockReturnValue({ token: null, fileKey: '' })

    const { result } = renderHook(() => useDeleteVariable())

    await act(async () => {
      // The error is thrown inside the mutate function, so we call it
      await result.current.mutate('some-id')
    })

    // The useMutation hook catches the error and sets the state
    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe(ERROR_MSG_TOKEN_REQUIRED)

    spy.mockRestore() // Clean up the spy
  })

  it('should call mutator with the correct arguments', async () => {
    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHookWithWrapper(() => useDeleteVariable()) as {
      result: { current: ReturnType<typeof useDeleteVariable> }
    }

    const variableId = 'VariableID:1:10'

    await act(async () => {
      await result.current.mutate(variableId)
    })

    const expectedToken = process.env.VITE_FIGMA_TOKEN
    const expectedEndpoint = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      expectedEndpoint,
      expectedToken,
      'DELETE',
      undefined
    )
  })

  it('should return an error state if the mutator throws an error', async () => {
    const testError = new Error('API Error')
    mockedMutator.mockRejectedValue(testError)

    const { result } = renderHookWithWrapper(() => useDeleteVariable()) as {
      result: { current: ReturnType<typeof useDeleteVariable> }
    }

    await act(async () => {
      await result.current.mutate('some-id')
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error).toBe(testError)
  })
})
