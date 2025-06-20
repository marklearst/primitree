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
  variableCollectionId: string
  resolvedType: ResolvedType
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
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

// Types for the POST /v1/files/:file_key/variables (bulk) endpoint

export type VariableAction = 'CREATE' | 'UPDATE' | 'DELETE'

export interface VariableCollectionChange {
  action: VariableAction
  id: string
  name?: string
  initialModeId?: string
  hiddenFromPublishing?: boolean
}

export interface VariableModeChange {
  action: VariableAction
  id: string
  name?: string
  variableCollectionId: string
}

export interface VariableChange {
  action: VariableAction
  id: string
  name?: string
  variableCollectionId?: string
  resolvedType?: ResolvedType
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}

export interface VariableModeValue {
  variableId: string
  modeId: string
  value: VariableValue
}

export interface BulkUpdatePayload {
  variableCollections?: VariableCollectionChange[]
  variableModes?: VariableModeChange[]
  variables?: VariableChange[]
  variableModeValues?: VariableModeValue[]
}

export interface BulkUpdateResponse {
  error: boolean
  status: number
  message?: string
  meta?: {
    tempIdToRealId: Record<string, string>
  }
}
