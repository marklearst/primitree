/**
 * @packageDocumentation
 *
 * Entry point for **@figma-vars/hooks** — a modern, idiomatic React hooks library for Figma Variables via the REST API.
 *
 * @remarks
 * Exposes all providers, hooks, utilities, and types needed to build robust Figma variable dashboards, plugins, and design system tools.
 * Each export group below has its own summary and real-world usage example for rapid onboarding and type-safe integration.
 *
 * MIT Licensed. Author: Mark Learst.
 * Docs: {@link https://github.com/marklearst/figma-vars-hooks}
 */

/**
 * React context provider for Figma API authentication and file scoping.
 *
 * @remarks
 * Wrap your app in this provider to supply the Figma Personal Access Token and file key globally—all hooks and utilities will use this context.
 * This ensures seamless, type-safe access to the Figma REST API for all child components.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figma-vars/hooks';
 *
 * function App() {
 *   return (
 *     <FigmaVarsProvider token={process.env.FIGMA_TOKEN} fileKey="your-file-key">
 *       <YourComponent />
 *     </FigmaVarsProvider>
 *   );
 * }
 * ```
 */
export { FigmaVarsProvider } from 'contexts'

/**
 * Core React hooks for interacting with Figma Variables.
 *
 * @remarks
 * Hooks for fetching, creating, updating, deleting, and bulk updating Figma variables—plus selectors for collections and modes.
 * All hooks share idiomatic return shapes and error handling for rapid UI and API integration.
 * Use these hooks to build dashboards, plugins, and design system tools with minimal boilerplate and maximum type safety.
 *
 * @see {@link https://www.figma.com/developers/api#variables | Figma Variables API}
 *
 * @example
 * ```tsx
 * import { useVariables, useCreateVariable } from '@figma-vars/hooks';
 *
 * function Example() {
 *   const { data, isLoading } = useVariables();
 *   const { mutate } = useCreateVariable();
 *   // Use the hooks in your component logic
 * }
 * ```
 */
export {
  useVariables,
  useVariableCollections,
  useVariableModes,
  useCreateVariable,
  useUpdateVariable,
  useDeleteVariable,
  useBulkUpdateVariables,
} from 'hooks'

/**
 * Utility functions for Figma Variable management.
 *
 * @remarks
 * Helpers like `filterVariables` for searching and filtering variable lists. All utilities are stateless and type-safe—use for UI filtering, scripting, and dashboard logic.
 *
 * @example
 * ```ts
 * import { filterVariables } from '@figma-vars/hooks';
 * const filtered = filterVariables(variables, { resolvedType: 'COLOR' });
 * ```
 */
export { filterVariables } from 'utils'

/**
 * All official TypeScript types for advanced usage and type-safe integration.
 *
 * @remarks
 * All Figma domain models, mutation payloads/results, and provider context types—imported as needed for advanced TypeScript, API wrappers, plugins, and custom hooks.
 *
 * @example
 * ```ts
 * import type { FigmaVariable, CreateVariablePayload } from '@figma-vars/hooks';
 * ```
 */
export * from 'types'
