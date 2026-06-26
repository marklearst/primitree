import { useMemo } from 'react'
import { useVariables } from './useVariables'
import type { FigmaVariable } from '../types'

/**
 * Select a Figma variable by ID.
 *
 * @remarks
 * The hook reads local data from {@link useVariables}.
 *
 * @param variableId - The ID of the variable to retrieve.
 * @returns The variable object, or `undefined` if not found.
 *
 * @example
 * ```tsx
 * import { useVariableById } from '@figmavars/hooks';
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
