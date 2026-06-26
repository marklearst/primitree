/**
 * @packageDocumentation
 *
 * Public types exported by `@figmavars/hooks`.
 *
 * @remarks
 * The package root re-exports Figma data types from `@figmavars/core` with
 * hook and provider types.
 *
 * @example
 * ```ts
 * import type {
 *   FigmaVariable,
 *   FigmaCollection,
 *   VariableMode,
 *   UpdateVariableArgs,
 *   FigmaVarsProviderProps,
 *   MutationResult,
 * } from '@figmavars/hooks';
 *
 * function MyFeature(props: { variable: FigmaVariable; onUpdate: (args: UpdateVariableArgs) => void }) {
 *   // ...
 * }
 * ```
 */
export * from '@figmavars/core/types'
export * from './hooks'
export * from './contexts'
