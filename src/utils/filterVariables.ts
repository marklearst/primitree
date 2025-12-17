import type { FigmaVariable, ResolvedType } from "types";

/**
 * Utility function to filter Figma variables by type and/or substring name match.
 *
 * @remarks
 * Returns a new array of variables matching the provided criteria. Use for building type pickers, variable search, dashboard views, or bulk edit tools. Filtering is case-sensitive for `name`. Pass no criteria to return all variables unfiltered.
 *
 * @param variables - The array of FigmaVariable objects to filter.
 * @param criteria - Object specifying filter fields. Provide a `resolvedType` (e.g., 'COLOR', 'FLOAT') and/or a `name` substring to match variable names.
 * @returns Array of FigmaVariable objects that match all provided criteria. Returns an empty array if no matches found. Returns all variables if criteria is empty.
 *
 * @example
 * ```ts
 * import { filterVariables } from '@figma-vars/hooks';
 *
 * // Example 1: Filter all color variables
 * const colorVars = filterVariables(allVars, { resolvedType: 'COLOR' });
 *
 * // Example 2: Filter variables containing 'brand' in their name (case-sensitive)
 * const brandVars = filterVariables(allVars, { name: 'brand' });
 *
 * // Example 3: Filter variables that are COLOR and include 'brand' in name
 * const filtered = filterVariables(allVars, { resolvedType: 'COLOR', name: 'brand' });
 * ```
 *
 * @public
 */
export function filterVariables(
  variables: FigmaVariable[],
  criteria: { resolvedType?: ResolvedType; name?: string },
): FigmaVariable[] {
  return variables.filter((v) => {
    let match = true;
    if (criteria.resolvedType) match = match && v.resolvedType === criteria.resolvedType;
    if (criteria.name) match = match && v.name.includes(criteria.name);
    return match;
  });
}
