import type {
  ExportCollection,
  ExportExtendedCollection,
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

function serializeVariableOverrides(
  overrides: ExtendedVariableCollection['variableOverrides']
): ExportExtendedCollection['variableOverrides'] {
  const serialized = Object.create(
    null
  ) as ExportExtendedCollection['variableOverrides']

  for (const [variableId, valuesByMode] of Object.entries(overrides)) {
    const serializedValuesByMode = Object.create(null) as Record<
      string,
      unknown
    >
    for (const [modeId, value] of Object.entries(valuesByMode)) {
      serializedValuesByMode[modeId] = serializeValue(value)
    }
    serialized[variableId] = serializedValuesByMode
  }

  return serialized
}

export function mapCollection(
  collection: VariableCollection | ExtendedVariableCollection
): ExportCollection {
  const base = {
    id: collection.id,
    name: collection.name,
    key: collection.key,
    defaultModeId: collection.defaultModeId,
    variableIds: [...collection.variableIds],
    hiddenFromPublishing: collection.hiddenFromPublishing,
    remote: collection.remote,
  }

  if (collection.isExtension) {
    const extended = collection as ExtendedVariableCollection
    return {
      ...base,
      isExtension: true,
      parentVariableCollectionId: extended.parentVariableCollectionId,
      rootVariableCollectionId: extended.rootVariableCollectionId,
      variableOverrides: serializeVariableOverrides(extended.variableOverrides),
      modes: extended.modes.map(mode => ({
        modeId: mode.modeId,
        name: mode.name,
        parentModeId: mode.parentModeId,
      })),
    }
  }

  return {
    ...base,
    isExtension: false,
    modes: collection.modes.map(mode => ({
      modeId: mode.modeId,
      name: mode.name,
    })),
  }
}

export function mapVariable(variable: Variable): ExportVariable {
  const valuesByMode = Object.create(null) as Record<string, unknown>
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
