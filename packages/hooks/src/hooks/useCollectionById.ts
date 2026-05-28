import { useMemo } from 'react'
import { useVariableCollections } from 'hooks/useVariableCollections'
import type { FigmaCollection } from 'types'

/**
 * React hook that selects a single variable collection by ID from loaded Figma variables data.
 *
 * @remarks
 * Returns the collection with the specified ID, or `undefined` if not found.
 * Useful for accessing a specific collection without manually mapping through all collections.
 *
 * @param collectionId - The ID of the collection to retrieve.
 * @returns The collection object, or `undefined` if not found.
 *
 * @example
 * ```tsx
 * import { useCollectionById } from '@figma-vars/hooks';
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
