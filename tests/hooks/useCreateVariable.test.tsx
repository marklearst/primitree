import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { useCreateVariable } from '../../src/hooks/useCreateVariable'
import { useFigmaTokenContext } from '../../src/contexts/FigmaVarsProvider'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../../src/constants/index'
import type { CreateVariablePayload } from '../../src/types/mutations'

// Mock dependencies
vi.mock('../../src/contexts/FigmaVarsProvider')
vi.mock('../../src/api/mutator')

const mockedUseFigmaTokenContext = useFigmaTokenContext as Mock
const mockedMutator = mutator as Mock

describe('useCreateVariable', () => {
  // Reset mocks before each test to ensure isolation
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should throw an error if figma token is not provided', () => {
    mockedUseFigmaTokenContext.mockReturnValue({ token: null })

    expect(() => {
      renderHook(() => useCreateVariable())
    }).toThrow(ERROR_MSG_TOKEN_REQUIRED)
  })

  it('should call mutator with correct arguments and revalidate cache on success', async () => {
    const mockToken = 'test-token'
    mockedUseFigmaTokenContext.mockReturnValue({ token: mockToken })
    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCreateVariable())

    const payload: CreateVariablePayload = {
      name: 'new-color',
      variableCollectionId: 'VariableCollectionId:1:1',
      resolvedType: 'COLOR',
    }

    await act(async () => {
      await result.current.mutate(payload)
    })

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      FIGMA_POST_VARIABLES_ENDPOINT,
      mockToken,
      'POST',
      payload
    )
  })
})
