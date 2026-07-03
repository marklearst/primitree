import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeVariables } from '@primitree/core'
import {
  buildLocalVariablesExport,
  summarizeExport,
  type ExportCollection,
  type ExportExtendedCollection,
  type ExportVariable,
} from '../src'

function getOwnValue<T>(record: Record<string, T>, key: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !('value' in descriptor)) {
    throw new Error(`Expected own data property: ${key}`)
  }
  return descriptor.value as T
}

const fixturePath = join(
  import.meta.dirname,
  '../../core/tests/fixtures/local-variables.json'
)
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

function fromFixture() {
  const collections = Object.values(
    fixture.meta.variableCollections
  ) as ExportCollection[]
  const variables = Object.values(fixture.meta.variables) as ExportVariable[]
  return buildLocalVariablesExport(collections, variables)
}

describe('buildLocalVariablesExport', () => {
  it('produces a REST-shaped document', () => {
    const doc = fromFixture()
    expect(doc.status).toBe(200)
    expect(doc.error).toBe(false)
    expect(Object.keys(doc.meta.variableCollections)).toHaveLength(3)
    expect(Object.keys(doc.meta.variables)).toHaveLength(12)
  })

  it('round-trips through normalizeVariables', () => {
    const doc = fromFixture()
    const normalized = normalizeVariables(doc)
    expect(normalized.collections).toHaveLength(3)
    expect(normalized.variables).toHaveLength(12)
    expect(normalized.warnings).toEqual([])
  })

  it('deep-copies extended collection modes and variable overrides', () => {
    const aliasOverride = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    }
    const colorOverride = { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }
    const collection: ExportExtendedCollection = {
      id: 'VariableCollectionId:extension',
      name: 'Brand extension',
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
      defaultModeId: 'ModeId:extension-dark',
      variableIds: [],
      variableOverrides: {
        'VariableID:inherited': {
          'ModeId:extension-dark': aliasOverride,
          'ModeId:extension-light': colorOverride,
        },
      },
    }

    const doc = buildLocalVariablesExport([collection], [])
    const exported =
      doc.meta.variableCollections['VariableCollectionId:extension']

    expect(exported.isExtension).toBe(true)
    if (!exported.isExtension) {
      throw new Error('Expected an extended collection')
    }

    expect(exported.modes).not.toBe(collection.modes)
    expect(exported.modes[0]).not.toBe(collection.modes[0])
    expect(exported.variableOverrides).not.toBe(collection.variableOverrides)
    expect(exported.variableOverrides['VariableID:inherited']).not.toBe(
      collection.variableOverrides['VariableID:inherited']
    )
    expect(
      exported.variableOverrides['VariableID:inherited'][
        'ModeId:extension-dark'
      ]
    ).not.toBe(aliasOverride)
    expect(
      exported.variableOverrides['VariableID:inherited'][
        'ModeId:extension-light'
      ]
    ).not.toBe(colorOverride)

    aliasOverride.id = 'VariableID:mutated'
    colorOverride.r = 1
    expect(
      exported.variableOverrides['VariableID:inherited'][
        'ModeId:extension-dark'
      ]
    ).toEqual({ type: 'VARIABLE_ALIAS', id: 'VariableID:target' })
    expect(
      exported.variableOverrides['VariableID:inherited'][
        'ModeId:extension-light'
      ]
    ).toEqual({ r: 0.1, g: 0.2, b: 0.3, a: 0.4 })
  })

  it('preserves subscribed inherited IDs that are absent from local variables', () => {
    const collection: ExportExtendedCollection = {
      id: 'VariableCollectionId:extension',
      name: 'Brand extension',
      isExtension: true,
      parentVariableCollectionId: 'VariableCollectionId:subscribed-parent',
      rootVariableCollectionId: 'VariableCollectionId:subscribed-root',
      modes: [
        {
          modeId: 'ModeId:extension',
          name: 'Extension',
          parentModeId: 'ModeId:subscribed',
        },
      ],
      defaultModeId: 'ModeId:extension',
      variableIds: ['VariableID:local', 'VariableID:subscribed-inherited'],
      variableOverrides: {},
    }
    const localVariable: ExportVariable = {
      id: 'VariableID:local',
      name: 'local',
      variableCollectionId: collection.id,
      resolvedType: 'STRING',
      valuesByMode: { 'ModeId:extension': 'local' },
    }

    const doc = buildLocalVariablesExport([collection], [localVariable], {
      excludeHidden: true,
    })

    expect(doc.meta.variableCollections[collection.id].variableIds).toEqual([
      'VariableID:local',
      'VariableID:subscribed-inherited',
    ])
  })

  it('removes override entries owned by excluded variables', () => {
    const collection: ExportExtendedCollection = {
      id: 'VariableCollectionId:extension',
      name: 'Brand extension',
      isExtension: true,
      parentVariableCollectionId: 'VariableCollectionId:parent',
      rootVariableCollectionId: 'VariableCollectionId:root',
      modes: [
        {
          modeId: 'ModeId:extension',
          name: 'Extension',
          parentModeId: 'ModeId:parent',
        },
      ],
      defaultModeId: 'ModeId:extension',
      variableIds: ['VariableID:hidden', 'VariableID:visible'],
      variableOverrides: {
        'VariableID:hidden': { 'ModeId:extension': 'hidden override' },
        'VariableID:visible': { 'ModeId:extension': 'visible override' },
      },
    }
    const variables: ExportVariable[] = [
      {
        id: 'VariableID:hidden',
        name: 'hidden',
        variableCollectionId: collection.id,
        resolvedType: 'STRING',
        valuesByMode: { 'ModeId:extension': 'hidden' },
        hiddenFromPublishing: true,
      },
      {
        id: 'VariableID:visible',
        name: 'visible',
        variableCollectionId: collection.id,
        resolvedType: 'STRING',
        valuesByMode: { 'ModeId:extension': 'visible' },
      },
    ]

    const doc = buildLocalVariablesExport([collection], variables, {
      excludeHidden: true,
    })
    const exported = doc.meta.variableCollections[collection.id]
    if (!exported.isExtension) {
      throw new Error('Expected an extended collection')
    }

    expect(Object.hasOwn(exported.variableOverrides, 'VariableID:hidden')).toBe(
      false
    )
    expect(exported.variableOverrides).toEqual({
      'VariableID:visible': { 'ModeId:extension': 'visible override' },
    })
  })

  it('removes mode overrides whose alias target is excluded', () => {
    const collection: ExportExtendedCollection = {
      id: 'VariableCollectionId:extension',
      name: 'Brand extension',
      isExtension: true,
      parentVariableCollectionId: 'VariableCollectionId:parent',
      rootVariableCollectionId: 'VariableCollectionId:root',
      modes: [
        {
          modeId: 'ModeId:unsafe',
          name: 'Unsafe',
          parentModeId: 'ModeId:parent-unsafe',
        },
        {
          modeId: 'ModeId:safe',
          name: 'Safe',
          parentModeId: 'ModeId:parent-safe',
        },
      ],
      defaultModeId: 'ModeId:safe',
      variableIds: ['VariableID:hidden-target', 'VariableID:visible'],
      variableOverrides: {
        'VariableID:visible': {
          'ModeId:unsafe': {
            type: 'VARIABLE_ALIAS',
            id: 'VariableID:hidden-target',
          },
          'ModeId:safe': 'safe override',
        },
      },
    }
    const variables: ExportVariable[] = [
      {
        id: 'VariableID:hidden-target',
        name: 'hidden target',
        variableCollectionId: collection.id,
        resolvedType: 'STRING',
        valuesByMode: { 'ModeId:safe': 'hidden' },
        hiddenFromPublishing: true,
      },
      {
        id: 'VariableID:visible',
        name: 'visible',
        variableCollectionId: collection.id,
        resolvedType: 'STRING',
        valuesByMode: { 'ModeId:safe': 'visible' },
      },
    ]

    const doc = buildLocalVariablesExport([collection], variables, {
      excludeHidden: true,
    })
    const exported = doc.meta.variableCollections[collection.id]
    if (!exported.isExtension) {
      throw new Error('Expected an extended collection')
    }

    expect(
      Object.hasOwn(
        exported.variableOverrides['VariableID:visible'],
        'ModeId:unsafe'
      )
    ).toBe(false)
    expect(exported.variableOverrides['VariableID:visible']).toEqual({
      'ModeId:safe': 'safe override',
    })
  })

  it('preserves own __proto__ IDs in every output dictionary', () => {
    const variableOverrides = Object.fromEntries([
      [
        '__proto__',
        Object.fromEntries([
          ['__proto__', { type: 'VARIABLE_ALIAS', id: 'VariableID:target' }],
        ]),
      ],
    ]) as ExportExtendedCollection['variableOverrides']
    const collection: ExportExtendedCollection = {
      id: '__proto__',
      name: 'Hostile collection ID',
      isExtension: true,
      parentVariableCollectionId: 'VariableCollectionId:parent',
      rootVariableCollectionId: 'VariableCollectionId:root',
      modes: [
        {
          modeId: '__proto__',
          name: 'Hostile mode ID',
          parentModeId: 'ModeId:parent',
        },
      ],
      defaultModeId: '__proto__',
      variableIds: ['__proto__'],
      variableOverrides,
    }
    const variable: ExportVariable = {
      id: '__proto__',
      name: 'Hostile variable ID',
      variableCollectionId: collection.id,
      resolvedType: 'COLOR',
      valuesByMode: Object.fromEntries([
        ['__proto__', { type: 'VARIABLE_ALIAS', id: 'VariableID:target' }],
      ]),
    }

    const doc = buildLocalVariablesExport([collection], [variable])

    expect(Object.hasOwn(doc.meta.variableCollections, '__proto__')).toBe(true)
    expect(Object.hasOwn(doc.meta.variables, '__proto__')).toBe(true)
    const exported = getOwnValue(doc.meta.variableCollections, '__proto__')
    if (!exported.isExtension) {
      throw new Error('Expected an extended collection')
    }
    expect(Object.hasOwn(exported.variableOverrides, '__proto__')).toBe(true)
    const overrideValues = getOwnValue(exported.variableOverrides, '__proto__')
    expect(Object.hasOwn(overrideValues, '__proto__')).toBe(true)
    expect(getOwnValue(overrideValues, '__proto__')).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    })
    const exportedVariable = getOwnValue(doc.meta.variables, '__proto__')
    expect(Object.hasOwn(exportedVariable.valuesByMode, '__proto__')).toBe(true)
  })

  it('deep-copies ordinary variable alias and color values', () => {
    const aliasValue = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    }
    const colorValue = { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }
    const collection: ExportCollection = {
      id: 'VariableCollectionId:ordinary',
      name: 'Ordinary legacy collection',
      modes: [
        { modeId: 'ModeId:alias', name: 'Alias' },
        { modeId: 'ModeId:color', name: 'Color' },
      ],
      defaultModeId: 'ModeId:alias',
      variableIds: ['VariableID:ordinary'],
    }
    const variable: ExportVariable = {
      id: 'VariableID:ordinary',
      name: 'ordinary',
      variableCollectionId: collection.id,
      resolvedType: 'COLOR',
      valuesByMode: {
        'ModeId:alias': aliasValue,
        'ModeId:color': colorValue,
      },
    }

    const doc = buildLocalVariablesExport([collection], [variable])
    const exported = doc.meta.variables[variable.id]

    expect(exported.valuesByMode).not.toBe(variable.valuesByMode)
    expect(exported.valuesByMode['ModeId:alias']).not.toBe(aliasValue)
    expect(exported.valuesByMode['ModeId:color']).not.toBe(colorValue)

    aliasValue.id = 'VariableID:mutated'
    colorValue.r = 1
    expect(exported.valuesByMode['ModeId:alias']).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:target',
    })
    expect(exported.valuesByMode['ModeId:color']).toEqual({
      r: 0.1,
      g: 0.2,
      b: 0.3,
      a: 0.4,
    })
  })

  it('can exclude hidden variables', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = Object.values(fixture.meta.variables) as ExportVariable[]
    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })
    expect(Object.keys(doc.meta.variables)).toHaveLength(11)
    expect(doc.meta.variables['VariableID:1:106']).toBeUndefined()
  })

  it('removes excluded variables from collection membership', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = Object.values(fixture.meta.variables) as ExportVariable[]
    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })

    expect(
      doc.meta.variableCollections['VariableCollectionId:1:100'].variableIds
    ).not.toContain('VariableID:1:106')
  })

  it('excludes visible variables whose aliases transitively depend on hidden variables', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = (
      Object.values(fixture.meta.variables) as ExportVariable[]
    ).map(variable => {
      if (variable.id === 'VariableID:1:107') {
        return {
          ...variable,
          valuesByMode: {
            '1:0': {
              type: 'VARIABLE_ALIAS',
              id: 'VariableID:1:106',
            },
          },
        }
      }
      if (variable.id === 'VariableID:1:105') {
        return {
          ...variable,
          valuesByMode: {
            '1:0': {
              type: 'VARIABLE_ALIAS',
              id: 'VariableID:1:107',
            },
          },
        }
      }
      return variable
    })

    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })

    expect(doc.meta.variables['VariableID:1:106']).toBeUndefined()
    expect(doc.meta.variables['VariableID:1:107']).toBeUndefined()
    expect(doc.meta.variables['VariableID:1:105']).toBeUndefined()
    expect(
      doc.meta.variableCollections['VariableCollectionId:1:100'].variableIds
    ).toEqual([
      'VariableID:1:101',
      'VariableID:1:102',
      'VariableID:1:103',
      'VariableID:1:104',
    ])
  })

  it('summarizes counts', () => {
    const doc = fromFixture()
    const summary = summarizeExport(doc, 'my-file')
    expect(summary.collections).toBe(3)
    expect(summary.variables).toBe(12)
    expect(summary.modes).toBe(5)
    expect(summary.fileName).toBe('my-file.json')
  })
})
