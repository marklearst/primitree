/**
 * @fileoverview Main entry point for the @figma-vars/hooks library.
 * Exports all public APIs including hooks, providers, types, and utilities for interacting with the Figma Variables API.
 *
 * @module @figma-vars/hooks
 * @version 1.0.0
 * @author Mark Learst
 * @license MIT
 * @see {@link https://www.figma.com/developers/api#variables|Figma Variables API Documentation}
 * @see {@link https://figmavars.com|Library Documentation}
 *
 * @example
 * ```typescript
 * // Basic usage with provider and hooks
 * import {
 *   FigmaVarsProvider,
 *   useVariables,
 *   useCreateVariable
 * } from '@figma-vars/hooks';
 *
 * function App() {
 *   return (
 *     <FigmaVarsProvider
 *       token={process.env.FIGMA_TOKEN}
 *       fileKey="your-file-key"
 *     >
 *       <VariablesDashboard />
 *     </FigmaVarsProvider>
 *   );
 * }
 *
 * function VariablesDashboard() {
 *   const { variables, isLoading } = useVariables();
 *   const { mutate: createVariable } = useCreateVariable();
 *
 *   // Your component logic here
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Import specific types
 * import type {
 *   FigmaVariable,
 *   CreateVariablePayload,
 *   VariableScope
 * } from '@figma-vars/hooks';
 * ```
 */

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
