import type { VariableAlias, VariableValue } from '../types/figma'
import type {
  ConcreteValue,
  NormalizedVariable,
  NormalizedVariables,
  ResolvedValue,
} from './types'

/**
 * Reasons an alias chain can fail to resolve.
 *
 * @public
 */
export type AliasResolutionErrorCode =
  'CYCLE' | 'MISSING_TARGET' | 'MISSING_VALUE'

/**
 * Alias resolution functions throw this error when a variable's alias chain
 * does not reach a concrete value.
 *
 * @public
 */
export class AliasResolutionError extends Error {
  public readonly code: AliasResolutionErrorCode
  /** Variable IDs traversed before the failure, in order. */
  public readonly chain: string[]

  constructor(
    message: string,
    code: AliasResolutionErrorCode,
    chain: string[]
  ) {
    super(message)
    this.name = 'AliasResolutionError'
    this.code = code
    this.chain = chain
  }
}

/**
 * Type guard for Figma variable alias values.
 *
 * @public
 */
export function isVariableAlias(value: unknown): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as VariableAlias).type === 'VARIABLE_ALIAS' &&
    typeof (value as VariableAlias).id === 'string'
  )
}

function pickModeValue(
  normalized: NormalizedVariables,
  variable: NormalizedVariable,
  modeId: string | undefined
): { value: VariableValue; modeId: string } | null {
  const collection = normalized.collectionsById[variable.collectionId]
  const preferred =
    modeId !== undefined && variable.valuesByMode[modeId] !== undefined
      ? modeId
      : undefined
  const fallback =
    collection && variable.valuesByMode[collection.defaultModeId] !== undefined
      ? collection.defaultModeId
      : undefined
  const chosen = preferred ?? fallback
  if (chosen === undefined) {
    // Last resort: any mode the variable actually has a value for.
    const first = Object.keys(variable.valuesByMode)[0]
    if (first === undefined) {
      return null
    }
    return {
      value: variable.valuesByMode[first] as VariableValue,
      modeId: first,
    }
  }
  return {
    value: variable.valuesByMode[chosen] as VariableValue,
    modeId: chosen,
  }
}

/**
 * Resolve a variable's value in a given mode by following alias chains across
 * collections.
 *
 * @remarks
 * Mode selection mirrors Figma's behavior for static resolution:
 *
 * - The resolver uses the requested `modeId` when the variable defines a
 *   value for it. Otherwise, it uses the collection's default mode.
 * - For aliases in another collection, the resolver checks the requested
 *   `modeId` in that collection. Mode IDs are unique per collection, so this
 *   check matches within the same collection. The target collection's
 *   default mode applies when the check finds no match.
 *
 * Cycles and dangling alias targets throw {@link AliasResolutionError}.
 *
 * @param normalized - The normalized variables model.
 * @param variableId - ID of the variable to resolve.
 * @param modeId - Mode ID to resolve against (defaults to the variable's collection default mode).
 * @returns The concrete value, the type that supplied it, and the alias chain walked.
 *
 * @example
 * ```ts
 * const { value, aliasChain } = resolveVariableValue(normalized, 'VariableID:1:23', '1:0')
 * ```
 *
 * @public
 */
export function resolveVariableValue(
  normalized: NormalizedVariables,
  variableId: string,
  modeId?: string
): ResolvedValue {
  const chain: string[] = []
  const seen = new Set<string>()

  let currentId = variableId
  let currentModeId = modeId

  for (;;) {
    if (seen.has(currentId)) {
      throw new AliasResolutionError(
        `Alias cycle detected: ${[...chain, currentId].join(' -> ')}`,
        'CYCLE',
        [...chain, currentId]
      )
    }
    seen.add(currentId)
    chain.push(currentId)

    const variable = normalized.variablesById[currentId]
    if (!variable) {
      throw new AliasResolutionError(
        `Alias target "${currentId}" does not exist (chain: ${chain.join(' -> ')})`,
        'MISSING_TARGET',
        chain
      )
    }

    const picked = pickModeValue(normalized, variable, currentModeId)
    if (picked === null) {
      throw new AliasResolutionError(
        `Variable "${variable.name}" has no values in any mode`,
        'MISSING_VALUE',
        chain
      )
    }

    if (isVariableAlias(picked.value)) {
      currentId = picked.value.id
      // Keep the caller's requested mode when hopping collections; it only
      // matches when the target shares the collection (mode ids are unique).
      currentModeId = modeId
      continue
    }

    return {
      value: picked.value as ConcreteValue,
      resolvedType: variable.resolvedType,
      aliasChain: chain,
    }
  }
}

/**
 * Resolve each variable for the modes in its collection.
 *
 * @returns Map of variable ID to mode ID to resolved value. The function
 * catches alias failures and collects them in `errors`.
 *
 * @public
 */
export function resolveAllVariableValues(normalized: NormalizedVariables): {
  values: Record<string, Record<string, ResolvedValue>>
  errors: AliasResolutionError[]
} {
  const values: Record<string, Record<string, ResolvedValue>> = {}
  const errors: AliasResolutionError[] = []

  for (const variable of normalized.variables) {
    const collection = normalized.collectionsById[variable.collectionId]
    if (!collection) {
      continue
    }
    const byMode: Record<string, ResolvedValue> = {}
    for (const mode of collection.modes) {
      try {
        byMode[mode.id] = resolveVariableValue(normalized, variable.id, mode.id)
      } catch (err) {
        if (err instanceof AliasResolutionError) {
          errors.push(err)
        } else {
          throw err
        }
      }
    }
    values[variable.id] = byMode
  }

  return { values, errors }
}
