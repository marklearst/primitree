// Internal cache utility for Figma variables
import { FigmaVariable } from '../hooks/types';

export class VariablesCache {
  private cache: { [fileKey: string]: FigmaVariable[] } = {};

  get(fileKey: string): FigmaVariable[] | undefined {
    return this.cache[fileKey];
  }

  set(fileKey: string, variables: FigmaVariable[]): void {
    this.cache[fileKey] = variables;
  }

  clear(fileKey?: string): void {
    if (fileKey) delete this.cache[fileKey];
    else this.cache = {};
  }
}
