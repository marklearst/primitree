import type { LocalVariablesResponse } from "../../src/types";

export const mockVariablesResponse: LocalVariablesResponse = {
  meta: {
    variableCollections: {
      "VariableCollectionId:123:456": {
        id: "VariableCollectionId:123:456",
        name: "Test Collection 1",
        modes: [{ modeId: "1:1", name: "Mode 1" }],
        defaultModeId: "1:1",
        hiddenFromPublishing: false,
        updatedAt: "2024-01-01T00:00:00Z",
        variableIds: ["VariableId:123:789"],
      },
      "VariableCollectionId:123:457": {
        id: "VariableCollectionId:123:457",
        name: "Test Collection 2",
        modes: [{ modeId: "2:1", name: "Mode A" }],
        defaultModeId: "2:1",
        hiddenFromPublishing: true,
        updatedAt: "2024-01-01T00:00:00Z",
        variableIds: ["VariableId:123:790"],
      },
    },
    variables: {
      "VariableID:1:1": {
        id: "VariableID:1:1",
        name: "colors/primary",
        variableCollectionId: "VariableCollectionId:1:1",
        resolvedType: "COLOR",
        valuesByMode: {
          "1:0": { r: 1, g: 0.5, b: 0, a: 1 },
          "1:1": { r: 0, g: 0.5, b: 1, a: 1 },
        },
        description: "Primary brand color",
        hiddenFromPublishing: false,
        scopes: ["ALL_SCOPES"],
        codeSyntax: {},
        updatedAt: "2024-01-01T00:00:00Z",
      },
      "VariableID:1:2": {
        id: "VariableID:1:2",
        name: "sizing/padding",
        variableCollectionId: "VariableCollectionId:1:1",
        resolvedType: "FLOAT",
        valuesByMode: {
          "1:0": 16,
          "1:1": 16,
        },
        description: "Standard padding value",
        hiddenFromPublishing: false,
        scopes: ["ALL_SCOPES"],
        codeSyntax: {},
        updatedAt: "2024-01-01T00:00:00Z",
      },
    },
  },
};
