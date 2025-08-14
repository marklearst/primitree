// Mutation payload/result types

import type { ResolvedType, VariableScope, VariableValue } from './figma'

/**
 * The payload for the `createVariable` function.
 * Defines the properties for a new variable.
 */
export interface CreateVariablePayload {
  /** The name of the new variable. */
  name: string
  /** The ID of the collection the new variable should be added to. */
  variableCollectionId: string
  /** The underlying data type for the new variable. */
  resolvedType: ResolvedType
  /** An optional description for the new variable. */
  description?: string
  /** Whether the new variable should be hidden when publishing. Defaults to `false`. */
  hiddenFromPublishing?: boolean
  /** The scopes in which this variable can be used. */
  scopes?: VariableScope[]
  /** Platform-specific code syntax for this variable. */
  codeSyntax?: Record<string, string>
}

/**
 * The payload for the `updateVariable` function.
 * All properties are optional.
 */
export interface UpdateVariablePayload {
  /** The new name for the variable. */
  name?: string
  /** The new description for the variable. */
  description?: string
  /** The new hidden status for the variable. */
  hiddenFromPublishing?: boolean
  /** The new scopes for the variable. */
  scopes?: VariableScope[]
  /** The new code syntax for the variable. */
  codeSyntax?: Record<string, string>
}

// Types for the POST /v1/files/:file_key/variables (bulk) endpoint

/**
 * The action to perform in a bulk update.
 * @internal
 */
export type VariableAction = 'CREATE' | 'UPDATE' | 'DELETE'

/**
 * A change to a variable collection in a bulk update.
 * @internal
 */
export interface VariableCollectionChange {
  action: VariableAction
  id: string
  name?: string
  initialModeId?: string
  hiddenFromPublishing?: boolean
}

/**
 * A change to a variable mode in a bulk update.
 * @internal
 */
export interface VariableModeChange {
  action: VariableAction
  id: string
  name?: string
  variableCollectionId: string
}

/**
 * A change to a variable's properties in a bulk update.
 * @internal
 */
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

/**
 * A change to a variable's value in a specific mode in a bulk update.
 */
export interface VariableModeValue {
  /** The ID of the variable to update. */
  variableId: string
  /** The ID of the mode to update. */
  modeId: string
  /** The new value for the variable in this mode. */
  value: VariableValue
}

/**
 * The payload for the `bulkUpdateVariables` function.
 * Allows creating, updating, and deleting multiple variables, collections, and modes in one call.
 * This corresponds to the `POST /v1/files/:file_key/variables` endpoint.
 * Note: Figma has deprecated this complex endpoint in favor of simpler, more granular ones.
 * This type is kept for legacy purposes but its usage is not recommended.
 */
export interface BulkUpdatePayload {
  /** A list of changes to variable collections. */
  variableCollections?: VariableCollectionChange[]
  /** A list of changes to variable modes. */
  variableModes?: VariableModeChange[]
  /** A list of changes to variables. */
  variables?: VariableChange[]
  /** A list of changes to variable values in specific modes. */
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

/**
 * Represents the state of a mutation operation.
 * @template TData The type of data returned by the mutation.
 * @template TError The type of error returned by the mutation.
 */
export interface MutationState<TData> {
  status: 'idle' | 'loading' | 'success' | 'error'
  data: TData | null
  error: Error | null
}

/**
 * The result object returned by the `useMutation` hook.
 * @template TData The type of data returned by the mutation.
 * @template TPayload The type of the payload passed to the mutate function.
 */
export interface MutationResult<TData, TPayload> {
  mutate: (payload: TPayload) => Promise<TData | undefined>
  status: 'idle' | 'loading' | 'success' | 'error'
  data: TData | null
  error: Error | null
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
}
