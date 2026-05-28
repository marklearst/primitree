import { useMemo } from 'react'
import { useVariables } from 'hooks/useVariables'
import type { FigmaCollection } from 'types'

/**
 * React hook that extracts and memoizes all variable collections from loaded Figma variables data.
 *
 * @remarks
 * Returns an object with:
 * - `collections`: an array of all variable collections
 * - `collectionsById`: a lookup table mapping collection IDs to FigmaCollection objects
 * Useful for building UI pickers, mapping, and variable management tools.
 *
 * Call this hook anywhere you need fast, up-to-date access to collections for the current file context.
 *
 * @example
 * ```tsx
 * import { useVariableCollections } from '@figma-vars/hooks';
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
