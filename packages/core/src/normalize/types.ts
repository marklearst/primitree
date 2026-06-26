import type {
  Color,
  ResolvedType,
  VariableScope,
  VariableValue,
} from '../types/figma'

/**
 * A single mode within a normalized collection.
 *
 * @public
 */
export interface NormalizedMode {
  /** Figma mode ID (e.g. `1:0`). */
  id: string
  /** Human-readable mode name (e.g. `Light`). */
  name: string
}

/**
 * A normalized Figma variable collection.
 *
 * @remarks
 * The same shape regardless of whether the input came from the REST API,
 * a fallback file, or a plugin-based export.
 *
 * @public
 */
export interface NormalizedCollection {
  id: string
  name: string
  modes: NormalizedMode[]
  defaultModeId: string
  variableIds: string[]
  hiddenFromPublishing: boolean
}

/**
 * A normalized Figma variable.
 *
 * @public
 */
export interface NormalizedVariable {
  id: string
  /** Slash-separated variable path as authored in Figma (e.g. `color/bg/brand`). */
  name: string
  collectionId: string
  resolvedType: ResolvedType
  valuesByMode: Record<string, VariableValue>
  description: string
  hiddenFromPublishing: boolean
  scopes: VariableScope[]
  codeSyntax: Record<string, string>
}

/**
 * The normalized model produced by {@link normalizeVariables}.
 *
 * @remarks
 * Ordered arrays preserve source order. ID-keyed maps support direct lookup.
 *
 * @public
 */
export interface NormalizedVariables {
  collections: NormalizedCollection[]
  variables: NormalizedVariable[]
  collectionsById: Record<string, NormalizedCollection>
  variablesById: Record<string, NormalizedVariable>
}

/**
 * A concrete (non-alias) variable value after alias resolution.
 *
 * @public
 */
export type ConcreteValue = string | number | boolean | Color

/**
 * Result of resolving a variable's value in a specific mode context.
 *
 * @public
 */
export interface ResolvedValue {
  /** The concrete value after following any alias chain. */
  value: ConcreteValue
  /** The resolved type from the variable that supplied the concrete value. */
  resolvedType: ResolvedType
  /**
   * IDs of the variables traversed to reach the concrete value, starting with
   * the requested variable. Length 1 means the value was not an alias.
   */
  aliasChain: string[]
}
