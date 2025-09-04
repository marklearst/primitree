import type { LocalVariablesResponse } from '../../src/types'

export const mockVariablesResponse: LocalVariablesResponse = {
  meta: {
    variableCollections: {
      'VariableCollectionId:1:1': {
        id: 'VariableCollectionId:1:1',
        name: 'Brand Colors',
        modes: [
          { modeId: '1:0', name: 'Light' },
          { modeId: '1:1', name: 'Dark' },
        ],
        defaultModeId: '1:0',
        variableIds: ['VariableID:1:1', 'VariableID:1:2'],
        hiddenFromPublishing: false,
        updatedAt: '2024-01-01T00:00:00Z',
      },
    },
    variables: {
      'VariableID:1:1': {
        id: 'VariableID:1:1',
        name: 'colors/primary',
        variableCollectionId: 'VariableCollectionId:1:1',
        resolvedType: 'COLOR',
        valuesByMode: {
          '1:0': { r: 1, g: 0.5, b: 0, a: 1 },
          '1:1': { r: 0, g: 0.5, b: 1, a: 1 },
        },
        description: 'Primary brand color',
        hiddenFromPublishing: false,
        scopes: ['ALL_SCOPES'],
        codeSyntax: {},
        updatedAt: '2024-01-01T00:00:00Z',
      },
      'VariableID:1:2': {
        id: 'VariableID:1:2',
        name: 'sizing/padding',
        variableCollectionId: 'VariableCollectionId:1:1',
        resolvedType: 'FLOAT',
        valuesByMode: {
          '1:0': 16,
          '1:1': 16,
        },
        description: 'Standard padding value',
        hiddenFromPublishing: false,
        scopes: ['ALL_SCOPES'],
        codeSyntax: {},
        updatedAt: '2024-01-01T00:00:00Z',
      },
    },
  },
}
