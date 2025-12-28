import { useMemo } from 'react'
import { useVariableModes } from 'hooks/useVariableModes'
import type { VariableMode } from 'types'

/**
 * React hook that selects modes for a specific variable collection.
 *
 * @remarks
 * Returns an array of modes belonging to the specified collection, or an empty array if not found.
 * Useful for filtering modes by collection without manually accessing modesByCollectionId.
 *
 * @param collectionId - The ID of the collection to get modes for.
 * @returns An array of VariableMode objects for the collection, or an empty array if not found.
 *
 * @example
 * ```tsx
 * import { useModesByCollection } from '@figma-vars/hooks';
 *
 * function CollectionModes({ collectionId }: { collectionId: string }) {
 *   const modes = useModesByCollection(collectionId);
 *
 *   if (!modes.length) return <div>No modes found</div>;
 *
 *   return (
 *     <ul>
 *       {modes.map(mode => (
 *         <li key={mode.modeId}>{mode.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @public
 */
export const useModesByCollection = (collectionId: string): VariableMode[] => {
  const { modesByCollectionId } = useVariableModes()

  return useMemo(() => {
    return modesByCollectionId[collectionId] ?? []
  }, [modesByCollectionId, collectionId])
}
