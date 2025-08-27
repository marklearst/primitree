import type { ResolvedType, VariableScope, VariableValue } from "./figma";

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
 * import type { CreateVariablePayload } from '@figma-vars/hooks';
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
  name: string;
  variableCollectionId: string;
  resolvedType: ResolvedType;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: VariableScope[];
  codeSyntax?: Record<string, string>;
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
 * import type { UpdateVariablePayload } from '@figma-vars/hooks';
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
  name?: string;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: VariableScope[];
  codeSyntax?: Record<string, string>;
}

/**
 * Enum of possible mutation actions for variables, collections, or modes.
 *
 * @remarks
 * Used internally and in bulk update payloads to indicate the type of change.
 *
 * @public
 */
export type VariableAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Represents a change operation on a Figma variable collection.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete collections.
 *
 * @property action - The mutation action to perform.
 * @property id - Unique ID of the collection affected.
 * @property name - Optional new name for the collection.
 * @property initialModeId - Optional mode to set as default for the collection.
 * @property hiddenFromPublishing - Optional flag to update publishing visibility.
 *
 * @example
 * ```ts
 * import type { VariableCollectionChange } from '@figma-vars/hooks';
 *
 * const change: VariableCollectionChange = {
 *   action: 'UPDATE',
 *   id: 'VariableCollectionId:123:456',
 *   name: 'New Collection Name',
 *   initialModeId: 'MODE:dark',
 * }
 * ```
 *
 * @public
 */
export interface VariableCollectionChange {
  action: VariableAction;
  id: string;
  name?: string;
  initialModeId?: string;
  hiddenFromPublishing?: boolean;
}

/**
 * Represents a change operation on a Figma variable mode.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete modes.
 *
 * @property action - The mutation action to perform.
 * @property id - Unique ID of the mode affected.
 * @property name - Optional new name for the mode.
 * @property variableCollectionId - The ID of the collection this mode belongs to.
 *
 * @example
 * ```ts
 * import type { VariableModeChange } from '@figma-vars/hooks';
 *
 * const modeChange: VariableModeChange = {
 *   action: 'CREATE',
 *   id: 'MODE:light',
 *   name: 'Light Mode',
 *   variableCollectionId: 'VariableCollectionId:123:456',
 * }
 * ```
 *
 * @public
 */
export interface VariableModeChange {
  action: VariableAction;
  id: string;
  name?: string;
  variableCollectionId: string;
}

/**
 * Represents a change operation on a Figma variable.
 *
 * @remarks
 * Use in bulk update payloads to create, update, or delete variables.
 *
 * @property action - The mutation action to perform.
 * @property id - Unique ID of the variable affected.
 * @property name - Optional new name for the variable.
 * @property variableCollectionId - Optional new collection ID for the variable.
 * @property resolvedType - Optional new data type for the variable.
 * @property description - Optional new description.
 * @property hiddenFromPublishing - Optional update to publishing visibility.
 * @property scopes - Optional update to scopes.
 * @property codeSyntax - Optional update to code syntax.
 *
 * @example
 * ```ts
 * import type { VariableChange } from '@figma-vars/hooks';
 *
 * const varChange: VariableChange = {
 *   action: 'DELETE',
 *   id: 'VariableID:123:456',
 * }
 * ```
 *
 * @public
 */
export interface VariableChange {
  action: VariableAction;
  id: string;
  name?: string;
  variableCollectionId?: string;
  resolvedType?: ResolvedType;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: VariableScope[];
  codeSyntax?: Record<string, string>;
}

/**
 * Value assignment for a specific Figma variable in a specific mode.
 *
 * @remarks
 * Used to represent the value of a variable for a given mode in bulk updates and payloads.
 *
 * @property variableId - The Figma variable ID being set.
 * @property modeId - The mode ID (e.g., 'MODE:dark') this value applies to.
 * @property value - The variable value, which can be a string, number, boolean, Color, or VariableAlias.
 *
 * @example
 * ```ts
 * import type { VariableModeValue } from '@figma-vars/hooks';
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
  variableId: string;
  modeId: string;
  value: VariableValue;
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
 * import type { BulkUpdatePayload } from '@figma-vars/hooks';
 *
 * const payload: BulkUpdatePayload = {
 *   variableCollections: [{ action: 'UPDATE', id: 'VariableCollectionId:123', name: 'New Name' }],
 *   variableModes: [{ action: 'CREATE', id: 'MODE:light', name: 'Light', variableCollectionId: 'VariableCollectionId:123' }],
 *   variables: [{ action: 'DELETE', id: 'VariableID:456' }],
 *   variableModeValues: [{ variableId: 'VariableID:789', modeId: 'MODE:dark', value: true }],
 * }
 * ```
 *
 * @public
 */
export interface BulkUpdatePayload {
  variableCollections?: VariableCollectionChange[];
  variableModes?: VariableModeChange[];
  variables?: VariableChange[];
  variableModeValues?: VariableModeValue[];
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
 * import type { BulkUpdateResponse } from '@figma-vars/hooks';
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
  error: boolean;
  status: number;
  message?: string;
  meta?: {
    tempIdToRealId: Record<string, string>;
  };
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
  status: "idle" | "loading" | "success" | "error";
  data: TData | null;
  error: Error | null;
}

/**
 * Return value of mutation hooks.
 *
 * @remarks
 * Combines mutation state with a `mutate` trigger function accepting a payload, along with convenient booleans for status.
 *
 * @typeParam TData - The type of data returned by the mutation.
 * @typeParam TPayload - The payload type accepted by the mutation trigger.
 *
 * @public
 */
export interface MutationResult<TData, TPayload> {
  mutate: (payload: TPayload) => Promise<TData | undefined>;
  status: "idle" | "loading" | "success" | "error";
  data: TData | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}
