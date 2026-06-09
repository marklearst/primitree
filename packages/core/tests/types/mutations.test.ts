import { describe, expect, it } from 'vitest'
import type {
  VariableCollectionChange,
  VariableModeChange,
  VariableChange,
  VariableModeValue,
} from '../../src/types/mutations'

describe('Figma mutation payload types', () => {
  it('accepts temporary ids and extended collection fields on create', () => {
    const collection: VariableCollectionChange = {
      action: 'CREATE',
      name: 'Theme extension',
      parentVariableCollectionId: 'VariableCollectionId:1',
      initialModeIdToParentModeIdMapping: { '1:dark': 'tempDark' },
    }
    const mode: VariableModeChange = {
      action: 'CREATE',
      name: 'Dark',
      variableCollectionId: 'VariableCollectionId:temp',
    }
    const variable: VariableChange = {
      action: 'CREATE',
      name: 'color/bg',
      variableCollectionId: 'VariableCollectionId:temp',
      resolvedType: 'COLOR',
    }
    const removedOverride: VariableModeValue = {
      variableId: 'VariableID:1',
      modeId: 'VariableCollectionId:2/1:dark',
      value: null,
    }
    const rgb: VariableModeValue = {
      variableId: 'VariableID:1',
      modeId: '1:dark',
      value: { r: 1, g: 0, b: 0 },
    }

    expect([collection, mode, variable, removedOverride, rgb]).toHaveLength(5)
  })

  it('requires ids for update and delete actions', () => {
    // @ts-expect-error UPDATE requires an id
    const update: VariableChange = { action: 'UPDATE', name: 'Renamed' }
    // @ts-expect-error DELETE requires an id
    const remove: VariableCollectionChange = { action: 'DELETE' }
    expect([update, remove]).toHaveLength(2)
  })

  it('rejects create-only fields during updates', () => {
    const typed = {
      action: 'UPDATE',
      id: 'VariableID:1',
      // @ts-expect-error resolvedType cannot change after variable creation
      resolvedType: 'STRING',
    } satisfies VariableChange
    const mixed = {
      action: 'CREATE',
      name: 'Invalid extension',
      parentVariableCollectionId: 'VariableCollectionId:1',
      // @ts-expect-error a root initial mode and extended parent are mutually exclusive
      initialModeId: 'tempMode',
    } satisfies VariableCollectionChange
    expect([typed, mixed]).toHaveLength(2)
  })
})
