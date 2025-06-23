// Figma API types

export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

export type VariableScope =
  | 'ALL_SCOPES'
  | 'TEXT_CONTENT'
  | 'CORNER_RADIUS'
  | 'WIDTH_HEIGHT'
  | 'GAP'
  | 'FILL'
  | 'STROKE'
  | 'OPACITY'
  | 'EFFECT'
  | 'FONT_FAMILY'
  | 'FONT_WEIGHT'
  | 'FONT_STYLE'
  | 'FONT_SIZE'
  | 'LINE_HEIGHT'
  | 'LETTER_SPACING'
  | 'PARAGRAPH_SPACING'
  | 'PARAGRAPH_INDENT'
  | 'TEXT_CASE'
  | 'TEXT_DECORATION'

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface VariableAlias {
  type: 'VARIABLE_ALIAS'
  id: string
}

export type VariableValue = string | boolean | number | Color | VariableAlias

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

export interface VariableMode {
  modeId: string
  name: string
}

export interface FigmaCollection {
  id: string
  name: string
  modes: VariableMode[]
  defaultModeId: string
  variableIds: string[]
  hiddenFromPublishing: boolean
  updatedAt: string
}

export interface LocalVariablesResponse {
  meta: {
    variableCollections: Record<string, FigmaCollection>
    variables: Record<string, FigmaVariable>
  }
}

export interface FigmaError {
  statusCode: number
  message: string
}
