// index.ts

// Public API: Core Figma Variables Hooks & Utilities
export { default as useFigmaToken } from './hooks/useFigmaToken'
export { useVariables } from './hooks/useVariables'
export { useVariableCollections } from './hooks/useVariableCollections'
export { useVariableModes } from './hooks/useVariableModes'

// Mutation utilities
export { useBulkUpdateVariables } from './mutations/bulkUpdateVariables'
export { useCreateVariable } from './mutations/createVariable'
export { useDeleteVariable } from './mutations/deleteVariable'
export { useUpdateVariable } from './mutations/updateVariable'

// Types
export * from './types'

// Utilities
export * from './utils/filterVariables'
export * from './utils/fetchHelpers'
export * from './utils/authHelpers'

export { FigmaVarsProvider } from './contexts/FigmaTokenContext'
