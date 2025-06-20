// Figma API types

/**
 * The resolved type of a Figma variable.
 */
export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

/**
 * The scopes where a Figma variable can be applied.
 * `ALL_SCOPES` is a general-purpose scope. Other values restrict the variable to specific properties.
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
 */
export type VariableValue = string | boolean | number | Color | VariableAlias

/**
 * Represents a single Figma variable.
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
 */
export interface VariableMode {
  /** The unique identifier for the mode. */
  modeId: string
  /** The name of the mode (e.g., "Light", "Dark"). */
  name: string
}

/**
 * Represents a collection of Figma variables, which can contain multiple modes.
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
 */
export interface FigmaError {
  /** The HTTP status code of the error. */
  statusCode: number
  /** The error message from the API. */
  message: string
}
