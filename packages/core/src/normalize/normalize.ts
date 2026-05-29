import type { FigmaCollection, FigmaVariable } from '../types/figma'
import type {
  NormalizedCollection,
  NormalizedMode,
  NormalizedVariable,
  NormalizedVariables,
} from './types'

/**
 * Error thrown when an input document cannot be recognized as any supported
 * Figma variables shape.
 *
 * @public
 */
export class VariablesParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VariablesParseError'
  }
}

interface RawMeta {
  variables: Record<string, unknown> | unknown[]
  variableCollections: Record<string, unknown> | unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: Record<string, unknown> | unknown[]): unknown[] {
  return Array.isArray(value) ? value : Object.values(value)
}

/**
 * Locates the variables + collections payload inside any supported input shape:
 *
 * - Figma REST local variables response: `{ meta: { variables, variableCollections } }`
 * - Bare meta objects: `{ variables, variableCollections }`
 * - Plugin-style exports: `{ variables: [...], collections: [...] }`
 */
function extractMeta(input: unknown): RawMeta {
  if (typeof input === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new VariablesParseError('Input string is not valid JSON')
    }
    return extractMeta(parsed)
  }

  if (!isRecord(input)) {
    throw new VariablesParseError(
      'Expected a Figma variables document (object or JSON string)'
    )
  }

  const candidate = isRecord(input.meta) ? input.meta : input

  const variables = candidate.variables
  const collections =
    candidate.variableCollections ?? candidate.collections ?? undefined

  if (
    (isRecord(variables) || Array.isArray(variables)) &&
    (isRecord(collections) || Array.isArray(collections))
  ) {
    return {
      variables: variables as RawMeta['variables'],
      variableCollections: collections as RawMeta['variableCollections'],
    }
  }

  throw new VariablesParseError(
    'Could not find variables and collections in input. Supported shapes: ' +
      'REST local variables response ({ meta: { variables, variableCollections } }), ' +
      'bare meta ({ variables, variableCollections }), ' +
      'or plugin exports ({ variables, collections }).'
  )
}

function looksLikePublishedVariable(value: Record<string, unknown>): boolean {
  return (
    typeof value.subscribed_id === 'string' &&
    !isRecord(value.valuesByMode) &&
    value.valuesByMode === undefined
  )
}

function normalizeMode(raw: unknown): NormalizedMode | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = raw.modeId ?? raw.id
  if (typeof id !== 'string' || typeof raw.name !== 'string') {
    return null
  }
  return { id, name: raw.name }
}

function normalizeCollection(
  raw: unknown,
  warnings: string[]
): NormalizedCollection | null {
  if (!isRecord(raw)) {
    return null
  }
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    warnings.push('Skipped a collection without string id/name')
    return null
  }

  const modes = Array.isArray(raw.modes)
    ? raw.modes
        .map(normalizeMode)
        .filter((m): m is NormalizedMode => m !== null)
    : []

  if (modes.length === 0) {
    warnings.push(`Collection "${raw.name}" has no modes; skipped`)
    return null
  }

  const firstMode = modes[0] as NormalizedMode
  const defaultModeId =
    typeof raw.defaultModeId === 'string' &&
    modes.some(m => m.id === raw.defaultModeId)
      ? raw.defaultModeId
      : firstMode.id

  return {
    id: raw.id,
    name: raw.name,
    modes,
    defaultModeId,
    variableIds: Array.isArray(raw.variableIds)
      ? raw.variableIds.filter((v): v is string => typeof v === 'string')
      : [],
    hiddenFromPublishing: raw.hiddenFromPublishing === true,
  }
}

function normalizeVariable(
  raw: unknown,
  warnings: string[]
): NormalizedVariable | null {
  if (!isRecord(raw)) {
    return null
  }
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    warnings.push('Skipped a variable without string id/name')
    return null
  }
  if (looksLikePublishedVariable(raw)) {
    throw new VariablesParseError(
      'This looks like a published variables response, which contains no values. ' +
        'Export local variables instead (GET /v1/files/:key/variables/local).'
    )
  }
  const collectionId = raw.variableCollectionId ?? raw.collectionId
  if (typeof collectionId !== 'string') {
    warnings.push(`Variable "${raw.name}" has no collection id; skipped`)
    return null
  }
  const resolvedType = raw.resolvedType ?? raw.type
  if (
    resolvedType !== 'BOOLEAN' &&
    resolvedType !== 'FLOAT' &&
    resolvedType !== 'STRING' &&
    resolvedType !== 'COLOR'
  ) {
    warnings.push(
      `Variable "${raw.name}" has unsupported type "${String(resolvedType)}"; skipped`
    )
    return null
  }

  return {
    id: raw.id,
    name: raw.name,
    collectionId,
    resolvedType,
    valuesByMode: isRecord(raw.valuesByMode)
      ? (raw.valuesByMode as NormalizedVariable['valuesByMode'])
      : {},
    description: typeof raw.description === 'string' ? raw.description : '',
    hiddenFromPublishing: raw.hiddenFromPublishing === true,
    scopes: Array.isArray(raw.scopes)
      ? (raw.scopes.filter(
          (s): s is string => typeof s === 'string'
        ) as NormalizedVariable['scopes'])
      : [],
    codeSyntax: isRecord(raw.codeSyntax)
      ? (Object.fromEntries(
          Object.entries(raw.codeSyntax).filter(
            ([, v]) => typeof v === 'string'
          )
        ) as Record<string, string>)
      : {},
  }
}

/**
 * Normalize any supported Figma variables JSON shape into a single
 * predictable model.
 *
 * @remarks
 * Accepts the REST local variables response (the output of
 * `figma-vars export` and most Dev Mode plugin exports), bare `meta`
 * objects, and plugin-style `{ variables, collections }` documents —
 * as parsed objects or raw JSON strings.
 *
 * Variables that reference a missing collection are dropped with a warning.
 * Collections' `variableIds` are recomputed from the surviving variables so
 * the result is always internally consistent.
 *
 * @param input - A Figma variables document (object or JSON string).
 * @returns The normalized collections and variables, plus any warnings.
 * @throws VariablesParseError when the input is not a recognizable shape.
 *
 * @example
 * ```ts
 * import { normalizeVariables } from '@figma-vars/core'
 * import { readFileSync } from 'node:fs'
 *
 * const normalized = normalizeVariables(readFileSync('variables.json', 'utf8'))
 * console.log(normalized.collections.map(c => c.name))
 * ```
 *
 * @public
 */
export function normalizeVariables(
  input: unknown
): NormalizedVariables & { warnings: string[] } {
  const meta = extractMeta(input)
  const warnings: string[] = []

  const collections = asArray(meta.variableCollections)
    .map(raw => normalizeCollection(raw, warnings))
    .filter((c): c is NormalizedCollection => c !== null)

  const collectionsById: Record<string, NormalizedCollection> = {}
  for (const collection of collections) {
    collectionsById[collection.id] = collection
  }

  const variables = asArray(meta.variables)
    .map(raw => normalizeVariable(raw, warnings))
    .filter((v): v is NormalizedVariable => v !== null)
    .filter(variable => {
      if (!collectionsById[variable.collectionId]) {
        warnings.push(
          `Variable "${variable.name}" references missing collection ` +
            `"${variable.collectionId}"; skipped`
        )
        return false
      }
      return true
    })

  const variablesById: Record<string, NormalizedVariable> = {}
  for (const variable of variables) {
    variablesById[variable.id] = variable
  }

  // Recompute membership so downstream consumers never chase stale ids.
  const memberIds = new Map<string, string[]>()
  for (const variable of variables) {
    const list = memberIds.get(variable.collectionId) ?? []
    list.push(variable.id)
    memberIds.set(variable.collectionId, list)
  }
  for (const collection of collections) {
    collection.variableIds = memberIds.get(collection.id) ?? []
  }

  return { collections, variables, collectionsById, variablesById, warnings }
}

/**
 * Convert a normalized model back into the REST `LocalVariablesResponse`
 * shape used across the FigmaVars packages.
 *
 * @public
 */
export function toLocalVariablesResponse(normalized: NormalizedVariables): {
  meta: {
    variableCollections: Record<string, FigmaCollection>
    variables: Record<string, FigmaVariable>
  }
} {
  const variableCollections: Record<string, FigmaCollection> = {}
  for (const collection of normalized.collections) {
    variableCollections[collection.id] = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map(m => ({ modeId: m.id, name: m.name })),
      defaultModeId: collection.defaultModeId,
      variableIds: [...collection.variableIds],
      hiddenFromPublishing: collection.hiddenFromPublishing,
      updatedAt: '',
    }
  }
  const variables: Record<string, FigmaVariable> = {}
  for (const variable of normalized.variables) {
    variables[variable.id] = {
      id: variable.id,
      name: variable.name,
      variableCollectionId: variable.collectionId,
      resolvedType: variable.resolvedType,
      valuesByMode: { ...variable.valuesByMode },
      description: variable.description,
      hiddenFromPublishing: variable.hiddenFromPublishing,
      scopes: [...variable.scopes],
      codeSyntax: { ...variable.codeSyntax },
      updatedAt: '',
    }
  }
  return { meta: { variableCollections, variables } }
}
