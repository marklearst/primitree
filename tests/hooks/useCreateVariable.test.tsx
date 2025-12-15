import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useCreateVariable } from '../../src/hooks/useCreateVariable'
import * as FigmaTokenHook from '../../src/contexts/useFigmaTokenContext'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from '../../src/constants/index'
import type { CreateVariablePayload } from '../../src/types/mutations'

// Mock the mutator to avoid actual API calls
vi.mock('../../src/api/mutator')

const mockedMutator = mutator as Mock

describe('useCreateVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks() // ensure spies are restored
  })

  it('should return an error state if figma fileKey is not provided', async () => {
    const spy = vi
      .spyOn(FigmaTokenHook, 'useFigmaTokenContext')
      .mockReturnValue({ token: 'test-token', fileKey: null })

    const { result } = renderHook(() => useCreateVariable())

    await act(async () => {
      await result.current.mutate({} as CreateVariablePayload)
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

    const { result } = renderHook(() => useCreateVariable())

    await act(async () => {
      // The error is thrown inside the mutate function, so we call it
      await result.current.mutate({} as CreateVariablePayload)
    })

    // The useMutation hook catches the error and sets the state
    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe(ERROR_MSG_TOKEN_REQUIRED)

    spy.mockRestore() // Clean up the spy
  })

  it('should call mutator with correct arguments and revalidate cache on success', async () => {
    mockedMutator.mockResolvedValue({ success: true })

    // Use the custom hook with our wrapper
    const { result } = renderHookWithWrapper(() => useCreateVariable()) as {
      result: { current: ReturnType<typeof useCreateVariable> }
    }

    const payload: CreateVariablePayload = {
      name: 'new-color',
      variableCollectionId: 'VariableCollectionId:1:1',
      resolvedType: 'COLOR',
    }

    await act(async () => {
      await result.current.mutate(payload)
    })

    const expectedToken = process.env.VITE_FIGMA_TOKEN
    const expectedFileKey = process.env.VITE_FIGMA_FILE_KEY

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      FIGMA_FILE_VARIABLES_PATH(expectedFileKey!),
      expectedToken,
      'CREATE',
      {
        variables: [
          {
            action: 'CREATE',
            ...payload,
          },
        ],
      }
    )
  })

  it('should return an error state if the mutator throws an error', async () => {
    const testError = new Error('API Error')
    mockedMutator.mockRejectedValue(testError)

    const { result } = renderHookWithWrapper(() => useCreateVariable()) as {
      result: { current: ReturnType<typeof useCreateVariable> }
    }

    await act(async () => {
      await result.current.mutate({} as CreateVariablePayload)
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error).toBe(testError)
  })
})
