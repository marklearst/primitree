import type {
  LocalVariablesResponse,
  PublishedVariablesResponse,
} from '../types/figma'

/** Figma Variables response kind for fallback data. @public */
export type FallbackDataKind = 'local' | 'published'

/** Fallback data paired with its Variables API response kind. @public */
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
 * Check the fields that distinguish a local variables response.
 *
 * @remarks
 * The guard checks `meta.variableCollections`, `meta.variables`, collection
 * modes, and variable values.
 *
 * @param data - The data to validate
 * @returns `true` for LocalVariablesResponse data
 *
 * @example
 * ```ts
 * import { isLocalVariablesResponse } from '@primitree/core';
 *
 * if (isLocalVariablesResponse(fallbackData)) {
 *   console.log(fallbackData.meta.variables)
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
 * Check the fields that distinguish a published variables response.
 *
 * @remarks
 * The guard checks the published entry keys that the local response omits.
 *
 * @param data - The data to validate
 * @returns `true` for PublishedVariablesResponse data
 *
 * @example
 * ```ts
 * import { isPublishedVariablesResponse } from '@primitree/core';
 *
 * if (isPublishedVariablesResponse(fallbackData)) {
 *   console.log(fallbackData.meta.variables)
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
 * Classify fallback data as a local or published response.
 *
 * @remarks
 * Empty response maps match both response shapes, so callers must provide a
 * kind. The classifier rejects invalid runtime discriminator values.
 *
 * @param data - The data to validate and classify
 * @param explicitKind - Kind used to resolve an empty response.
 * @returns Classified data, or `undefined` for invalid or ambiguous data.
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
 * Return local or published fallback data after a structural check.
 *
 * @remarks
 * Empty response maps match both shapes, so this function returns `undefined`
 * for an empty response without an explicit kind.
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
