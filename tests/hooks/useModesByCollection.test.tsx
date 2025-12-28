import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useModesByCollection } from '../../src/hooks/useModesByCollection'
import { useVariableModes } from '../../src/hooks/useVariableModes'
import { mockLocalVariablesResponse } from '../../tests/mocks/variables'

vi.mock('../../src/hooks/useVariableModes')

const mockedUseVariableModes = useVariableModes as Mock

describe('useModesByCollection', () => {
  it('should return empty array when collection not found', () => {
    mockedUseVariableModes.mockReturnValue({
      modesByCollectionId: {},
    })
    const { result } = renderHook(() =>
      useModesByCollection('non-existent-collection')
    )
    expect(result.current).toEqual([])
  })

  it('should return modes for the specified collection', () => {
    const collectionId = 'VariableCollectionId:123:456'
    const expectedModes =
      mockLocalVariablesResponse.meta.variableCollections[collectionId]
        ?.modes || []

    mockedUseVariableModes.mockReturnValue({
      modesByCollectionId: {
        [collectionId]: expectedModes,
      },
    })

    const { result } = renderHook(() => useModesByCollection(collectionId))
    expect(result.current).toEqual(expectedModes)
  })

  it('should return empty array when modesByCollectionId is empty', () => {
    mockedUseVariableModes.mockReturnValue({
      modesByCollectionId: {},
    })
    const { result } = renderHook(() =>
      useModesByCollection('any-collection-id')
    )
    expect(result.current).toEqual([])
  })

  it('should memoize the result and not re-calculate on re-render with same collectionId', () => {
    const collectionId = 'VariableCollectionId:123:456'
    const expectedModes = [
      { modeId: '1:1', name: 'Mode 1' },
      { modeId: '1:2', name: 'Mode 2' },
    ]

    mockedUseVariableModes.mockReturnValue({
      modesByCollectionId: {
        [collectionId]: expectedModes,
      },
    })

    const { result, rerender } = renderHook(() =>
      useModesByCollection(collectionId)
    )

    const initialModes = result.current

    rerender()

    expect(result.current).toBe(initialModes)
  })

  it('should update when collectionId changes', () => {
    const collection1Id = 'VariableCollectionId:123:456'
    const collection2Id = 'VariableCollectionId:123:457'
    const modes1 = [{ modeId: '1:1', name: 'Mode 1' }]
    const modes2 = [{ modeId: '2:1', name: 'Mode A' }]

    mockedUseVariableModes.mockReturnValue({
      modesByCollectionId: {
        [collection1Id]: modes1,
        [collection2Id]: modes2,
      },
    })

    const { result, rerender } = renderHook(
      ({ collectionId }) => useModesByCollection(collectionId),
      {
        initialProps: { collectionId: collection1Id },
      }
    )

    expect(result.current).toEqual(modes1)

    rerender({ collectionId: collection2Id })

    expect(result.current).toEqual(modes2)
  })
})
