/**
 * Enum of supported variable value types in Figma.
 *
 * @remarks
 * Used as the `resolvedType` for Figma variables—defines if the value is a boolean, float, string, or color.
 *
 * @example
 * ```ts
 * const type: ResolvedType = 'COLOR'
 * ```
 *
 * @public
 */
export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

/**
 * Enum of all valid Figma variable scopes.
 *
 * @remarks
 * Scopes define where a variable can be referenced or applied (e.g., fills, text content, opacity, effects).
 * Use this to restrict variables to certain design properties in the Figma UI or API.
 *
 * @example
 * ```ts
 * const scopes: VariableScope[] = ['ALL_FILLS', 'TEXT_CONTENT']
 * ```
 *
 * @public
 */
export type VariableScope =
  | 'ALL_SCOPES'
  | 'TEXT_CONTENT'
  | 'CORNER_RADIUS'
  | 'WIDTH_HEIGHT'
  | 'GAP'
  | 'STROKE_FLOAT'
  | 'OPACITY'
  | 'EFFECT_FLOAT'
  | 'FONT_WEIGHT'
  | 'FONT_SIZE'
  | 'LINE_HEIGHT'
  | 'LETTER_SPACING'
  | 'PARAGRAPH_SPACING'
  | 'PARAGRAPH_INDENT'
  | 'FONT_FAMILY'
  | 'FONT_STYLE'
  | 'FONT_VARIATIONS'
  | 'ALL_FILLS'
  | 'FRAME_FILL'
  | 'SHAPE_FILL'
  | 'TEXT_FILL'
  | 'STROKE_COLOR'
  | 'EFFECT_COLOR'

/**
 * RGBA color value used by Figma variables of type COLOR.
 *
 * @remarks
 * Each component is a float between 0 and 1 (inclusive), matching the Figma API spec.
 * Used for color values in variable payloads and responses.
 *
 * @example
 * ```ts
 * const color: Color = { r: 0.5, g: 0.8, b: 0.2, a: 1 }
 * ```
 *
 * @public
 */
export interface Color {
  /** Red channel, 0–1 */
  r: number
  /** Green channel, 0–1 */
  g: number
  /** Blue channel, 0–1 */
  b: number
  /** Alpha channel, 0–1 (opacity) */
  a: number
}

/**
 * Value representing a variable alias reference in Figma.
 *
 * @remarks
 * Used when a variable references another variable via aliasing. Type should always be 'VARIABLE_ALIAS'.
 *
 * @example
 * ```ts
 * const alias: VariableAlias = { type: 'VARIABLE_ALIAS', id: 'VariableID:123:456' }
 * ```
 *
 * @public
 */
export interface VariableAlias {
  /** Type identifier for variable alias objects. Always 'VARIABLE_ALIAS'. */
  type: 'VARIABLE_ALIAS'
  /** The referenced variable's Figma variable ID. */
  id: string
}

/**
 * Union of all supported Figma variable value types.
 *
 * - string, boolean, number, Color, or VariableAlias
 *
 * Used in payloads and responses for Figma variable APIs.
 *
 * @public
 */
export type VariableValue = string | boolean | number | Color | VariableAlias

/**
 * Model of a single Figma variable, including metadata, values by mode, and collection info.
 *
 * @remarks
 * Core unit for all Figma variable APIs. Includes value definitions, metadata, type info, and publishing flags. Variables are always associated with a collection and may have different values per mode.
 *
 * @property id - Unique Figma variable ID
 * @property name - Human-readable variable name
 * @property variableCollectionId - Parent collection ID
 * @property resolvedType - Data type for this variable (BOOLEAN, FLOAT, STRING, or COLOR)
 * @property valuesByMode - Map of mode IDs to variable values (by type)
 * @property description - Optional freeform description
 * @property hiddenFromPublishing - If true, this variable is hidden from publishing
 * @property scopes - Array of allowed or assigned Figma variable scopes
 * @property codeSyntax - Map of language IDs to code sample strings for this variable
 * @property updatedAt - ISO8601 timestamp of last update
 *
 * @example
 * ```ts
 * const variable: FigmaVariable = {
 *   id: 'VariableID:123:456',
 *   name: 'Primary Color',
 *   variableCollectionId: 'VariableCollectionId:789:012',
 *   resolvedType: 'COLOR',
 *   valuesByMode: { 'MODE:dark': { r: 0, g: 0, b: 0, a: 1 } },
 *   description: 'Main brand color',
 *   hiddenFromPublishing: false,
 *   scopes: ['ALL_FILLS'],
 *   codeSyntax: { css: 'var(--primary-color)' },
 *   updatedAt: '2024-06-21T23:59:59Z',
 * }
 * ```
 *
 * @public
 */
export interface FigmaVariable {
  id: string
  name: string
  variableCollectionId: string
  resolvedType: ResolvedType
  valuesByMode: Record<string, VariableValue>
  description: string
  hiddenFromPublishing: boolean
  scopes: VariableScope[]
  codeSyntax: Record<string, string>
  updatedAt: string
}

/**
 * Model of a Figma variable mode (e.g., Light, Dark, Custom).
 *
 * @remarks
 * Modes are used to provide variable overrides for different states (themes, breakpoints, etc.).
 * Each collection may define its own set of modes.
 *
 * @example
 * ```ts
 * const mode: VariableMode = { modeId: 'MODE:dark', name: 'Dark' }
 * ```
 *
 * @public
 */
export interface VariableMode {
  /** Unique mode ID */
  modeId: string
  /** Human-readable mode name */
  name: string
}

/**
 * Model of a Figma variable collection (grouping of related variables and modes).
 *
 * @remarks
 * Collections define shared settings, available modes, and membership of variables. Used as the organizing tier for all variable operations.
 *
 * @property id - Unique Figma collection ID
 * @property name - Human-readable collection name
 * @property modes - List of VariableMode objects
 * @property defaultModeId - The default mode for this collection
 * @property variableIds - Array of IDs of variables in this collection
 * @property hiddenFromPublishing - If true, collection is hidden from publishing
 * @property updatedAt - ISO8601 timestamp of last update
 *
 * @example
 * ```ts
 * const collection: FigmaCollection = {
 *   id: 'VariableCollectionId:789:012',
 *   name: 'Theme Colors',
 *   modes: [{ modeId: 'MODE:dark', name: 'Dark' }],
 *   defaultModeId: 'MODE:dark',
 *   variableIds: ['VariableID:123:456'],
 *   hiddenFromPublishing: false,
 *   updatedAt: '2024-06-21T23:59:59Z',
 * }
 * ```
 *
 * @public
 */
export interface FigmaCollection {
  id: string
  name: string
  modes: VariableMode[]
  defaultModeId: string
  variableIds: string[]
  hiddenFromPublishing: boolean
  updatedAt: string
}

/**
 * API response shape for the Figma Variables API local variables endpoint.
 *
 * @remarks
 * Contains all collections and variables available in the current Figma file context.
 * Use this as the source of truth for fetching and mapping Figma variable data.
 *
 * @property meta - Metadata object containing collections and variables.
 * @property meta.variableCollections - Map of collection IDs to FigmaCollection objects.
 * @property meta.variables - Map of variable IDs to FigmaVariable objects.
 *
 * @example
 * ```ts
 * import type { LocalVariablesResponse } from '@figma-vars/hooks';
 *
 * function handleResponse(response: LocalVariablesResponse) {
 *   const collections = Object.values(response.meta.variableCollections);
 *   const variables = Object.values(response.meta.variables);
 * }
 * ```
 *
 * @public
 */
export interface LocalVariablesResponse {
  meta: {
    /** Map of collection IDs to FigmaCollection objects. */
    variableCollections: Record<string, FigmaCollection>
    /** Map of variable IDs to FigmaVariable objects. */
    variables: Record<string, FigmaVariable>
  }
}

export interface PublishedVariable {
  id: string
  subscribed_id: string
  name: string
  key: string
  variableCollectionId: string
  resolvedType: ResolvedType
  updatedAt: string
}

export interface PublishedVariableCollection {
  id: string
  subscribed_id: string
  name: string
  key: string
  updatedAt: string
}

export interface PublishedVariablesResponse {
  meta: {
    variableCollections: Record<string, PublishedVariableCollection>
    variables: Record<string, PublishedVariable>
  }
}

/**
 * Standard error response shape for Figma API error objects.
 *
 * @remarks
 * Returned by API calls when an error occurs (e.g., invalid token, not found, etc.).
 *
 * @property statusCode - HTTP status code returned by the Figma API.
 * @property message - Human-readable error message describing the failure.
 *
 * @example
 * ```ts
 * import type { FigmaError } from '@figma-vars/hooks';
 *
 * function handleError(error: FigmaError) {
 *   console.error(error.statusCode, error.message);
 * }
 * ```
 *
 * @public
 */
export interface FigmaError {
  /** HTTP status code returned by the Figma API. */
  statusCode: number
  /** Human-readable error message describing the failure. */
  message: string
}
