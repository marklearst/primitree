/**
 * DTCG 2025.10 types for Primitree.
 *
 * @remarks
 * These types cover the DTCG 2025.10 values that Primitree reads, the Resolver
 * module, Figma variable output, and the documented Primitree boolean
 * extension.
 */

/**
 * One of the 14 color spaces named by DTCG Color 2025.10.
 *
 * @see [DTCG supported color spaces](https://www.designtokens.org/tr/2025.10/color/#supported-color-spaces)
 *
 * @public
 */
export type DTCGColorSpace =
  | 'srgb'
  | 'srgb-linear'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'display-p3'
  | 'a98-rgb'
  | 'prophoto-rgb'
  | 'rec2020'
  | 'xyz-d65'
  | 'xyz-d50'

/**
 * A numeric color component or the DTCG missing-component marker.
 *
 * @remarks
 * `none` marks a component as missing. It has a different meaning from zero.
 *
 * @see [DTCG `none` keyword](https://www.designtokens.org/tr/2025.10/color/#the-none-keyword)
 *
 * @public
 */
export type DTCGColorComponent = number | 'none'

/**
 * A DTCG Color 2025.10 value.
 *
 * @remarks
 * Each color has three components. The allowed numeric range depends on
 * `colorSpace`. `alpha` ranges from 0 through 1. `hex` is an optional six-digit
 * sRGB fallback.
 *
 * @see [DTCG color value format](https://www.designtokens.org/tr/2025.10/color/#format)
 *
 * @public
 */
export interface DTCGColorValue {
  colorSpace: DTCGColorSpace
  components: [DTCGColorComponent, DTCGColorComponent, DTCGColorComponent]
  alpha?: number
  hex?: string
}

/**
 * Four control-point coordinates for a DTCG cubic Bezier curve.
 *
 * @remarks
 * The entries are P1x, P1y, P2x, and P2y. Both x coordinates range from 0
 * through 1. Both y coordinates may be any finite number.
 *
 * @see [DTCG cubic Bezier type](https://www.designtokens.org/tr/2025.10/format/#cubic-bezier)
 *
 * @public
 */
export type DTCGCubicBezierValue = [number, number, number, number]

/** DTCG dimension value. @public */
export interface DTCGDimensionValue {
  value: number
  unit: 'px' | 'rem'
}

/**
 * A DTCG duration with a numeric value and an `ms` or `s` unit.
 *
 * @see [DTCG duration type](https://www.designtokens.org/tr/2025.10/format/#duration)
 *
 * @public
 */
export interface DTCGDurationValue {
  value: number
  unit: 'ms' | 's'
}

/**
 * A DTCG font family name or ordered fallback list.
 *
 * @remarks
 * A string names one font family. A string array keeps the authored fallback
 * order.
 *
 * @see [DTCG font family type](https://www.designtokens.org/tr/2025.10/format/#font-family)
 *
 * @public
 */
export type DTCGFontFamilyValue = string | string[]

/**
 * A DTCG font weight number or named value.
 *
 * @remarks
 * Numeric values range from 1 through 1000. Named values use the lowercase
 * names listed by DTCG 2025.10.
 *
 * @see [DTCG font weight type](https://www.designtokens.org/tr/2025.10/format/#font-weight)
 *
 * @public
 */
export type DTCGFontWeightValue =
  | number
  | 'thin'
  | 'hairline'
  | 'extra-light'
  | 'ultra-light'
  | 'light'
  | 'normal'
  | 'regular'
  | 'book'
  | 'medium'
  | 'semi-bold'
  | 'demi-bold'
  | 'bold'
  | 'extra-bold'
  | 'ultra-bold'
  | 'black'
  | 'heavy'
  | 'extra-black'
  | 'ultra-black'

/**
 * Token types that Primitree reads or emits.
 *
 * @remarks
 * DTCG 2025.10 does not define `boolean`. Primitree documents it as an
 * extension because Figma variables support boolean values.
 *
 * @public
 */
export type DTCGTokenType =
  | 'color'
  | 'cubicBezier'
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
  | DTCGCubicBezierValue
  | DTCGDimensionValue
  | DTCGDurationValue
  | DTCGFontFamilyValue
  | DTCGFontWeightValue
  | string
  | number
  | boolean

/** Figma metadata preserved under `$extensions['com.primitree']`. @public */
export interface FigmaMetadataExtension {
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
  $deprecated?: boolean | string
  $extensions?: Record<string, unknown>
}

/** A DTCG group: nested groups and tokens. @public */
export interface DTCGGroup {
  [name: string]:
    | DTCGToken
    | DTCGGroup
    | string
    | boolean
    | Record<string, unknown>
    | undefined
  $type?: DTCGTokenType
  $description?: string
  $deprecated?: boolean | string
  $extensions?: Record<string, unknown>
  $root?: DTCGToken
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
