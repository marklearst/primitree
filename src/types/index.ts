/****
 * @packageDocumentation
 *
 * OSS barrel file for all public types and interfaces in @figma-vars/hooks.
 *
 * @remarks
 * This module re-exports all Figma domain types (variables, collections, modes, API response models), mutation argument/result types, and all context/provider types for robust type-safe integration. Import types directly from this barrel for application code, plugins, API adapters, or custom UI tooling. All official Figma variable, mutation, and provider types are available from this entry point—see below for usage.
 *
 * @example
 * ```ts
 * // Importing multiple types for advanced integration and custom hooks:
 * import type {
 *   FigmaVariable,
 *   FigmaCollection,
 *   VariableMode,
 *   UpdateVariableArgs,
 *   FigmaVarsProviderProps,
 *   MutationResult,
 * } from '@figma-vars/hooks';
 *
 * // Use for type-safe props, mutation payloads, and UI mapping:
 * function MyFeature(props: { variable: FigmaVariable; onUpdate: (args: UpdateVariableArgs) => void }) {
 *   // ...
 * }
 * ```
 */
export * from 'types/figma'
export * from 'types/hooks'
export * from 'types/mutations'
export * from 'types/contexts'
