import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useDeleteVariable } from '../../src/hooks/useDeleteVariable'
import * as FigmaTokenHook from '../../src/contexts/useFigmaTokenContext'
import { mutator } from '../../src/api/mutator'
import {
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  FIGMA_FILE_VARIABLES_PATH,
} from '../../src/constants/index'

// Mock the mutator to avoid actual API calls
vi.mock('../../src/api/mutator')

const mockedMutator = mutator as Mock

describe('useDeleteVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('should return an error state if figma fileKey is not provided', async () => {
    const spy = vi
      .spyOn(FigmaTokenHook, 'useFigmaTokenContext')
      .mockReturnValue({ token: 'test-token', fileKey: null })

    const { result } = renderHook(() => useDeleteVariable())

    await act(async () => {
      await result.current.mutate('some-id')
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe(
      ERROR_MSG_TOKEN_FILE_KEY_REQUIRED
    )

    spy.mockRestore()
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
    const expectedFileKey = process.env.VITE_FIGMA_FILE_KEY

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      FIGMA_FILE_VARIABLES_PATH(expectedFileKey!),
      expectedToken,
      'DELETE',
      {
        variables: [
          {
            action: 'DELETE',
            id: variableId,
          },
        ],
      }
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
