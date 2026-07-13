import type {
  LocalVariablesResponse,
  PublishedVariablesResponse,
} from '../types/figma'

export type FallbackDataKind = 'local' | 'published'

export type ClassifiedFallbackData =
  | { kind: 'local'; data: LocalVariablesResponse }
  | { kind: 'published'; data: PublishedVariablesResponse }

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hasLocalCollectionShape = (value: unknown): boolean =>
  isPlainRecord(value) && Array.isArray(value.modes)

const hasLocalVariableShape = (value: unknown): boolean =>
  isPlainRecord(value) && isPlainRecord(value.valuesByMode)

const hasPublishedEntryShape = (value: unknown): boolean =>
  isPlainRecord(value) &&
  typeof value.subscribed_id === 'string' &&
  typeof value.key === 'string' &&
  typeof value.updatedAt === 'string'

const everyEntryMatches = (
  record: Record<string, unknown>,
  predicate: (value: unknown) => boolean
): boolean => Object.values(record).every(predicate)

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
 * import { isLocalVariablesResponse } from '@figmavars/hooks';
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
  if (!isPlainRecord(data) || !isPlainRecord(data.meta)) {
    return false
  }

  const { variableCollections, variables } = data.meta
  if (!isPlainRecord(variableCollections) || !isPlainRecord(variables)) {
    return false
  }

  return (
    everyEntryMatches(variableCollections, hasLocalCollectionShape) &&
    everyEntryMatches(variables, hasLocalVariableShape)
  )
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
 * import { isPublishedVariablesResponse } from '@figmavars/hooks';
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
  if (!isPlainRecord(data) || !isPlainRecord(data.meta)) {
    return false
  }

  const { variableCollections, variables } = data.meta
  if (!isPlainRecord(variableCollections) || !isPlainRecord(variables)) {
    return false
  }

  return (
    everyEntryMatches(variableCollections, hasPublishedEntryShape) &&
    everyEntryMatches(variables, hasPublishedEntryShape)
  )
}

/**
 * Classifies structurally valid fallback data as local or published.
 *
 * @remarks
 * Empty response maps are valid for both response shapes and therefore require
 * an explicit kind. Invalid runtime discriminator values are rejected.
 *
 * @param data - The data to validate and classify
 * @param explicitKind - Optional kind for otherwise ambiguous response data
 * @returns The classified data, or undefined when invalid or ambiguous
 *
 * @public
 */
export function classifyFallbackData(
  data: unknown,
  explicitKind?: FallbackDataKind
): ClassifiedFallbackData | undefined {
  if (
    explicitKind !== undefined &&
    explicitKind !== 'local' &&
    explicitKind !== 'published'
  ) {
    return undefined
  }

  const local = isLocalVariablesResponse(data)
  const published = isPublishedVariablesResponse(data)

  if (explicitKind === 'local') {
    return local ? { kind: 'local', data } : undefined
  }

  if (explicitKind === 'published') {
    return published ? { kind: 'published', data } : undefined
  }

  if (local === published) {
    return undefined
  }

  return local
    ? { kind: 'local', data }
    : { kind: 'published', data: data as PublishedVariablesResponse }
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
 * @public
 */
export function validateFallbackData(
  data: unknown
): LocalVariablesResponse | PublishedVariablesResponse | undefined {
  return classifyFallbackData(data)?.data
}
