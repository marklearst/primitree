import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { useUpdateVariable } from '../../src/hooks/useUpdateVariable'
import { useFigmaTokenContext } from '../../src/contexts/FigmaVarsProvider'
import { mutator } from '../../src/api/mutator'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from '../../src/constants/index'
import type { UpdateVariablePayload } from '../../src/types/mutations'

// Mock dependencies
vi.mock('../../src/contexts/FigmaVarsProvider')
vi.mock('../../src/api/mutator')

const mockedUseFigmaTokenContext = useFigmaTokenContext as Mock
const mockedMutator = mutator as Mock

describe('useUpdateVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should set error if figma token is not provided', async () => {
    mockedUseFigmaTokenContext.mockReturnValue({ token: null })

    const { result } = renderHook(() => useUpdateVariable())

    await act(async () => {
      await result.current.mutate({
        variableId: '123',
        payload: {} as UpdateVariablePayload,
      })
    })
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('A Figma API token is required.')
  })

  it('should call mutator with correct arguments', async () => {
    const mockToken = 'test-token'
    const variableId = 'VariableId:123'
    const payload: UpdateVariablePayload = {
      name: 'updated-name',
      description: 'updated description',
    }
    const expectedUrl = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)

    mockedUseFigmaTokenContext.mockReturnValue({ token: mockToken })
    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useUpdateVariable())

    await act(async () => {
      await result.current.mutate({ variableId, payload })
    })

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      expectedUrl,
      mockToken,
      'PUT',
      payload
    )
  })
})
