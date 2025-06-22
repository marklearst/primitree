/**
 * @fileoverview Utility functions for filtering and searching Figma variables.
 * Provides helper functions to filter variables by type, name, and other criteria.
 * @since 1.0.0
 */

import type { FigmaVariable, ResolvedType } from 'types'

/**
 * Filters an array of Figma variables based on specified criteria.
 * This utility can filter by variable type, a partial name match, or both.
 *
 * @function filterVariables
 * @memberof Utils
 * @since 1.0.0
 * @param {FigmaVariable[]} variables The array of `FigmaVariable` objects to filter.
 * @param {Object} criteria An object specifying the filter criteria.
 * @param {ResolvedType} [criteria.resolvedType] The variable type (e.g., 'COLOR', 'FLOAT') to filter by.
 * @param {string} [criteria.name] A string to search for within the variable names (case-sensitive).
 * @returns {FigmaVariable[]} A new array containing only the variables that match the criteria.
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
 *
 * @example
 * ```typescript
 * import { filterVariables } from 'utils/filterVariables';
 *
 * const allVariables = [
 *   { name: 'primary-color', resolvedType: 'COLOR', id: '1:1', ... },
 *   { name: 'font-size-large', resolvedType: 'FLOAT', id: '1:2', ... },
 *   { name: 'secondary-color', resolvedType: 'COLOR', id: '1:3', ... }
 * ];
 *
 * // Filter by type
 * const colorVariables = filterVariables(allVariables, {
 *   resolvedType: 'COLOR'
 * });
 * // Returns: [primary-color, secondary-color]
 *
 * // Filter by name (partial match)
 * const fontVariables = filterVariables(allVariables, {
 *   name: 'font'
 * });
 * // Returns: [font-size-large]
 *
 * // Filter by both type and name
 * const primaryColors = filterVariables(allVariables, {
 *   resolvedType: 'COLOR',
 *   name: 'primary'
 * });
 * // Returns: [primary-color]
 * ```
 *
 * @example
 * ```typescript
 * // Use with the useVariables hook
 * import { useVariables, filterVariables } from 'utils';
 *
 * function ColorVariablesList() {
 *   const { variables } = useVariables();
 *
 *   const colorVariables = filterVariables(variables, {
 *     resolvedType: 'COLOR'
 *   });
 *
 *   return (
 *     <ul>
 *       {colorVariables.map(variable => (
 *         <li key={variable.id}>{variable.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function filterVariables(
  variables: FigmaVariable[],
  criteria: { resolvedType?: ResolvedType; name?: string }
): FigmaVariable[] {
  return variables.filter((v) => {
    let match = true
    if (criteria.resolvedType)
      match = match && v.resolvedType === criteria.resolvedType
    if (criteria.name) match = match && v.name.includes(criteria.name)
    return match
  })
}
