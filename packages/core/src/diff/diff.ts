import { normalizeVariables } from '../normalize/normalize'
import type {
  NormalizedCollection,
  NormalizedVariables,
} from '../normalize/types'
import type { VariableValue } from '../types/figma'

/** A collection reference in a diff. @public */
export interface DiffCollectionRef {
  id: string
  name: string
}

/** A variable reference in a diff. @public */
export interface DiffVariableRef {
  id: string
  name: string
  collectionName: string
}

/** Rename record with a stable Figma ID. @public */
export interface DiffRename {
  id: string
  from: string
  to: string
  collectionName: string
}

/** A mode added or removed on a collection. @public */
export interface DiffModeChange {
  collectionName: string
  modeId: string
  modeName: string
}

/** A per-mode value change. @public */
export interface DiffValueChange {
  id: string
  name: string
  collectionName: string
  modeName: string
  from: VariableValue | undefined
  to: VariableValue | undefined
}

/** A resolved type change, classified as breaking. @public */
export interface DiffTypeChange {
  id: string
  name: string
  collectionName: string
  from: string
  to: string
}

/** A variable moved between collections. @public */
export interface DiffMove {
  id: string
  name: string
  from: string
  to: string
}

/**
 * Semantic difference between two Figma variables exports. The comparison
 * uses stable Figma IDs and reports renames in the `renamed` lists.
 *
 * @public
 */
export interface VariablesDiff {
  collections: {
    added: DiffCollectionRef[]
    removed: DiffCollectionRef[]
    renamed: DiffRename[]
    modesAdded: DiffModeChange[]
    modesRemoved: DiffModeChange[]
    modesRenamed: Array<{
      collectionName: string
      modeId: string
      from: string
      to: string
    }>
  }
  variables: {
    added: DiffVariableRef[]
    removed: DiffVariableRef[]
    renamed: DiffRename[]
    moved: DiffMove[]
    typeChanged: DiffTypeChange[]
    valueChanged: DiffValueChange[]
    descriptionChanged: DiffVariableRef[]
  }
  /** True when the diff contains a breaking change. */
  breaking: boolean
  hasChanges: boolean
}

function valueEquals(
  a: VariableValue | undefined,
  b: VariableValue | undefined
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function modeName(collection: NormalizedCollection, modeId: string): string {
  return collection.modes.find(m => m.id === modeId)?.name ?? modeId
}

/**
 * Compute the semantic diff between two Figma variables exports.
 *
 * @remarks
 * Accepts the same input shapes as `normalizeVariables`. It matches
 * records across exports by Figma variable, collection, and mode ID. Renamed
 * records appear as renames.
 *
 * @param oldInput - The earlier export (e.g. the committed backup).
 * @param newInput - The newer export.
 *
 * @example
 * ```ts
 * const diff = diffVariables(previousJson, currentJson)
 * if (diff.breaking) {
 *   console.error(formatDiffMarkdown(diff))
 *   process.exit(1)
 * }
 * ```
 *
 * @public
 */
export function diffVariables(
  oldInput: unknown,
  newInput: unknown
): VariablesDiff {
  const before: NormalizedVariables = normalizeVariables(oldInput)
  const after: NormalizedVariables = normalizeVariables(newInput)

  const diff: VariablesDiff = {
    collections: {
      added: [],
      removed: [],
      renamed: [],
      modesAdded: [],
      modesRemoved: [],
      modesRenamed: [],
    },
    variables: {
      added: [],
      removed: [],
      renamed: [],
      moved: [],
      typeChanged: [],
      valueChanged: [],
      descriptionChanged: [],
    },
    breaking: false,
    hasChanges: false,
  }

  for (const collection of after.collections) {
    const previous = before.collectionsById[collection.id]
    if (!previous) {
      diff.collections.added.push({ id: collection.id, name: collection.name })
      continue
    }
    if (previous.name !== collection.name) {
      diff.collections.renamed.push({
        id: collection.id,
        from: previous.name,
        to: collection.name,
        collectionName: collection.name,
      })
    }
    const previousModes = new Map(previous.modes.map(m => [m.id, m]))
    const currentModes = new Map(collection.modes.map(m => [m.id, m]))
    for (const mode of collection.modes) {
      const prevMode = previousModes.get(mode.id)
      if (!prevMode) {
        diff.collections.modesAdded.push({
          collectionName: collection.name,
          modeId: mode.id,
          modeName: mode.name,
        })
      } else if (prevMode.name !== mode.name) {
        diff.collections.modesRenamed.push({
          collectionName: collection.name,
          modeId: mode.id,
          from: prevMode.name,
          to: mode.name,
        })
      }
    }
    for (const mode of previous.modes) {
      if (!currentModes.has(mode.id)) {
        diff.collections.modesRemoved.push({
          collectionName: collection.name,
          modeId: mode.id,
          modeName: mode.name,
        })
      }
    }
  }
  for (const collection of before.collections) {
    if (!after.collectionsById[collection.id]) {
      diff.collections.removed.push({
        id: collection.id,
        name: collection.name,
      })
    }
  }

  for (const variable of after.variables) {
    const collection = after.collectionsById[variable.collectionId]
    const collectionName = collection?.name ?? variable.collectionId
    const previous = before.variablesById[variable.id]
    if (!previous) {
      diff.variables.added.push({
        id: variable.id,
        name: variable.name,
        collectionName,
      })
      continue
    }

    if (previous.name !== variable.name) {
      diff.variables.renamed.push({
        id: variable.id,
        from: previous.name,
        to: variable.name,
        collectionName,
      })
    }
    if (previous.collectionId !== variable.collectionId) {
      const fromCollection =
        before.collectionsById[previous.collectionId]?.name ??
        previous.collectionId
      diff.variables.moved.push({
        id: variable.id,
        name: variable.name,
        from: fromCollection,
        to: collectionName,
      })
    }
    if (previous.resolvedType !== variable.resolvedType) {
      diff.variables.typeChanged.push({
        id: variable.id,
        name: variable.name,
        collectionName,
        from: previous.resolvedType,
        to: variable.resolvedType,
      })
    }
    if (previous.description !== variable.description) {
      diff.variables.descriptionChanged.push({
        id: variable.id,
        name: variable.name,
        collectionName,
      })
    }

    const modeIds = new Set([
      ...Object.keys(previous.valuesByMode),
      ...Object.keys(variable.valuesByMode),
    ])
    for (const modeId of modeIds) {
      const from = previous.valuesByMode[modeId]
      const to = variable.valuesByMode[modeId]
      if (!valueEquals(from, to)) {
        diff.variables.valueChanged.push({
          id: variable.id,
          name: variable.name,
          collectionName,
          modeName: collection ? modeName(collection, modeId) : modeId,
          from,
          to,
        })
      }
    }
  }
  for (const variable of before.variables) {
    if (!after.variablesById[variable.id]) {
      const collectionName =
        before.collectionsById[variable.collectionId]?.name ??
        variable.collectionId
      diff.variables.removed.push({
        id: variable.id,
        name: variable.name,
        collectionName,
      })
    }
  }

  diff.breaking =
    diff.variables.removed.length > 0 ||
    diff.variables.renamed.length > 0 ||
    diff.variables.moved.length > 0 ||
    diff.variables.typeChanged.length > 0 ||
    diff.collections.removed.length > 0 ||
    diff.collections.renamed.length > 0 ||
    diff.collections.modesRemoved.length > 0 ||
    diff.collections.modesRenamed.length > 0

  diff.hasChanges =
    diff.breaking ||
    diff.variables.added.length > 0 ||
    diff.variables.valueChanged.length > 0 ||
    diff.variables.descriptionChanged.length > 0 ||
    diff.collections.added.length > 0 ||
    diff.collections.modesAdded.length > 0

  return diff
}
