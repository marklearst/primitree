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

function aliasesExcludedVariable(
  variable: ExportVariable,
  excludedVariableIds: ReadonlySet<string>
): boolean {
  return Object.values(variable.valuesByMode).some(value => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      value.type === 'VARIABLE_ALIAS' &&
      'id' in value &&
      typeof value.id === 'string' &&
      excludedVariableIds.has(value.id)
    )
  })
}

/**
 * Build a REST-shaped local variables document from plain collection/variable
 * records. Safe to call from Figma plugin sandboxes and unit tests.
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

  const variableMap: LocalVariablesExport['meta']['variables'] = {}
  for (const variable of variables) {
    if (excludedVariableIds.has(variable.id)) {
      continue
    }
    variableMap[variable.id] = {
      ...variable,
      valuesByMode: { ...variable.valuesByMode },
      scopes: variable.scopes ? [...variable.scopes] : [],
      codeSyntax: variable.codeSyntax ? { ...variable.codeSyntax } : {},
      updatedAt: '',
    }
  }

  const variableCollections: LocalVariablesExport['meta']['variableCollections'] =
    {}
  for (const collection of collections) {
    variableCollections[collection.id] = {
      ...collection,
      modes: collection.modes.map(m => ({ ...m })),
      variableIds: collection.variableIds.filter(
        variableId => variableMap[variableId] !== undefined
      ),
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
