// Utility to filter Figma variables by type, name, etc.
import type { FigmaVariable, ResolvedType } from 'types'

/**
 * Filters an array of Figma variables based on specified criteria.
 * This utility can filter by variable type, a partial name match, or both.
 *
 * @param variables - The array of `FigmaVariable` objects to filter.
 * @param criteria - An object specifying the filter criteria.
 * @param criteria.resolvedType - The variable type (e.g., 'COLOR', 'FLOAT') to filter by.
 * @param criteria.name - A string to search for within the variable names (case-sensitive).
 * @returns A new array containing only the variables that match the criteria.
 *
 * @example
 * ```ts
 * import { filterVariables } from 'utils/filterVariables';
 *
 * const allVariables = [
 *   { name: 'primary-color', resolvedType: 'COLOR', ... },
 *   { name: 'font-size-large', resolvedType: 'FLOAT', ... }
 * ];
 *
 * // Filter by type
 * const colorVariables = filterVariables(allVariables, { resolvedType: 'COLOR' });
 *
 * // Filter by name
 * const fontVariables = filterVariables(allVariables, { name: 'font' });
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
