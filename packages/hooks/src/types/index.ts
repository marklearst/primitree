/**
 * @packageDocumentation
 *
 * Public `@primitree/hooks` types.
 *
 * @remarks
 * The package root re-exports Figma data types from `@primitree/core` with
 * hook and provider types.
 *
 * @example
 * ```ts
 * import type {
 *   FigmaVariable,
 *   FigmaCollection,
 *   VariableMode,
 *   UpdateVariableArgs,
 *   FigmaVariablesProviderProps,
 *   MutationResult,
 * } from '@primitree/hooks';
 *
 * function MyFeature(props: { variable: FigmaVariable; onUpdate: (args: UpdateVariableArgs) => void }) {
 *   // ...
 * }
 * ```
 */
export * from '@primitree/core/types'
export * from './hooks'
export * from './contexts'
