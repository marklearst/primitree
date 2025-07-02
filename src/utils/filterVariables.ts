// Utility to filter Figma variables by type, name, etc.
import type { FigmaVariable, ResolvedType } from 'types'

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
