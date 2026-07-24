/**
 * Figma variable resolved type.
 *
 * @remarks
 * Figma returns this value in a variable's `resolvedType` field.
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
 * Scope accepted by the Figma Variables API.
 *
 * @remarks
 * A scope controls where Figma offers a variable in the editor.
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
 * RGBA value for a Figma `COLOR` variable.
 *
 * @remarks
 * Each component ranges from 0 through 1.
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
 * Reference to another Figma variable.
 *
 * @remarks
 * The `type` discriminator has the fixed value `VARIABLE_ALIAS`.
 *
 * @example
 * ```ts
 * const alias: VariableAlias = { type: 'VARIABLE_ALIAS', id: 'VariableID:123:456' }
 * ```
 *
 * @public
 */
export interface VariableAlias {
  /** Fixed `VARIABLE_ALIAS` discriminator. */
  type: 'VARIABLE_ALIAS'
  /** The referenced variable's Figma variable ID. */
  id: string
}

/**
 * Value accepted by Figma variable payloads and responses.
 *
 * @public
 */
export type VariableValue = string | boolean | number | Color | VariableAlias

/**
 * Figma local variable returned by the Variables REST API.
 *
 * @remarks
 * `valuesByMode` maps each mode ID to its value. `variableCollectionId`
 * identifies the owning collection.
 *
 * @property id - Unique Figma variable ID
 * @property name - Human-readable variable name
 * @property variableCollectionId - Parent collection ID
 * @property resolvedType - Data type for this variable (BOOLEAN, FLOAT, STRING, or COLOR)
 * @property valuesByMode - Map of mode IDs to variable values (by type)
 * @property description - Optional freeform description
 * @property hiddenFromPublishing - Set to true to hide this variable from publishing
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
 * Mode declared by a Figma variable collection.
 *
 * @remarks
 * A collection maps variable values to its mode IDs.
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
 * Figma variable collection with its modes and variable IDs.
 *
 * @remarks
 * The collection owns the listed variables and supplies their mode IDs.
 *
 * @property id - Unique Figma collection ID
 * @property name - Human-readable collection name
 * @property modes - List of VariableMode objects
 * @property defaultModeId - The default mode for this collection
 * @property variableIds - Array of IDs of variables in this collection
 * @property hiddenFromPublishing - Set to true to hide this collection from publishing
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
 * Response from the Figma local variables endpoint.
 *
 * @remarks
 * `meta` contains ID-keyed local collections and variables for one file.
 *
 * @property meta - Metadata object containing collections and variables.
 * @property meta.variableCollections - Map of collection IDs to FigmaCollection objects.
 * @property meta.variables - Map of variable IDs to FigmaVariable objects.
 *
 * @example
 * ```ts
 * import type { LocalVariablesResponse } from '@figmavars/core';
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

/**
 * Published Figma variable returned by the Variables REST API.
 *
 * @public
 */
export interface PublishedVariable {
  id: string
  subscribed_id: string
  name: string
  key: string
  variableCollectionId: string
  resolvedType: ResolvedType
  updatedAt: string
}

/**
 * Published Figma variable collection returned by the Variables REST API.
 *
 * @public
 */
export interface PublishedVariableCollection {
  id: string
  subscribed_id: string
  name: string
  key: string
  updatedAt: string
}

/**
 * Response from the Figma published variables endpoint.
 *
 * @public
 */
export interface PublishedVariablesResponse {
  meta: {
    variableCollections: Record<string, PublishedVariableCollection>
    variables: Record<string, PublishedVariable>
  }
}

/**
 * Error data returned by the Figma REST API.
 *
 * @remarks
 * The response contains an HTTP status code and message.
 *
 * @property statusCode - HTTP status code returned by the Figma API.
 * @property message - Human-readable error message describing the failure.
 *
 * @example
 * ```ts
 * import type { FigmaError } from '@figmavars/core';
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

/**
 * Figma REST helpers throw this error after an unsuccessful API response.
 *
 * @remarks
 * The error keeps the HTTP status code. A 429 response can include the
 * `Retry-After` value in seconds.
 *
 * @example
 * ```ts
 * import { FigmaApiError } from '@figmavars/core';
 *
 * try {
 *   await fetcher(url, token);
 * } catch (error) {
 *   if (error instanceof FigmaApiError) {
 *     if (error.statusCode === 401) {
 *       // Handle authentication error
 *     } else if (error.statusCode === 429) {
 *       // Handle rate limit
 *       console.log(`Retry after ${error.retryAfter} seconds`);
 *     }
 *   }
 * }
 * ```
 *
 * @public
 */
export class FigmaApiError extends Error {
  /** HTTP status code from the API response. */
  public readonly statusCode: number
  /**
   * Retry-After header value in seconds (for 429 rate limit errors).
   * Undefined if not a rate limit error or header not present.
   */
  public readonly retryAfter: number | undefined

  constructor(message: string, statusCode: number, retryAfter?: number) {
    super(message)
    this.name = 'FigmaApiError'
    this.statusCode = statusCode
    this.retryAfter = retryAfter ?? undefined
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FigmaApiError)
    }
  }
}
