// index.ts

// Public API: Core Figma Variables Hooks & Utilities
export { FigmaVarsProvider } from 'contexts/FigmaVarsProvider'

// Hooks
export { useVariables } from 'hooks/useVariables'
export { useVariableCollections } from 'hooks/useVariableCollections'
export { useVariableModes } from 'hooks/useVariableModes'
export { default as useFigmaToken } from 'hooks/useFigmaToken'
export { useCreateVariable } from 'hooks/useCreateVariable'
export { useDeleteVariable } from 'hooks/useDeleteVariable'
export { useUpdateVariable } from 'hooks/useUpdateVariable'
export { useBulkUpdateVariables } from 'hooks/useBulkUpdateVariables'

// Types
export * from 'types'

// Utilities
export * from 'utils/filterVariables'
