/**
 * @module hooks
 * Barrel file for all Figma Variables React hooks.
 *
 * @remarks
 * Re-exports all hooks for convenient importing.
 *
 * @public
 */

/**
 * React hook to fetch all local variables, collections, and modes for the current Figma file.
 *
 * @remarks
 * Uses SWR for efficient data fetching and caching.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useVariables } from '@figmavars/hooks';
 * const { data, isLoading } = useVariables();
 * ```
 *
 * @public
 */
export { useVariables } from './useVariables'
/**
 * React hook to select and memoize variable collections from the loaded Figma variables data.
 *
 * @remarks
 * Returns collections in both array and lookup formats for convenience.
 *
 * @example
 * ```tsx
 * import { useVariableCollections } from '@figmavars/hooks';
 * const { collections } = useVariableCollections();
 * ```
 *
 * @public
 */
export { useVariableCollections } from './useVariableCollections'
/**
 * React hook to select and memoize variable modes from the loaded Figma variables data.
 *
 * @remarks
 * Returns all modes, modes by collection, and modes by ID for efficient access.
 *
 * @example
 * ```tsx
 * import { useVariableModes } from '@figmavars/hooks';
 * const { modes, modesById } = useVariableModes();
 * ```
 *
 * @public
 */
export { useVariableModes } from './useVariableModes'
/**
 * React hook to access the Figma Personal Access Token from context.
 *
 * @remarks
 * Returns the token provided to the FigmaVarsProvider, or null if not available.
 *
 * @example
 * ```tsx
 * import { useFigmaToken } from '@figmavars/hooks';
 * const token = useFigmaToken();
 * ```
 *
 * @public
 */
export { default as useFigmaToken } from './useFigmaToken'
/**
 * React hook to create a new Figma variable in the current file.
 *
 * @remarks
 * Returns a mutation object with state, error, and a trigger function.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useCreateVariable } from '@figmavars/hooks';
 * const { mutate, isLoading } = useCreateVariable();
 * // mutate({ name: 'Primary Color', ... })
 * ```
 *
 * @public
 */
export { useCreateVariable } from './useCreateVariable'
/**
 * React hook to update an existing Figma variable by ID.
 *
 * @remarks
 * Returns a mutation object for updating variable properties.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useUpdateVariable } from '@figmavars/hooks';
 * const { mutate } = useUpdateVariable();
 * // mutate({ variableId: 'id', payload: { name: 'Updated' } })
 * ```
 *
 * @public
 */
export { useUpdateVariable } from './useUpdateVariable'
/**
 * React hook to delete a Figma variable by ID.
 *
 * @remarks
 * Returns a mutation object for deleting variables.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useDeleteVariable } from '@figmavars/hooks';
 * const { mutate } = useDeleteVariable();
 * // mutate('variable-id')
 * ```
 *
 * @public
 */
export { useDeleteVariable } from './useDeleteVariable'
/**
 * React hook to perform a bulk update of multiple Figma variables in a single request.
 *
 * @remarks
 * Returns a mutation object for bulk updates.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useBulkUpdateVariables } from '@figmavars/hooks';
 * const { mutate } = useBulkUpdateVariables();
 * // mutate({ variableIds: [...], updates: {...} })
 * ```
 *
 * @public
 */
export { useBulkUpdateVariables } from './useBulkUpdateVariables'
export { useInvalidateVariables } from './useInvalidateVariables'
/**
 * React hook to fetch published Figma Variables from a file.
 *
 * @remarks
 * Fetches variables that have been published to a library. Published variables
 * are shared across files and represent the source of truth for design tokens.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { usePublishedVariables } from '@figmavars/hooks';
 * const { data, isLoading } = usePublishedVariables();
 * ```
 *
 * @public
 */
export { usePublishedVariables } from './usePublishedVariables'
/**
 * React hook to select a single variable by ID from loaded Figma variables data.
 *
 * @remarks
 * Returns the variable with the specified ID, or undefined if not found.
 *
 * @example
 * ```tsx
 * import { useVariableById } from '@figmavars/hooks';
 * const variable = useVariableById('VariableID:123:456');
 * ```
 *
 * @public
 */
export { useVariableById } from './useVariableById'
/**
 * React hook to select a single variable collection by ID from loaded Figma variables data.
 *
 * @remarks
 * Returns the collection with the specified ID, or undefined if not found.
 *
 * @example
 * ```tsx
 * import { useCollectionById } from '@figmavars/hooks';
 * const collection = useCollectionById('VariableCollectionId:123:456');
 * ```
 *
 * @public
 */
export { useCollectionById } from './useCollectionById'
/**
 * React hook to select modes for a specific variable collection.
 *
 * @remarks
 * Returns an array of modes belonging to the specified collection.
 *
 * @example
 * ```tsx
 * import { useModesByCollection } from '@figmavars/hooks';
 * const modes = useModesByCollection('VariableCollectionId:123:456');
 * ```
 *
 * @public
 */
export { useModesByCollection } from './useModesByCollection'
