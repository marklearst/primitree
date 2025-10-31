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
 * import { useVariables } from '@figma-vars/hooks';
 * const { data, isLoading } = useVariables();
 * ```
 *
 * @public
 */
export { useVariables } from 'hooks/useVariables'
/**
 * React hook to select and memoize variable collections from the loaded Figma variables data.
 *
 * @remarks
 * Returns collections in both array and lookup formats for convenience.
 *
 * @example
 * ```tsx
 * import { useVariableCollections } from '@figma-vars/hooks';
 * const { collections } = useVariableCollections();
 * ```
 *
 * @public
 */
export { useVariableCollections } from 'hooks/useVariableCollections'
/**
 * React hook to select and memoize variable modes from the loaded Figma variables data.
 *
 * @remarks
 * Returns all modes, modes by collection, and modes by ID for efficient access.
 *
 * @example
 * ```tsx
 * import { useVariableModes } from '@figma-vars/hooks';
 * const { modes, modesById } = useVariableModes();
 * ```
 *
 * @public
 */
export { useVariableModes } from 'hooks/useVariableModes'
/**
 * React hook to access the Figma Personal Access Token from context.
 *
 * @remarks
 * Returns the token provided to the FigmaVarsProvider, or null if not available.
 *
 * @example
 * ```tsx
 * import { useFigmaToken } from '@figma-vars/hooks';
 * const token = useFigmaToken();
 * ```
 *
 * @public
 */
export { default as useFigmaToken } from 'hooks/useFigmaToken'
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
 * import { useCreateVariable } from '@figma-vars/hooks';
 * const { mutate, isLoading } = useCreateVariable();
 * // mutate({ name: 'Primary Color', ... })
 * ```
 *
 * @public
 */
export { useCreateVariable } from 'hooks/useCreateVariable'
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
 * import { useUpdateVariable } from '@figma-vars/hooks';
 * const { mutate } = useUpdateVariable();
 * // mutate({ variableId: 'id', payload: { name: 'Updated' } })
 * ```
 *
 * @public
 */
export { useUpdateVariable } from 'hooks/useUpdateVariable'
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
 * import { useDeleteVariable } from '@figma-vars/hooks';
 * const { mutate } = useDeleteVariable();
 * // mutate('variable-id')
 * ```
 *
 * @public
 */
export { useDeleteVariable } from 'hooks/useDeleteVariable'
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
 * import { useBulkUpdateVariables } from '@figma-vars/hooks';
 * const { mutate } = useBulkUpdateVariables();
 * // mutate({ variableIds: [...], updates: {...} })
 * ```
 *
 * @public
 */
export { useBulkUpdateVariables } from 'hooks/useBulkUpdateVariables'
