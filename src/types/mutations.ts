// Mutation payload/result types

export interface FigmaOperationResponse {
  success: boolean;
  message?: string;
}

export interface VariableValueUpdate {
  modeId: string;
  value: string; // or any, if the value can be more complex
}

export type SpecificType = VariableValueUpdate[];
