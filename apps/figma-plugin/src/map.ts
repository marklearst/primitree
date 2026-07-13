import type {
  ExportCollection,
  ExportVariable,
  ResolvedType,
} from '@figmavars/plugin-export'

function serializeValue(value: VariableValue): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS'
  ) {
    return { type: 'VARIABLE_ALIAS', id: value.id }
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'r' in value &&
    'g' in value &&
    'b' in value
  ) {
    const color = value as RGB | RGBA
    return {
      r: color.r,
      g: color.g,
      b: color.b,
      a: 'a' in color && typeof color.a === 'number' ? color.a : 1,
    }
  }

  return value
}

export function mapCollection(
  collection: VariableCollection
): ExportCollection {
  return {
    id: collection.id,
    name: collection.name,
    key: collection.key,
    modes: collection.modes.map(mode => ({
      modeId: mode.modeId,
      name: mode.name,
    })),
    defaultModeId: collection.defaultModeId,
    variableIds: [...collection.variableIds],
    hiddenFromPublishing: collection.hiddenFromPublishing,
    remote: collection.remote,
  }
}

export function mapVariable(variable: Variable): ExportVariable {
  const valuesByMode: Record<string, unknown> = {}
  for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
    valuesByMode[modeId] = serializeValue(value)
  }

  const codeSyntax: Record<string, string> = {}
  for (const [platform, syntax] of Object.entries(variable.codeSyntax)) {
    if (typeof syntax === 'string') {
      codeSyntax[platform] = syntax
    }
  }

  return {
    id: variable.id,
    name: variable.name,
    key: variable.key,
    variableCollectionId: variable.variableCollectionId,
    resolvedType: variable.resolvedType as ResolvedType,
    valuesByMode,
    description: variable.description,
    hiddenFromPublishing: variable.hiddenFromPublishing,
    scopes: [...variable.scopes],
    codeSyntax,
    remote: variable.remote,
  }
}
