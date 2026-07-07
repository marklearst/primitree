export {
  normalizeVariables,
  toLocalVariablesResponse,
  VariablesParseError,
} from './normalize'
export {
  resolveVariableValue,
  resolveAllVariableValues,
  isVariableAlias,
  AliasResolutionError,
} from './resolve'
export type { AliasResolutionErrorCode } from './resolve'
export type {
  NormalizedMode,
  NormalizedCollection,
  NormalizedVariable,
  NormalizedVariables,
  ConcreteValue,
  ResolvedValue,
} from './types'
