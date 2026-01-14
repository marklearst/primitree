import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useBulkUpdateVariables } from '../../src/hooks/useBulkUpdateVariables'
import { useFigmaTokenContext } from '../../src/contexts/useFigmaTokenContext'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_FILE_VARIABLES_PATH,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
} from '../../src/constants/index'
import type { BulkUpdatePayload } from '../../src/types/mutations'

// Mock dependencies
vi.mock('../../src/contexts/useFigmaTokenContext')
vi.mock('../../src/api/mutator')

const mockedUseFigmaTokenContext = useFigmaTokenContext as Mock
const mockedMutator = mutator as Mock

describe('useBulkUpdateVariables', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should set error if figma token is not provided', async () => {
    mockedUseFigmaTokenContext.mockReturnValue({
      token: null,
      fileKey: 'test-key',
    })
    const { result } = renderHook(() => useBulkUpdateVariables())
    await act(async () => {
      result.current.mutate({} as BulkUpdatePayload)
    })
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe(ERROR_MSG_TOKEN_REQUIRED)
  })

  it('should set error if fileKey is not provided', async () => {
    mockedUseFigmaTokenContext.mockReturnValue({
      token: 'test-token',
      fileKey: null,
    })
    const { result } = renderHook(() => useBulkUpdateVariables())
    await act(async () => {
      result.current.mutate({} as BulkUpdatePayload)
    })
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe(
      ERROR_MSG_TOKEN_FILE_KEY_REQUIRED
    )
  })

  it('should call mutator with correct arguments', async () => {
    const mockToken = 'test-token'
    const mockFileKey = 'test-key'
    const payload: BulkUpdatePayload = {
      variables: [
        {
          action: 'UPDATE',
          id: 'VariableId:123',
          name: 'new-name-for-bulk',
        },
      ],
    }

    mockedUseFigmaTokenContext.mockReturnValue({
      token: mockToken,
      fileKey: mockFileKey,
    })
    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useBulkUpdateVariables())

    await act(async () => {
      await result.current.mutate(payload)
    })

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      FIGMA_FILE_VARIABLES_PATH(mockFileKey),
      mockToken,
      'UPDATE',
      payload
    )
  })

  it('should return an error state if the mutator throws an error', async () => {
    const mockToken = 'test-token'
    const mockFileKey = 'test-key'
    const payload: BulkUpdatePayload = {
      variables: [
        {
          action: 'UPDATE',
          id: 'VariableId:123',
          name: 'new-name-for-bulk',
        },
      ],
    }

    mockedUseFigmaTokenContext.mockReturnValue({
      token: mockToken,
      fileKey: mockFileKey,
    })
    mockedMutator.mockRejectedValue(new Error('Mocked error'))

    const { result } = renderHook(() => useBulkUpdateVariables())

    await act(async () => {
      await result.current.mutate(payload)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Mocked error')
  })
})
