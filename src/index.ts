// index.ts

// Public API: Core Figma Variables Hooks & Utilities
export { default as useFigmaToken } from './hooks/useFigmaToken'
export { default as useVariables } from './hooks/useVariables'
export { default as useVariableCollections } from './hooks/useVariableCollections'
export { default as useVariableModes } from './hooks/useVariableModes'

// Mutation utilities
export * from './mutations/createVariable'
export * from './mutations/updateVariable'
export * from './mutations/deleteVariable'
export * from './mutations/updateVariableValues'

// Utilities
export * from './utils/filterVariables'
export * from './utils/cache'
export * from './utils/fetchHelpers'
export * from './utils/authHelpers'

// Advanced/Experimental (opt-in)
export { default as useVariableAliases } from './experimental/useVariableAliases'
export { default as useVariableBindings } from './experimental/useVariableBindings'
export { default as usePublishVars } from './experimental/usePublishVars'
export { default as useSync } from './experimental/useSync'
