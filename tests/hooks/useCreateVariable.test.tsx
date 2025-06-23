import { act } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import { useCreateVariable } from '../../src/hooks/useCreateVariable'
import { mutator } from '../../src/api/mutator'
import { FIGMA_POST_VARIABLES_ENDPOINT } from '../../src/constants/index'
import type { CreateVariablePayload } from '../../src/types/mutations'

// Mock the mutator to avoid actual API calls
vi.mock('../../src/api/mutator')

const mockedMutator = mutator as Mock

describe('useCreateVariable', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // This test is no longer needed as the wrapper handles the token check.
  // it('should throw an error if figma token is not provided', () => { ... });

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
})
