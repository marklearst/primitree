import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection } from '../types'

/**
 * A memoized selector hook to access variable collections from the data fetched by `useVariables`.
 *
 * This hook is a lightweight, performant way to get only collection data. It avoids
 * unnecessary re-renders in components that only care about collections, as it will only
 * update when the collection data itself changes.
 *
 * @returns {{collections: FigmaCollection[], collectionsById: Record<string, FigmaCollection>}} An object containing the collections in different formats.
 *
 * @example
 * ```tsx
 * const { collectionsById } = useVariableCollections();
 * const collection = collectionsById['VariableCollectionId:123:456'];
 *
 * if (!collection) return <div>Collection not found.</div>;
 *
 * return <div>{collection.name}</div>
 * ```
 */
export const useVariableCollections = () => {
  const { data } = useVariables()

  const collections: FigmaCollection[] = useMemo(
    () => (data?.meta ? Object.values(data.meta.variableCollections) : []),
    [data]
  )

  const collectionsById: Record<string, FigmaCollection> = useMemo(
    () => (data?.meta ? data.meta.variableCollections : {}),
    [data]
  )

  return {
    collections,
    collectionsById,
  }
}
