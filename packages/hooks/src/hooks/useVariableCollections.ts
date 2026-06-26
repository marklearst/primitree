import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaCollection } from '../types'

/**
 * Read local variable collections as an array and an ID-keyed map.
 *
 * @remarks
 * The hook derives both values from {@link useVariables}.
 *
 * @example
 * ```tsx
 * import { useVariableCollections } from '@figmavars/hooks';
 *
 * function CollectionList() {
 *   const { collections } = useVariableCollections();
 *   if (!collections.length) return <div>No collections found.</div>;
 *   return (
 *     <ul>
 *       {collections.map(col => (
 *         <li key={col.id}>{col.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @public
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
