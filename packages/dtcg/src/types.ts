/**
 * DTCG 2025.10 document types used by the FigmaVars toolchain.
 *
 * @remarks
 * These types cover DTCG 2025.10 values that Figma variables can express,
 * the Resolver module, and the documented FigmaVars boolean extension.
 */

/** DTCG color value (Color Module, 2025.10). @public */
export interface DTCGColorValue {
  colorSpace: 'srgb'
  components: [number, number, number]
  alpha?: number
  hex?: string
}

/** DTCG dimension value. @public */
export interface DTCGDimensionValue {
  value: number
  unit: 'px' | 'rem'
}

/** DTCG duration value. @public */
export interface DTCGDurationValue {
  value: number
  unit: 'ms' | 's'
}

/**
 * Token types emitted from Figma variables.
 *
 * @remarks
 * DTCG 2025.10 does not define `boolean`. FigmaVars documents it as an
 * extension because Figma variables support boolean values.
 *
 * @public
 */
export type DTCGTokenType =
  | 'color'
  | 'dimension'
  | 'number'
  | 'fontWeight'
  | 'fontFamily'
  | 'duration'
  | 'string'
  | 'boolean'

/** A token `$value`, including `{dot.path}` reference strings. @public */
export type DTCGTokenValue =
  | DTCGColorValue
  | DTCGDimensionValue
  | DTCGDurationValue
  | string
  | number
  | boolean

/** Figma metadata preserved under `$extensions['com.figma-vars']`. @public */
export interface FigmaVarsExtension {
  variableId: string
  collectionId: string
  collectionName: string
  scopes?: string[]
  codeSyntax?: Record<string, string>
  hiddenFromPublishing?: boolean
  resolvedType?: string
}

/** A single DTCG design token. @public */
export interface DTCGToken {
  $type?: DTCGTokenType
  $value: DTCGTokenValue
  $description?: string
  $extensions?: Record<string, unknown>
}

/** A DTCG group: nested groups and tokens. @public */
export interface DTCGGroup {
  [name: string]: DTCGToken | DTCGGroup
}

/** A DTCG token document (the root group of a `*.tokens.json` file). @public */
export type DTCGDocument = DTCGGroup

/** A `$ref` pointer used in resolver documents. @public */
export interface DTCGRef {
  $ref: string
}

/** A resolver set: named group of token sources. @public */
export interface ResolverSet {
  sources: Array<DTCGRef | DTCGDocument>
}

/** A resolver modifier: contextual token overrides (e.g. light/dark). @public */
export interface ResolverModifier {
  description?: string
  default?: string
  contexts: Record<string, Array<DTCGRef | DTCGDocument>>
}

/** A DTCG Resolver document (Resolver Module, 2025.10). @public */
export interface ResolverDocument {
  $schema?: string
  name?: string
  version: '2025.10'
  description?: string
  sets?: Record<string, ResolverSet>
  modifiers?: Record<string, ResolverModifier>
  resolutionOrder: DTCGRef[]
}

/** Check whether a node is an object with its own `$value`. @public */
export function isToken(node: unknown): node is DTCGToken {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    // biome-ignore lint/suspicious/noPrototypeBuiltins: Required for null-prototype dictionaries.
    Object.prototype.hasOwnProperty.call(node, '$value')
  )
}

/** Type guard for DTCG reference strings like `{color.bg.brand}`. @public */
export function isReferenceValue(value: unknown): value is string {
  return (
    typeof value === 'string' && value.startsWith('{') && value.endsWith('}')
  )
}
