import { describe, expect, it } from 'vitest'
import {
  buildLocalVariablesExport,
  type ExportVariable,
} from '@primitree/plugin-export'
import { mapCollection, mapVariable } from '../src/map'

function getOwnValue<T>(record: Record<string, T>, key: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !('value' in descriptor)) {
    throw new Error(`Expected own data property: ${key}`)
  }
  return descriptor.value as T
}

function ordinaryCollection(): VariableCollection {
  return {
    id: 'VariableCollectionId:local',
    name: 'Local collection',
    key: 'local-key',
    modes: [{ modeId: 'ModeId:light', name: 'Light' }],
    defaultModeId: 'ModeId:light',
    variableIds: ['VariableID:local'],
    hiddenFromPublishing: false,
    remote: false,
    isExtension: false,
  } as unknown as VariableCollection
}

function extendedCollection() {
  const aliasOverride: VariableAlias = {
    type: 'VARIABLE_ALIAS',
    id: 'VariableID:target',
  }
  const colorOverride: RGBA = { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }
  const collection = {
    id: 'VariableCollectionId:extension',
    name: 'Brand extension',
    key: 'extension-key',
    modes: [
      {
        modeId: 'ModeId:extension-dark',
        name: 'Dark',
        parentModeId: 'ModeId:parent-dark',
      },
    ],
    defaultModeId: 'ModeId:extension-dark',
    variableIds: ['VariableID:inherited'],
    hiddenFromPublishing: false,
    remote: false,
    isExtension: true,
    parentVariableCollectionId: 'VariableCollectionId:parent',
    rootVariableCollectionId: 'VariableCollectionId:root',
    variableOverrides: {
      'VariableID:inherited': {
        'ModeId:extension-dark': aliasOverride,
        'ModeId:extension-light': colorOverride,
      },
    },
  } as unknown as ExtendedVariableCollection

  return { aliasOverride, collection }
}

const inheritedVariable: ExportVariable = {
  id: 'VariableID:inherited',
  name: 'color/accent',
  variableCollectionId: 'VariableCollectionId:parent',
  resolvedType: 'COLOR',
  valuesByMode: {},
}

describe('mapCollection', () => {
  it('preserves the ordinary collection discriminator', () => {
    expect(mapCollection(ordinaryCollection())).toEqual({
      id: 'VariableCollectionId:local',
      name: 'Local collection',
      key: 'local-key',
      modes: [{ modeId: 'ModeId:light', name: 'Light' }],
      defaultModeId: 'ModeId:light',
      variableIds: ['VariableID:local'],
      hiddenFromPublishing: false,
      remote: false,
      isExtension: false,
    })
  })

  it('preserves extended collection metadata through the export pipeline', () => {
    const { aliasOverride, collection } = extendedCollection()
    const mapped = mapCollection(collection as unknown as VariableCollection)
    const doc = buildLocalVariablesExport([mapped], [inheritedVariable])
    const exported =
      doc.meta.variableCollections['VariableCollectionId:extension']

    expect(mapped.isExtension).toBe(true)
    expect(exported).toMatchObject({
      isExtension: true,
      parentVariableCollectionId: 'VariableCollectionId:parent',
      rootVariableCollectionId: 'VariableCollectionId:root',
      modes: [
        {
          modeId: 'ModeId:extension-dark',
          name: 'Dark',
          parentModeId: 'ModeId:parent-dark',
        },
      ],
      variableOverrides: {
        'VariableID:inherited': {
          'ModeId:extension-dark': {
            type: 'VARIABLE_ALIAS',
            id: 'VariableID:target',
          },
          'ModeId:extension-light': {
            r: 0.1,
            g: 0.2,
            b: 0.3,
            a: 0.4,
          },
        },
      },
    })
    if (!mapped.isExtension || !exported.isExtension) {
      throw new Error('Expected extended collections throughout the pipeline')
    }

    expect(mapped.modes[0]).not.toBe(collection.modes[0])
    expect(exported.modes[0]).not.toBe(mapped.modes[0])
    expect(mapped.variableOverrides).not.toBe(collection.variableOverrides)
    expect(exported.variableOverrides).not.toBe(mapped.variableOverrides)
    expect(exported.variableOverrides['VariableID:inherited']).not.toBe(
      mapped.variableOverrides['VariableID:inherited']
    )
    expect(exported.variableOverrides).not.toBe(collection.variableOverrides)
    expect(
      exported.variableOverrides['VariableID:inherited'][
        'ModeId:extension-dark'
      ]
    ).not.toBe(aliasOverride)
  })

  it('preserves own __proto__ override variable and mode IDs', () => {
    const { collection } = extendedCollection()
    const variableOverrides = Object.fromEntries([
      [
        '__proto__',
        Object.fromEntries([
          ['__proto__', { type: 'VARIABLE_ALIAS', id: 'VariableID:target' }],
        ]),
      ],
    ]) as ExtendedVariableCollection['variableOverrides']
    const hostileCollection = {
      ...collection,
      variableOverrides,
    } as unknown as VariableCollection

    const mapped = mapCollection(hostileCollection)
    if (!mapped.isExtension) {
      throw new Error('Expected an extended collection')
    }

    expect(Object.hasOwn(mapped.variableOverrides, '__proto__')).toBe(true)
    const valuesByMode = getOwnValue(mapped.variableOverrides, '__proto__')
    expect(Object.hasOwn(valuesByMode, '__proto__')).toBe(true)
    expect(getOwnValue(valuesByMode, '__proto__')).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    })
  })
})

describe('mapVariable', () => {
  it('preserves an own __proto__ mode ID', () => {
    const valuesByMode = Object.fromEntries([
      ['__proto__', { type: 'VARIABLE_ALIAS', id: 'VariableID:target' }],
    ]) as Variable['valuesByMode']
    const variable = {
      id: 'VariableID:hostile-mode',
      name: 'hostile mode',
      key: 'hostile-mode-key',
      variableCollectionId: 'VariableCollectionId:local',
      resolvedType: 'COLOR',
      valuesByMode,
      description: '',
      hiddenFromPublishing: false,
      scopes: [],
      codeSyntax: {},
      remote: false,
    } as unknown as Variable

    const mapped = mapVariable(variable)

    expect(Object.hasOwn(mapped.valuesByMode, '__proto__')).toBe(true)
    expect(getOwnValue(mapped.valuesByMode, '__proto__')).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    })
  })
})
