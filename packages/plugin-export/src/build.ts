import type {
  ExportCollection,
  ExportSummary,
  ExportVariable,
  LocalVariablesExport,
} from './types'

export interface BuildExportOptions {
  /** Base name for the downloaded file (without .json). */
  fileName?: string
  /** Skip hidden variables and visible variables whose aliases depend on them. */
  excludeHidden?: boolean
}

function aliasesExcludedVariableId(
  value: unknown,
  excludedVariableIds: ReadonlySet<string>
): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS' &&
    'id' in value &&
    typeof value.id === 'string' &&
    excludedVariableIds.has(value.id)
  )
}

function aliasesExcludedVariable(
  variable: ExportVariable,
  excludedVariableIds: ReadonlySet<string>
): boolean {
  return Object.values(variable.valuesByMode).some(value =>
    aliasesExcludedVariableId(value, excludedVariableIds)
  )
}

function cloneSerializedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSerializedValue)
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneSerializedValue(nestedValue),
      ])
    )
  }

  return value
}

function cloneSerializedRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      cloneSerializedValue(value),
    ])
  )
}

function cloneVariableOverrides(
  overrides: Record<string, Record<string, unknown>>,
  excludedVariableIds: ReadonlySet<string>
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([variableId]) => !excludedVariableIds.has(variableId))
      .map(([variableId, valuesByMode]) => [
        variableId,
        Object.fromEntries(
          Object.entries(valuesByMode)
            .filter(
              ([, value]) =>
                !aliasesExcludedVariableId(value, excludedVariableIds)
            )
            .map(([modeId, value]) => [modeId, cloneSerializedValue(value)])
        ),
      ])
  )
}

/**
 * Build a REST-shaped local variables document from plain collection/variable
 * records. It reads plain records and does not access the Figma global.
 */
export function buildLocalVariablesExport(
  collections: ExportCollection[],
  variables: ExportVariable[],
  options: BuildExportOptions = {}
): LocalVariablesExport {
  const excludeHidden = options.excludeHidden === true
  const excludedVariableIds = new Set<string>()

  if (excludeHidden) {
    for (const variable of variables) {
      if (variable.hiddenFromPublishing) {
        excludedVariableIds.add(variable.id)
      }
    }

    let foundDependent = true
    while (foundDependent) {
      foundDependent = false
      for (const variable of variables) {
        if (
          !excludedVariableIds.has(variable.id) &&
          aliasesExcludedVariable(variable, excludedVariableIds)
        ) {
          excludedVariableIds.add(variable.id)
          foundDependent = true
        }
      }
    }
  }

  const variableMap = Object.create(
    null
  ) as LocalVariablesExport['meta']['variables']
  for (const variable of variables) {
    if (excludedVariableIds.has(variable.id)) {
      continue
    }
    variableMap[variable.id] = {
      ...variable,
      valuesByMode: cloneSerializedRecord(variable.valuesByMode),
      scopes: variable.scopes ? [...variable.scopes] : [],
      codeSyntax: variable.codeSyntax ? { ...variable.codeSyntax } : {},
      updatedAt: '',
    }
  }

  const variableCollections = Object.create(
    null
  ) as LocalVariablesExport['meta']['variableCollections']
  for (const collection of collections) {
    const variableIds = collection.variableIds.filter(variableId =>
      collection.isExtension
        ? !excludedVariableIds.has(variableId)
        : variableMap[variableId] !== undefined
    )

    if (collection.isExtension) {
      variableCollections[collection.id] = {
        ...collection,
        modes: collection.modes.map(mode => ({ ...mode })),
        variableIds,
        variableOverrides: cloneVariableOverrides(
          collection.variableOverrides,
          excludedVariableIds
        ),
        updatedAt: '',
      }
      continue
    }

    variableCollections[collection.id] = {
      ...collection,
      modes: collection.modes.map(mode => ({ ...mode })),
      variableIds,
      updatedAt: '',
    }
  }

  return {
    status: 200,
    error: false,
    meta: {
      variableCollections,
      variables: variableMap,
    },
  }
}

export function summarizeExport(
  doc: LocalVariablesExport,
  fileName = 'variables'
): ExportSummary {
  const collections = Object.keys(doc.meta.variableCollections).length
  const variables = Object.keys(doc.meta.variables).length
  const modes = Object.values(doc.meta.variableCollections).reduce(
    (sum, c) => sum + c.modes.length,
    0
  )
  return {
    collections,
    variables,
    modes,
    fileName: fileName.endsWith('.json') ? fileName : `${fileName}.json`,
  }
}
