import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection } from 'types'

/**
 * A convenience hook to access the variable collections from the data fetched by `useVariables`.
 * This hook does not perform its own data fetching; it's a lightweight selector on the main data source.
 *
 * It's recommended to use this hook when you only need collection data to avoid re-rendering components unnecessarily when other parts of the Figma data change.
 *
 * @returns An object containing the collections as an array (`collections`) and as a map by ID (`collectionsById`).
 *
 * @example
 * ```tsx
 * const { collections } = useVariableCollections();
 *
 * return (
 *   <ul>
 *     {collections.map(collection => (
 *       <li key={collection.id}>{collection.name}</li>
 *     ))}
 *   </ul>
 * );
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
