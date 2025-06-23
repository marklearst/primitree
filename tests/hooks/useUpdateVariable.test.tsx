import { act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useUpdateVariable } from '../../src/hooks/useUpdateVariable'
import { mutator } from '../../src/api/mutator'
import { FIGMA_VARIABLE_BY_ID_ENDPOINT } from '../../src/constants/index'
import type { UpdateVariablePayload } from '../../src/types/mutations'

// Mock the mutator to avoid actual API calls
vi.mock('../../src/api/mutator')

const mockedMutator = mutator as Mock

describe('useUpdateVariable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should call mutator with correct arguments', async () => {
    const variableId = 'VariableId:123'
    const payload: UpdateVariablePayload = {
      name: 'updated-name',
      description: 'updated description',
    }
    const expectedUrl = FIGMA_VARIABLE_BY_ID_ENDPOINT(variableId)
    const expectedToken = process.env.VITE_FIGMA_TOKEN

    mockedMutator.mockResolvedValue({ success: true })

    const { result } = renderHookWithWrapper(() => useUpdateVariable())

    await act(async () => {
      await result.current.mutate({ variableId, payload })
    })

    expect(mockedMutator).toHaveBeenCalledTimes(1)
    expect(mockedMutator).toHaveBeenCalledWith(
      expectedUrl,
      expectedToken,
      'PUT',
      payload
    )
  })
})
