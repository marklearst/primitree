// Figma API types

export interface FigmaVariable {
  id: string;
  name: string;
  type: string; // e.g., 'COLOR', 'NUMBER', etc.
  description?: string;
  // Add more fields as needed from Figma API
}

export interface FigmaCollection {
  id: string;
  name: string;
  variables: FigmaVariable[];
}

export interface VariablesResponse {
  meta: {
    variables: FigmaVariable[];
  };
}

export interface FigmaError {
  statusCode: number;
  message: string;
}
