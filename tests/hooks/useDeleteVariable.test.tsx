import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { useDeleteVariable } from '../../src/hooks/useDeleteVariable'
import { useFigmaTokenContext } from '../../src/contexts/FigmaVarsProvider'
import { mutator } from '../../src/api/mutator'
import {
  FIGMA_VARIABLE_BY_ID_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from '../../src/constants/index'

// Mock dependencies
vi.mock('../../src/contexts/FigmaVarsProvider')
vi.mock('../../src/api/mutator')

const mockedUseFigmaTokenContext = useFigmaTokenContext as Mock
const mockedMutator = mutator as Mock

describe('useDeleteVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should throw an error if figma token is not provided', () => {
    mockedUseFigmaTokenContext.mockReturnValue({ token: null })
    expect(() => renderHook(() => useDeleteVariable())).toThrow(
      ERROR_MSG_TOKEN_REQUIRED
    )
  })

  it('should call mutator with correct arguments', async () => {
    const mockToken = 'test-token'
    const variableId = 'VariableId:123'
    const expectedUrl = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)

    mockedUseFigmaTokenContext.mockReturnValue({ token: mockToken })
    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useDeleteVariable())

    await act(async () => {
      await result.current.mutate(variableId)
    })

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(expectedUrl, mockToken, 'DELETE')
  })
})
