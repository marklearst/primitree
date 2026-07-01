import { useMemo } from 'react'
import { useVariableModes } from './useVariableModes'
import type { VariableMode } from '../types'

/**
 * Select modes for a Figma variable collection.
 *
 * @remarks
 * The hook returns an empty array for an unknown collection or one without
 * loaded modes.
 *
 * @param collectionId - The ID of the collection to get modes for.
 * @returns The collection modes, or an empty array for an unknown collection.
 *
 * @example
 * ```tsx
 * import { useModesByCollection } from '@primitree/hooks';
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
