/**
 * @fileoverview TypeScript type definitions for the Figma Variables REST API.
 * These types match the official Figma API specification for variables, collections, and modes.
 * @see {@link https://www.figma.com/developers/api#variables|Figma Variables API Documentation}
 * @since 1.0.0
 */

/**
 * The resolved type of a Figma variable.
 * Determines what kind of value the variable can hold.
 * 
 * @typedef {string} ResolvedType
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
 */
export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

/**
 * The scopes where a Figma variable can be applied.
 * `ALL_SCOPES` is a general-purpose scope. Other values restrict the variable to specific properties.
 * 
 * @typedef {string} VariableScope
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
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
 * Represents a color in RGBA format.
 * 
 * @typedef {Object} Color
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#color-object|Figma Color Object}
 * @property {number} r The red channel value (0-1).
 * @property {number} g The green channel value (0-1).
 * @property {number} b The blue channel value (0-1).
 * @property {number} a The alpha (opacity) channel value (0-1).
 */
export interface Color {
  /** The red channel value (0-1). */
  r: number
  /** The green channel value (0-1). */
  g: number
  /** The blue channel value (0-1). */
  b: number
  /** The alpha (opacity) channel value (0-1). */
  a: number
}

/**
 * Represents an alias to another Figma variable.
 * This is used when a variable's value is set to reference another variable.
 * 
 * @typedef {Object} VariableAlias
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
 * @property {string} type The type of the value, indicating it's a variable alias.
 * @property {string} id The ID of the variable being referenced.
 */
export interface VariableAlias {
  /** The type of the value, indicating it's a variable alias. */
  type: 'VARIABLE_ALIAS'
  /** The ID of the variable being referenced. */
  id: string
}

/**
 * The possible value types for a variable in a specific mode.
 * It can be a primitive value, a color object, or an alias to another variable.
 * 
 * @typedef {(string|boolean|number|Color|VariableAlias)} VariableValue
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
 */
export type VariableValue = string | boolean | number | Color | VariableAlias

/**
 * Represents a single Figma variable.
 * 
 * @typedef {Object} FigmaVariable
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-object|Figma Variable Object}
 * @property {string} id The unique identifier for the variable.
 * @property {string} name The name of the variable.
 * @property {string} variableCollectionId The ID of the collection this variable belongs to.
 * @property {ResolvedType} resolvedType The underlying data type of the variable.
 * @property {Record<string, VariableValue>} valuesByMode A map of mode IDs to the variable's value in that mode.
 * @property {string} description The description of the variable, as set in Figma.
 * @property {boolean} hiddenFromPublishing Whether the variable is hidden when publishing the library.
 * @property {VariableScope[]} scopes The scopes in which this variable can be used.
 * @property {Record<string, string>} codeSyntax Platform-specific code syntax for this variable (e.g., for Web, iOS, Android).
 * @property {string} updatedAt The timestamp of the last update.
 */
export interface FigmaVariable {
  /** The unique identifier for the variable. */
  id: string
  /** The name of the variable. */
  name: string
  /** The ID of the collection this variable belongs to. */
  variableCollectionId: string
  /** The underlying data type of the variable. */
  resolvedType: ResolvedType
  /** A map of mode IDs to the variable's value in that mode. */
  valuesByMode: Record<string, VariableValue>
  /** The description of the variable, as set in Figma. */
  description: string
  /** Whether the variable is hidden when publishing the library. */
  hiddenFromPublishing: boolean
  /** The scopes in which this variable can be used. */
  scopes: VariableScope[]
  /** Platform-specific code syntax for this variable (e.g., for Web, iOS, Android). */
  codeSyntax: Record<string, string>
  /** The timestamp of the last update. */
  updatedAt: string
}

/**
 * Represents a single mode within a variable collection.
 * 
 * @typedef {Object} VariableMode
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-collection-object|Figma Variable Collection Object}
 * @property {string} modeId The unique identifier for the mode.
 * @property {string} name The name of the mode (e.g., "Light", "Dark").
 */
export interface VariableMode {
  /** The unique identifier for the mode. */
  modeId: string
  /** The name of the mode (e.g., "Light", "Dark"). */
  name: string
}

/**
 * Represents a collection of Figma variables, which can contain multiple modes.
 * 
 * @typedef {Object} FigmaCollection
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variable-collection-object|Figma Variable Collection Object}
 * @property {string} id The unique identifier for the collection.
 * @property {string} name The name of the collection (e.g., "Brand Colors").
 * @property {VariableMode[]} modes An array of modes available in this collection.
 * @property {string} defaultModeId The ID of the default mode for this collection.
 * @property {string[]} variableIds An array of variable IDs that belong to this collection.
 * @property {boolean} hiddenFromPublishing Whether the collection is hidden when publishing the library.
 * @property {string} updatedAt The timestamp of the last update.
 */
export interface FigmaCollection {
  /** The unique identifier for the collection. */
  id: string
  /** The name of the collection (e.g., "Brand Colors"). */
  name: string
  /** An array of modes available in this collection. */
  modes: VariableMode[]
  /** The ID of the default mode for this collection. */
  defaultModeId: string
  /** An array of variable IDs that belong to this collection. */
  variableIds: string[]
  /** Whether the collection is hidden when publishing the library. */
  hiddenFromPublishing: boolean
  /** The timestamp of the last update. */
  updatedAt: string
}

/**
 * The structure of the successful response from the Figma API's `/v1/files/{file_key}/variables/local` endpoint.
 * 
 * @typedef {Object} LocalVariablesResponse
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#variables-endpoint|Figma Variables Endpoint}
 * @property {Object} meta Contains the metadata about the variables and collections.
 * @property {Record<string, FigmaCollection>} meta.variableCollections A map of collection IDs to `FigmaCollection` objects.
 * @property {Record<string, FigmaVariable>} meta.variables A map of variable IDs to `FigmaVariable` objects.
 */
export interface LocalVariablesResponse {
  /** Contains the metadata about the variables and collections. */
  meta: {
    /** A map of collection IDs to `FigmaCollection` objects. */
    variableCollections: Record<string, FigmaCollection>
    /** A map of variable IDs to `FigmaVariable` objects. */
    variables: Record<string, FigmaVariable>
  }
}

/**
 * A generic error shape for failed Figma API requests.
 * 
 * @typedef {Object} FigmaError
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#error-handling|Figma API Error Handling}
 * @property {number} statusCode The HTTP status code of the error.
 * @property {string} message The error message from the API.
 */
export interface FigmaError {
  /** The HTTP status code of the error. */
  statusCode: number
  /** The error message from the API. */
  message: string
}
