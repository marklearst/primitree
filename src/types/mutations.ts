/**
 * @fileoverview TypeScript type definitions for mutation payloads and arguments.
 * These types define the structure of data required for creating, updating, and deleting Figma variables.
 * @see {@link https://www.figma.com/developers/api#variables|Figma Variables API Documentation}
 * @since 1.0.0
 */

import type { ResolvedType, VariableScope, VariableValue } from './figma'

/**
 * The payload for the `createVariable` function.
 * Defines the properties for a new variable.
 * 
 * @typedef {Object} CreateVariablePayload
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma API - Create Variable}
 * @property {string} name The name of the new variable.
 * @property {string} variableCollectionId The ID of the collection the new variable should be added to.
 * @property {ResolvedType} resolvedType The underlying data type for the new variable.
 * @property {string} [description] An optional description for the new variable.
 * @property {boolean} [hiddenFromPublishing] Whether the new variable should be hidden when publishing. Defaults to `false`.
 * @property {VariableScope[]} [scopes] The scopes in which this variable can be used.
 * @property {Record<string, string>} [codeSyntax] Platform-specific code syntax for this variable.
 * @property {Record<string, VariableValue>} [valuesByMode] Initial values for the variable by mode ID.
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
 * 
 * @typedef {Object} UpdateVariablePayload
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#patch-variables|Figma API - Update Variable}
 * @property {string} [name] The new name for the variable.
 * @property {string} [description] The new description for the variable.
 * @property {boolean} [hiddenFromPublishing] The new hidden status for the variable.
 * @property {VariableScope[]} [scopes] The new scopes for the variable.
 * @property {Record<string, string>} [codeSyntax] The new code syntax for the variable.
 * @property {Record<string, VariableValue>} [valuesByMode] New values for the variable by mode ID.
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
 * 
 * @typedef {('CREATE' | 'UPDATE' | 'DELETE')} VariableAction
 * @memberof Types
 * @since 1.0.0
 */
export type VariableAction = 'CREATE' | 'UPDATE' | 'DELETE'

/**
 * A change to a variable collection in a bulk update.
 * @internal
 * 
 * @typedef {Object} VariableCollectionChange
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma API - Create Variable Collection}
 * @property {VariableAction} action The action to perform on the variable collection.
 * @property {string} id The ID of the variable collection.
 * @property {string} [name] The new name for the variable collection.
 * @property {string} [initialModeId] The ID of the initial mode for the variable collection.
 * @property {boolean} [hiddenFromPublishing] Whether the variable collection should be hidden when publishing.
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
 * 
 * @typedef {Object} VariableModeChange
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma API - Create Variable Mode}
 * @property {VariableAction} action The action to perform on the variable mode.
 * @property {string} id The ID of the variable mode.
 * @property {string} [name] The new name for the variable mode.
 * @property {string} variableCollectionId The ID of the variable collection that the mode belongs to.
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
 * 
 * @typedef {Object} VariableChange
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#patch-variables|Figma API - Update Variable}
 * @property {VariableAction} action The action to perform on the variable.
 * @property {string} id The ID of the variable.
 * @property {string} [name] The new name for the variable.
 * @property {string} [variableCollectionId] The ID of the variable collection that the variable belongs to.
 * @property {ResolvedType} [resolvedType] The new underlying data type for the variable.
 * @property {string} [description] The new description for the variable.
 * @property {boolean} [hiddenFromPublishing] The new hidden status for the variable.
 * @property {VariableScope[]} [scopes] The new scopes for the variable.
 * @property {Record<string, string>} [codeSyntax] The new code syntax for the variable.
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
 * 
 * @typedef {Object} VariableModeValue
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#patch-variables|Figma API - Update Variable Value}
 * @property {string} variableId The ID of the variable to update.
 * @property {string} modeId The ID of the mode to update.
 * @property {VariableValue} value The new value for the variable in this mode.
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
 * 
 * @typedef {Object} BulkUpdatePayload
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma API - Bulk Update Variables}
 * @property {VariableCollectionChange[]} [variableCollections] A list of changes to variable collections.
 * @property {VariableModeChange[]} [variableModes] A list of changes to variable modes.
 * @property {VariableChange[]} [variables] A list of changes to variables.
 * @property {VariableModeValue[]} [variableModeValues] A list of changes to variable values in specific modes.
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

/**
 * The response object returned by the `bulkUpdateVariables` function.
 * 
 * @typedef {Object} BulkUpdateResponse
 * @memberof Types
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#post-variables|Figma API - Bulk Update Variables}
 * @property {boolean} error Whether an error occurred during the bulk update.
 * @property {number} status The HTTP status code of the response.
 * @property {string} [message] A message describing the result of the bulk update.
 * @property {Object} [meta] Additional metadata about the bulk update.
 * @property {Record<string, string>} [meta.tempIdToRealId] A mapping of temporary IDs to real IDs for created variables.
 */
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
 * 
 * @typedef {Object} MutationState
 * @memberof Types
 * @since 1.0.0
 * @property {'idle' | 'loading' | 'success' | 'error'} status The current status of the mutation.
 * @property {TData | null} data The data returned by the mutation, or null if the mutation has not completed.
 * @property {Error | null} error The error returned by the mutation, or null if the mutation was successful.
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
 * 
 * @typedef {Object} MutationResult
 * @memberof Types
 * @since 1.0.0
 * @property {(payload: TPayload) => Promise<TData | undefined>} mutate A function to trigger the mutation.
 * @property {'idle' | 'loading' | 'success' | 'error'} status The current status of the mutation.
 * @property {TData | null} data The data returned by the mutation, or null if the mutation has not completed.
 * @property {Error | null} error The error returned by the mutation, or null if the mutation was successful.
 * @property {boolean} isLoading Whether the mutation is currently loading.
 * @property {boolean} isSuccess Whether the mutation was successful.
 * @property {boolean} isError Whether the mutation resulted in an error.
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
