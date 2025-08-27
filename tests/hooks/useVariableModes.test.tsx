import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useVariableModes } from '../../src/hooks/useVariableModes'
import { useVariables } from '../../src/hooks/useVariables'
import { mockVariablesResponse } from '../../tests/mocks/variables'

vi.mock('../../src/hooks/useVariables')

const mockedUseVariables = useVariables as Mock

describe('useVariableModes', () => {
  it('should return empty mode structures when useVariables has no data', () => {
    mockedUseVariables.mockReturnValue({
      data: undefined,
    })
    const { result } = renderHook(() => useVariableModes())
    expect(result.current.modes).toEqual([])
    expect(result.current.modesByCollectionId).toEqual({})
    expect(result.current.modesById).toEqual({})
  })

  it('should return processed modes when useVariables has data', () => {
    mockedUseVariables.mockReturnValue({
      data: mockVariablesResponse,
    })
    const { result } = renderHook(() => useVariableModes())

    const { variableCollections } = mockVariablesResponse.meta
    const collection1 = Object.values(variableCollections)[0]!
    const collection2 = Object.values(variableCollections)[1]!

    expect(result.current.modes).toHaveLength(2)
    expect(result.current.modes[0]).toEqual(collection1.modes[0])
    expect(result.current.modesByCollectionId[collection1.id]).toEqual(
      collection1.modes
    )
    expect(result.current.modesByCollectionId[collection2.id]).toEqual(
      collection2.modes
    )
    expect(result.current.modesById[collection1.modes[0]!.modeId]).toEqual(
      collection1.modes[0]
    )
    expect(result.current.modesById[collection2.modes[0]!.modeId]).toEqual(
      collection2.modes[0]
    )
  })

  it('should memoize the result', () => {
    const mockData = {
      data: mockVariablesResponse,
    }
    mockedUseVariables.mockReturnValue(mockData)

    const { result, rerender } = renderHook(() => useVariableModes())

    const initialResult = result.current
    rerender()
    expect(result.current).toBe(initialResult)
  })
})
