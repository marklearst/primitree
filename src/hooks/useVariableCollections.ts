import { useMemo } from 'react'
import { useVariables } from 'hooks/useVariables'
import type { FigmaCollection } from 'types'

/**
 * A memoized selector hook to access variable collections from the data fetched by `useVariables`.
 *
 * This hook is a lightweight, performant way to get only collection data. It avoids
 * unnecessary re-renders in components that only care about collections, as it will only
 * update when the collection data itself changes.
 *
 * @returns {object} An object containing the collections in different formats.
 * @property {FigmaCollection[]} collections - An array of all `FigmaCollection` objects.
 * @property {Object<string, FigmaCollection>} collectionsById - A map of all `FigmaCollection` objects, keyed by their ID.
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
