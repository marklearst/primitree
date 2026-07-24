import type { FigmaVariable, ResolvedType } from '../types/figma'

/**
 * Criteria for filtering Figma variables.
 *
 * @public
 */
export interface FilterVariablesCriteria {
  /**
   * Filter by resolved variable type (e.g., 'COLOR', 'FLOAT', 'STRING', 'BOOLEAN').
   */
  resolvedType?: ResolvedType
  /**
   * Substring to match against variable names.
   */
  name?: string
  /**
   * Set to `true` for case-insensitive name matching.
   * @defaultValue false
   */
  caseInsensitive?: boolean
}

/**
 * Filter Figma variables by resolved type and name substring.
 *
 * @remarks
 * Name matching respects case unless `caseInsensitive` is `true`.
 *
 * @param variables - Variables to filter.
 * @param criteria - Type and name filters.
 * @returns Variables that match the supplied filters.
 *
 * @example
 * ```ts
 * import { filterVariables } from '@figmavars/core'
 *
 * const colors = filterVariables(variables, { resolvedType: 'COLOR' })
 * const brand = filterVariables(variables, {
 *   name: 'brand',
 *   caseInsensitive: true,
 * })
 * ```
 *
 * @public
 */
export function filterVariables(
  variables: FigmaVariable[],
  criteria: FilterVariablesCriteria
): FigmaVariable[] {
  return variables.filter(v => {
    let match = true
    if (criteria.resolvedType) {
      match = match && v.resolvedType === criteria.resolvedType
    }
    if (criteria.name) {
      if (criteria.caseInsensitive) {
        match =
          match && v.name.toLowerCase().includes(criteria.name.toLowerCase())
      } else {
        match = match && v.name.includes(criteria.name)
      }
    }
    return match
  })
}
