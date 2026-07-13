import type {
  Color,
  ResolvedType,
  VariableScope,
  VariableValue,
} from './figma.js'

/**
 * Payload for creating a new Figma variable in a specific collection.
 *
 * @remarks
 * Use with the `useCreateVariable` hook to specify the properties of the new variable.
 * Optional fields allow customization of description, publishing visibility, scopes, and code syntax.
 *
 * @property name - The human-readable name of the variable.
 * @property variableCollectionId - The ID of the collection this variable belongs to.
 * @property resolvedType - The data type of the variable value (e.g., 'COLOR', 'FLOAT').
 * @property description - Optional description text for documentation or tooling.
 * @property hiddenFromPublishing - Optional flag to hide the variable from published styles.
 * @property scopes - Optional list of scopes restricting where the variable can be applied.
 * @property codeSyntax - Optional mapping of language identifiers to code snippets for this variable.
 *
 * @example
 * ```ts
 * import type { CreateVariablePayload } from '@figmavars/hooks';
 *
 * const newVariable: CreateVariablePayload = {
 *   name: 'Primary Color',
 *   variableCollectionId: 'VariableCollectionId:123:456',
 *   resolvedType: 'COLOR',
 *   description: 'Main brand color',
 *   hiddenFromPublishing: false,
 *   scopes: ['ALL_FILLS'],
 *   codeSyntax: { css: 'var(--primary-color)' },
 * }
 * ```
 *
 * @public
 */
export interface CreateVariablePayload {
  name: string
  variableCollectionId: string
  resolvedType: ResolvedType
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}

/**
 * Payload for updating properties of an existing Figma variable.
 *
 * @remarks
 * Use with the `useUpdateVariable` hook to specify fields to update.
 * All fields are optional, allowing partial updates.
 *
 * @property name - New name for the variable.
 * @property description - New description text.
 * @property hiddenFromPublishing - Update publishing visibility.
 * @property scopes - Update scopes.
 * @property codeSyntax - Update code syntax mapping.
 *
 * @example
 * ```ts
 * import type { UpdateVariablePayload } from '@figmavars/hooks';
 *
 * const updatePayload: UpdateVariablePayload = {
 *   name: 'Updated Color Name',
 *   description: 'Updated description',
 * }
 * ```
 *
 * @public
 */
export interface UpdateVariablePayload {
  name?: string
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}

/**
 * Enum of possible mutation actions for variables, collections, or modes.
 *
 * @remarks
 * Used internally and in bulk update payloads to indicate the type of change.
 *
 * @public
 */
export type VariableAction = 'CREATE' | 'UPDATE' | 'DELETE'

type ChangeId = { id: string }
type TemporaryId = { id?: string }
type RootCollectionCreate = {
  parentVariableCollectionId?: never
  initialModeId?: string
  initialModeIdToParentModeIdMapping?: never
}
type ExtendedCollectionCreate = {
  parentVariableCollectionId: string
  initialModeId?: never
  initialModeIdToParentModeIdMapping?: Record<string, string>
}

/**
 * Represents a change operation on a Figma variable collection.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete collections.
 *
 * Create actions require a name and may provide a temporary ID. Root collections
 * can provide an initial mode ID, while extended collections identify their parent
 * and may map parent mode IDs. Update and delete actions require an existing ID.
 *
 * @example
 * ```ts
 * import type { VariableCollectionChange } from '@figmavars/hooks';
 *
 * const change: VariableCollectionChange = {
 *   action: 'CREATE',
 *   name: 'New Collection',
 *   initialModeId: 'MODE:dark',
 * }
 * ```
 *
 * @public
 */
export type VariableCollectionChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      hiddenFromPublishing?: boolean
    } & (RootCollectionCreate | ExtendedCollectionCreate))
  | (ChangeId & {
      action: 'UPDATE'
      name?: string
      hiddenFromPublishing?: boolean
    })
  | (ChangeId & { action: 'DELETE' })

/**
 * Represents a change operation on a Figma variable mode.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete modes.
 *
 * Create actions require a name and collection ID and may provide a temporary ID.
 * Update and delete actions require an existing mode ID and collection ID.
 *
 * @example
 * ```ts
 * import type { VariableModeChange } from '@figmavars/hooks';
 *
 * const modeChange: VariableModeChange = {
 *   action: 'CREATE',
 *   name: 'Light Mode',
 *   variableCollectionId: 'VariableCollectionId:123:456',
 * }
 * ```
 *
 * @public
 */
export type VariableModeChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      variableCollectionId: string
    })
  | (ChangeId & {
      action: 'UPDATE'
      name?: string
      variableCollectionId: string
    })
  | (ChangeId & { action: 'DELETE'; variableCollectionId: string })

type VariableMutableFields = {
  name?: string
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}

/**
 * Represents a change operation on a Figma variable.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete variables.
 *
 * Create actions require a name, collection ID, and resolved type and may provide
 * a temporary ID. Update and delete actions require an existing variable ID;
 * creation-only fields cannot be changed later.
 *
 * @example
 * ```ts
 * import type { VariableChange } from '@figmavars/hooks';
 *
 * const varChange: VariableChange = {
 *   action: 'DELETE',
 *   id: 'VariableID:123:456',
 * }
 * ```
 *
 * @public
 */
export type VariableChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      variableCollectionId: string
      resolvedType: ResolvedType
      description?: string
      hiddenFromPublishing?: boolean
      scopes?: VariableScope[]
      codeSyntax?: Record<string, string>
    })
  | (ChangeId & { action: 'UPDATE' } & VariableMutableFields)
  | (ChangeId & { action: 'DELETE' })

/**
 * Value assignment for a specific Figma variable in a specific mode.
 *
 * @remarks
 * Used to represent the value of a variable for a given mode in bulk updates and payloads.
 *
 * @property variableId - The Figma variable ID being set.
 * @property modeId - The mode ID (e.g., 'MODE:dark') this value applies to.
 * @property value - The variable value, including RGB/RGBA colors, aliases, or null to remove an override.
 *
 * @example
 * ```ts
 * import type { VariableModeValue } from '@figmavars/hooks';
 *
 * const modeValue: VariableModeValue = {
 *   variableId: 'VariableID:123:456',
 *   modeId: 'MODE:dark',
 *   value: { r: 0, g: 0, b: 0, a: 1 },
 * };
 * ```
 *
 * @public
 */
export type VariableMutationValue = VariableValue | Omit<Color, 'a'> | null

export interface VariableModeValue {
  variableId: string
  modeId: string
  value: VariableMutationValue
}

/**
 * Payload for performing a bulk update of Figma variables, collections, modes, and values.
 *
 * @remarks
 * Use with the `useBulkUpdateVariables` hook to perform atomic multi-entity updates.
 *
 * @property variableCollections - Optional array of collection changes.
 * @property variableModes - Optional array of mode changes.
 * @property variables - Optional array of variable changes.
 * @property variableModeValues - Optional array of variable-mode value assignments.
 *
 * @example
 * ```ts
 * import type { BulkUpdatePayload } from '@figmavars/hooks';
 *
 * const payload: BulkUpdatePayload = {
 *   variableCollections: [{ action: 'UPDATE', id: 'VariableCollectionId:123', name: 'New Name' }],
 *   variableModes: [{ action: 'CREATE', name: 'Light', variableCollectionId: 'VariableCollectionId:123' }],
 *   variables: [{ action: 'DELETE', id: 'VariableID:456' }],
 *   variableModeValues: [{ variableId: 'VariableID:789', modeId: 'MODE:dark', value: true }],
 * }
 * ```
 *
 * @public
 */
export interface BulkUpdatePayload {
  variableCollections?: VariableCollectionChange[]
  variableModes?: VariableModeChange[]
  variables?: VariableChange[]
  variableModeValues?: VariableModeValue[]
}

/**
 * Response from bulk update mutation API calls.
 *
 * @remarks
 * Contains status, error indication, and optional mapping of temporary to real IDs.
 *
 * @property error - Boolean indicating if an error occurred.
 * @property status - HTTP status code from the API response.
 * @property message - Optional human-readable error or status message.
 * @property meta - Optional metadata including temporary-to-real ID mapping.
 *
 * @example
 * ```ts
 * import type { BulkUpdateResponse } from '@figmavars/hooks';
 *
 * function handleResponse(response: BulkUpdateResponse) {
 *   if (response.error) {
 *     console.error('Update failed:', response.message);
 *   } else {
 *     console.log('Update succeeded, IDs:', response.meta?.tempIdToRealId);
 *   }
 * }
 * ```
 *
 * @public
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
 * Generic state shape for mutation hooks.
 *
 * @remarks
 * Tracks mutation lifecycle states (`idle`, `loading`, `success`, `error`), along with data and error info.
 *
 * @typeParam TData - The type of data returned by the mutation.
 *
 * @public
 */
export interface MutationState<TData> {
  status: 'idle' | 'loading' | 'success' | 'error'
  data: TData | null
  error: Error | null
}

/**
 * Options for configuring mutation behavior.
 *
 * @public
 */
export interface MutationOptions {
  /**
   * Controls error handling behavior for the mutation.
   *
   * - **`false` (default)**: Errors are caught and stored in the `error` state.
   *   The `mutate` function returns `undefined` on error.
   *   Use the `isError` flag and `error` state to handle failures reactively.
   *
   * - **`true`**: Errors are rethrown, allowing try/catch error handling.
   *   The `mutate` function throws on error.
   *   Use this when you need imperative error handling.
   *
   * @default false
   */
  throwOnError?: boolean
}

/**
 * Return value of mutation hooks.
 *
 * @remarks
 * Combines mutation state with a `mutate` trigger function accepting a payload,
 * along with convenient booleans for status checking.
 *
 * ## Return Value Semantics
 *
 * The `mutate` function returns `Promise<TData | undefined>`:
 *
 * - **On success**: Returns the mutation result data (`TData`)
 * - **On error with `throwOnError: false` (default)**: Returns `undefined` and stores error in `error` state
 * - **On error with `throwOnError: true`**: Throws the error (use try/catch)
 *
 * ## Recommended Patterns
 *
 * ```ts
 * // Pattern 1: Check return value (when throwOnError is false)
 * const result = await mutate(payload);
 * if (result === undefined) {
 *   // Check error state
 *   console.error('Mutation failed:', error);
 * } else {
 *   // Use result
 *   console.log('Created:', result);
 * }
 *
 * // Pattern 2: Use try/catch (when throwOnError is true)
 * try {
 *   const result = await mutate(payload);
 *   console.log('Created:', result);
 * } catch (err) {
 *   console.error('Mutation failed:', err);
 * }
 *
 * // Pattern 3: Use status flags (reactive)
 * if (isSuccess) {
 *   console.log('Created:', data);
 * }
 * if (isError) {
 *   console.error('Failed:', error);
 * }
 * ```
 *
 * @typeParam TData - The type of data returned by the mutation.
 * @typeParam TPayload - The payload type accepted by the mutation trigger.
 *
 * @public
 */
export interface MutationResult<TData, TPayload> {
  /**
   * Trigger the mutation with the given payload.
   *
   * @returns Promise resolving to the mutation result, or `undefined` if an error occurred
   * and `throwOnError` is false. When `throwOnError` is true, errors are thrown instead.
   */
  mutate: (payload: TPayload) => Promise<TData | undefined>
  /** Current mutation status: 'idle' | 'loading' | 'success' | 'error' */
  status: 'idle' | 'loading' | 'success' | 'error'
  /** The result data from a successful mutation, or `null` if not yet successful. */
  data: TData | null
  /** The error from a failed mutation, or `null` if no error. */
  error: Error | null
  /** `true` while the mutation is in progress. */
  isLoading: boolean
  /** `true` after a successful mutation. */
  isSuccess: boolean
  /** `true` after a failed mutation. */
  isError: boolean
}
