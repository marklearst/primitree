// Utility to filter Figma variables by type, name, etc.
import type { FigmaVariable } from '../types';

export function filterVariables(variables: FigmaVariable[], criteria: { type?: string; name?: string }): FigmaVariable[] {
  return variables.filter(v => {
    let match = true;
    if (criteria.type) match = match && v.type === criteria.type;
    if (criteria.name) match = match && v.name === criteria.name;
    return match;
  });
}
