import type {
  Color,
  ResolvedType,
  VariableScope,
  VariableValue,
} from './figma.js'

/**
 * Fields for creating a Figma variable.
 *
 * @remarks
 * Figma requires `name`, `variableCollectionId`, and `resolvedType`.
 *
 * @property name - The human-readable name of the variable.
 * @property variableCollectionId - The ID of the collection this variable belongs to.
 * @property resolvedType - The data type of the variable value (e.g., 'COLOR', 'FLOAT').
 * @property description - Optional description text for documentation or tooling.
 * @property hiddenFromPublishing - Optional flag to hide the variable from published styles.
 * @property scopes - Optional scopes that restrict use of the variable.
 * @property codeSyntax - Optional mapping of language identifiers to code snippets for this variable.
 *
 * @example
 * ```ts
 * import type { CreateVariablePayload } from '@primitree/core';
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
 * Fields that a Figma variable update can change.
 *
 * @remarks
 * The API accepts partial updates.
 *
 * @property name - New name for the variable.
 * @property description - New description text.
 * @property hiddenFromPublishing - Update publishing visibility.
 * @property scopes - Update scopes.
 * @property codeSyntax - Update code syntax mapping.
 *
 * @example
 * ```ts
 * import type { UpdateVariablePayload } from '@primitree/core';
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
 * Figma Variables mutation action.
 *
 * @remarks
 * Bulk payload entries use this discriminator.
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
 * Create, update, or delete operation for a variable collection.
 *
 * @remarks
 * Create actions require a name and may provide a temporary ID. Root collections
 * can provide an initial mode ID, while extended collections identify their parent
 * and may map parent mode IDs. Update and delete actions require an existing ID.
 *
 * @example
 * ```ts
 * import type { VariableCollectionChange } from '@primitree/core';
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
 * Create, update, or delete operation for a variable mode.
 *
 * @remarks
 * Create actions require a name and collection ID and may provide a temporary ID.
 * Update and delete actions require an existing mode ID and collection ID.
 *
 * @example
 * ```ts
 * import type { VariableModeChange } from '@primitree/core';
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
 * Create, update, or delete operation for a Figma variable.
 *
 * @remarks
 * Create actions require a name, collection ID, and resolved type and may provide
 * a temporary ID. Update and delete actions require an existing variable ID.
 * Update actions cannot change fields that Figma accepts during creation.
 *
 * @example
 * ```ts
 * import type { VariableChange } from '@primitree/core';
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
 * Value for a Figma variable assignment in a mutation request.
 *
 * @remarks
 * Figma accepts `null` to remove an extended-mode override. Its `modeId` may
 * be an extended-mode ID or a mapped inherited-mode temporary ID. Figma
 * rejects `null` for root-mode values upstream.
 *
 * @public
 */
export type VariableMutationValue = VariableValue | Omit<Color, 'a'> | null

/**
 * Value assignment for one variable and mode.
 *
 * @remarks
 * A `null` value requires `modeId` to identify an extended-mode override.
 * `modeId` accepts an extended-mode ID or a mapped inherited-mode temporary
 * ID. Figma rejects root-mode `null` assignments upstream.
 *
 * @property variableId - ID of the Figma variable that receives the value.
 * @property modeId - The mode ID (e.g., 'MODE:dark') this value applies to.
 * @property value - The variable value, including RGB/RGBA colors, aliases, or null to remove an extended-mode override.
 *
 * @example
 * ```ts
 * import type { VariableModeValue } from '@primitree/core';
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
export interface VariableModeValue {
  variableId: string
  modeId: string
  value: VariableMutationValue
}

/**
 * Bulk mutation payload for collections, modes, variables, and values.
 *
 * @remarks
 * Figma processes the included changes in one request.
 *
 * @property variableCollections - Optional array of collection changes.
 * @property variableModes - Optional array of mode changes.
 * @property variables - Optional array of variable changes.
 * @property variableModeValues - Optional array of variable-mode value assignments.
 *
 * @example
 * ```ts
 * import type { BulkUpdatePayload } from '@primitree/core';
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
 * Response from a Figma Variables bulk mutation.
 *
 * @remarks
 * `meta.tempIdToRealId` maps client IDs to the IDs Figma created.
 *
 * @property error - True for an error response.
 * @property status - HTTP status code from the API response.
 * @property message - Optional human-readable error or status message.
 * @property meta - Optional metadata including temporary-to-real ID mapping.
 *
 * @example
 * ```ts
 * import type { BulkUpdateResponse } from '@primitree/core';
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
 * Mutation hook state.
 *
 * @remarks
 * The status, data, and error fields describe the latest mutation.
 *
 * @typeParam TData - Mutation result type.
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
   * Selects mutation error handling.
   *
   * - **`false` (default)**: The hook stores errors in the `error` state.
   *   `mutate` returns `undefined` on error.
   *   Read the `isError` flag and `error` state to handle the failure.
   *
   * - **`true`**: The hook rethrows errors for `try`/`catch`.
   *   The `mutate` function throws on error.
   *
   * @default false
   */
  throwOnError?: boolean
}

/**
 * Return value of mutation hooks.
 *
 * @remarks
 * Mutation state and the function that starts a mutation.
 *
 * ## Return Value Semantics
 *
 * The `mutate` function returns `Promise<TData | undefined>`:
 *
 * - **On success**: Returns the mutation result data (`TData`)
 * - **On error with `throwOnError: false` (default)**: Returns `undefined` and stores error in `error` state
 * - **On error with `throwOnError: true`**: Throws the error (use try/catch)
 *
 * ## Examples
 *
 * ```ts
 * // Check the return value when throwOnError is false.
 * const result = await mutate(payload);
 * if (result === undefined) {
 *   // Check error state
 *   console.error('Mutation failed:', error);
 * } else {
 *   // Use result
 *   console.log('Created:', result);
 * }
 *
 * // Use try/catch when throwOnError is true.
 * try {
 *   const result = await mutate(payload);
 *   console.log('Created:', result);
 * } catch (err) {
 *   console.error('Mutation failed:', err);
 * }
 *
 * // Read status flags while rendering.
 * if (isSuccess) {
 *   console.log('Created:', data);
 * }
 * if (isError) {
 *   console.error('Failed:', error);
 * }
 * ```
 *
 * @typeParam TData - Mutation result type.
 * @typeParam TPayload - Mutation payload type.
 *
 * @public
 */
export interface MutationResult<TData, TPayload> {
  /**
   * Trigger the mutation with the given payload.
   *
   * @returns The mutation result. With `throwOnError: false`, the function
   * returns `undefined` after an error. With `throwOnError: true`, it throws.
   */
  mutate: (payload: TPayload) => Promise<TData | undefined>
  /** Current mutation status: 'idle' | 'loading' | 'success' | 'error' */
  status: 'idle' | 'loading' | 'success' | 'error'
  /** Latest successful mutation result. Null before a successful mutation. */
  data: TData | null
  /** Latest mutation error. Null before a failure. */
  error: Error | null
  /** `true` while the mutation is in progress. */
  isLoading: boolean
  /** `true` after a successful mutation. */
  isSuccess: boolean
  /** `true` after a failed mutation. */
  isError: boolean
}
