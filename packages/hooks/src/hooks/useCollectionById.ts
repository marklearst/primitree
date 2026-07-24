import { useMemo } from 'react'
import { useVariableCollections } from './useVariableCollections'
import type { FigmaCollection } from '../types'

/**
 * Select a Figma variable collection by ID.
 *
 * @remarks
 * The hook reads collection data from {@link useVariableCollections}.
 *
 * @param collectionId - The ID of the collection to retrieve.
 * @returns The collection object, or `undefined` if not found.
 *
 * @example
 * ```tsx
 * import { useCollectionById } from '@figmavars/hooks';
 *
 * function CollectionDetails({ collectionId }: { collectionId: string }) {
 *   const collection = useCollectionById(collectionId);
 *
 *   if (!collection) return <div>Collection not found</div>;
 *
 *   return <div>
 *     <h2>{collection.name}</h2>
 *     <p>Variables: {collection.variableIds.length}</p>
 *   </div>;
 * }
 * ```
 *
 * @public
 */
export const useCollectionById = (
  collectionId: string
): FigmaCollection | undefined => {
  const { collectionsById } = useVariableCollections()

  return useMemo(() => {
    return collectionsById[collectionId]
  }, [collectionsById, collectionId])
}
