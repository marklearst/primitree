import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useCreateVariable } from '../../src/hooks/useCreateVariable'
import * as FigmaVarsProvider from '../../src/contexts/FigmaVarsProvider'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
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

  it('should throw an error if figma token is not provided', () => {
    // Spy on the context hook and mock its return value for this test
    const spy = vi
      .spyOn(FigmaVarsProvider, 'useFigmaTokenContext')
      .mockReturnValue({ token: null, fileKey: '' })

    expect(() => renderHook(() => useCreateVariable())).toThrow(
      ERROR_MSG_TOKEN_REQUIRED
    )
    spy.mockRestore() // Clean up the spy
  })

  it('should call mutator with correct arguments and revalidate cache on success', async () => {
    mockedMutator.mockResolvedValue({ success: true })

    // Use the custom hook with our wrapper
    const { result } = renderHookWithWrapper(() => useCreateVariable())

    const payload: CreateVariablePayload = {
      name: 'new-color',
      variableCollectionId: 'VariableCollectionId:1:1',
      resolvedType: 'COLOR',
    }

    await act(async () => {
      await result.current.mutate(payload)
    })

    const expectedToken = process.env.VITE_FIGMA_TOKEN

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      FIGMA_POST_VARIABLES_ENDPOINT,
      expectedToken,
      'POST',
      payload
    )
  })

  it('should return an error state if the mutator throws an error', async () => {
    const testError = new Error('API Error')
    mockedMutator.mockRejectedValue(testError)

    const { result } = renderHookWithWrapper(() => useCreateVariable())

    await act(async () => {
      await result.current.mutate({} as CreateVariablePayload)
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error).toBe(testError)
  })
})
