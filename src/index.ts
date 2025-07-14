// index.ts

// Public API: Core Figma Variables Hooks & Utilities
export { default as useFigmaToken } from './hooks/useFigmaToken'
export { useVariables } from './hooks/useVariables'
export { useVariableCollections } from './hooks/useVariableCollections'
export { useVariableModes } from './hooks/useVariableModes'

// Mutation functions
export { bulkUpdateVariables } from './mutations/bulkUpdateVariables'
export { createVariable } from './mutations/createVariable'
export { deleteVariable } from './mutations/deleteVariable'
export { updateVariable } from './mutations/updateVariable'

// Types
export * from './types'

// Utilities
export * from './utils/filterVariables'

// Provider
export { FigmaVarsProvider } from './contexts/FigmaTokenContext'
