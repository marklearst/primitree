import { useMemo } from 'react'
import { useVariables } from 'hooks/useVariables'
import type { FigmaVariable } from 'types'

/**
 * React hook that selects a single variable by ID from loaded Figma variables data.
 *
 * @remarks
 * Returns the variable with the specified ID, or `undefined` if not found.
 * Useful for accessing a specific variable without manually mapping through all variables.
 *
 * @param variableId - The ID of the variable to retrieve.
 * @returns The variable object, or `undefined` if not found.
 *
 * @example
 * ```tsx
 * import { useVariableById } from '@figma-vars/hooks';
 *
 * function VariableDetails({ variableId }: { variableId: string }) {
 *   const variable = useVariableById(variableId);
 *
 *   if (!variable) return <div>Variable not found</div>;
 *
 *   return <div>
 *     <h2>{variable.name}</h2>
 *     <p>Type: {variable.resolvedType}</p>
 *   </div>;
 * }
 * ```
 *
 * @public
 */
export const useVariableById = (
  variableId: string
): FigmaVariable | undefined => {
  const { data } = useVariables()

  return useMemo(() => {
    if (!data?.meta?.variables) {
      return undefined
    }
    return data.meta.variables[variableId]
  }, [data, variableId])
}
