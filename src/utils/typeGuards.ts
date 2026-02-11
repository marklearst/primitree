import type {
  LocalVariablesResponse,
  PublishedVariablesResponse,
} from 'types/figma'

/**
 * Runtime type guard to check if data matches LocalVariablesResponse structure.
 *
 * @remarks
 * Use this to validate fallback files or API responses at runtime before casting.
 * Validates the essential structure: meta object with variableCollections and variables.
 *
 * @param data - The data to validate
 * @returns `true` if data matches LocalVariablesResponse structure
 *
 * @example
 * ```ts
 * import { isLocalVariablesResponse } from '@figma-vars/hooks';
 *
 * if (isLocalVariablesResponse(fallbackData)) {
 *   // Safe to use as LocalVariablesResponse
 * } else {
 *   console.error('Invalid fallback file structure');
 * }
 * ```
 *
 * @public
 */
export function isLocalVariablesResponse(
  data: unknown
): data is LocalVariablesResponse {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.meta !== 'object' || obj.meta === null) {
    return false
  }

  const meta = obj.meta as Record<string, unknown>

  // Check for required properties
  if (
    typeof meta.variableCollections !== 'object' ||
    meta.variableCollections === null
  ) {
    return false
  }

  if (typeof meta.variables !== 'object' || meta.variables === null) {
    return false
  }

  return true
}

/**
 * Runtime type guard to check if data matches PublishedVariablesResponse structure.
 *
 * @remarks
 * Use this to validate fallback files or API responses at runtime before casting.
 * Validates the essential structure: meta object with variableCollections and variables.
 *
 * @param data - The data to validate
 * @returns `true` if data matches PublishedVariablesResponse structure
 *
 * @example
 * ```ts
 * import { isPublishedVariablesResponse } from '@figma-vars/hooks';
 *
 * if (isPublishedVariablesResponse(fallbackData)) {
 *   // Safe to use as PublishedVariablesResponse
 * } else {
 *   console.error('Invalid fallback file structure');
 * }
 * ```
 *
 * @public
 */
export function isPublishedVariablesResponse(
  data: unknown
): data is PublishedVariablesResponse {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.meta !== 'object' || obj.meta === null) {
    return false
  }

  const meta = obj.meta as Record<string, unknown>

  // Check for required properties
  if (
    typeof meta.variableCollections !== 'object' ||
    meta.variableCollections === null
  ) {
    return false
  }

  if (typeof meta.variables !== 'object' || meta.variables === null) {
    return false
  }

  return true
}

/**
 * Validates and returns typed fallback data, or undefined if invalid.
 *
 * @remarks
 * Attempts to validate data as either LocalVariablesResponse or PublishedVariablesResponse.
 * Returns the typed data if valid, undefined otherwise.
 *
 * @param data - The data to validate
 * @returns The validated data or undefined
 *
 * @internal
 */
export function validateFallbackData(
  data: unknown
): LocalVariablesResponse | PublishedVariablesResponse | undefined {
  // Both isLocalVariablesResponse and isPublishedVariablesResponse check the same structure,
  // so we only need to check one. Using isLocalVariablesResponse as the canonical check.
  if (isLocalVariablesResponse(data)) {
    return data
  }
  return undefined
}
