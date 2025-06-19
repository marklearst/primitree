// Mutation payload/result types

import type {
  FigmaVariable,
  ResolvedType,
  VariableScope,
  VariableValue,
} from './figma'

export interface FigmaOperationResponse {
  success: boolean
  message?: string
}

export interface VariableValueUpdate {
  modeId: string
  value: string // or any, if the value can be more complex
}

export type SpecificType = VariableValueUpdate[]

export interface CreateVariablePayload {
  name: string
  collectionId: string
  resolvedType: ResolvedType
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
  valuesByMode?: Record<string, VariableValue>
}

export interface VariableActionResponse {
  error: boolean
  status: number
  message?: string
  variable?: FigmaVariable
}

export interface UpdateVariablePayload {
  name?: string
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}
