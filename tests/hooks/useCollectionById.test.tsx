import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useCollectionById } from '../../src/hooks/useCollectionById'
import { useVariableCollections } from '../../src/hooks/useVariableCollections'
import { mockLocalVariablesResponse } from '../../tests/mocks/variables'

vi.mock('../../src/hooks/useVariableCollections')

const mockedUseVariableCollections = useVariableCollections as Mock

describe('useCollectionById', () => {
  it('should return undefined when collection not found', () => {
    mockedUseVariableCollections.mockReturnValue({
      collectionsById: {},
    })
    const { result } = renderHook(() =>
      useCollectionById('non-existent-collection')
    )
    expect(result.current).toBeUndefined()
  })

  it('should return the collection when found', () => {
    const collectionId = 'VariableCollectionId:123:456'
    const expectedCollection =
      mockLocalVariablesResponse.meta.variableCollections[collectionId]

    mockedUseVariableCollections.mockReturnValue({
      collectionsById: {
        [collectionId]: expectedCollection,
      },
    })

    const { result } = renderHook(() => useCollectionById(collectionId))
    expect(result.current).toEqual(expectedCollection)
  })

  it('should return undefined when collectionsById is empty', () => {
    mockedUseVariableCollections.mockReturnValue({
      collectionsById: {},
    })
    const { result } = renderHook(() => useCollectionById('any-collection-id'))
    expect(result.current).toBeUndefined()
  })

  it('should memoize the result and not re-calculate on re-render with same collectionId', () => {
    const collectionId = 'VariableCollectionId:123:456'
    const expectedCollection =
      mockLocalVariablesResponse.meta.variableCollections[collectionId]

    mockedUseVariableCollections.mockReturnValue({
      collectionsById: {
        [collectionId]: expectedCollection,
      },
    })

    const { result, rerender } = renderHook(() =>
      useCollectionById(collectionId)
    )

    const initialCollection = result.current

    rerender()

    expect(result.current).toBe(initialCollection)
  })

  it('should update when collectionId changes', () => {
    const collection1Id = 'VariableCollectionId:123:456'
    const collection2Id = 'VariableCollectionId:123:457'
    const collection1 =
      mockLocalVariablesResponse.meta.variableCollections[collection1Id]
    const collection2 =
      mockLocalVariablesResponse.meta.variableCollections[collection2Id]

    mockedUseVariableCollections.mockReturnValue({
      collectionsById: {
        [collection1Id]: collection1,
        [collection2Id]: collection2,
      },
    })

    const { result, rerender } = renderHook(
      ({ collectionId }) => useCollectionById(collectionId),
      {
        initialProps: { collectionId: collection1Id },
      }
    )

    expect(result.current?.id).toBe(collection1Id)

    rerender({ collectionId: collection2Id })

    expect(result.current?.id).toBe(collection2Id)
  })
})
