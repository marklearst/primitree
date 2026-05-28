/**
 * @packageDocumentation
 * Barrel file for React context providers and related hooks in @figma-vars/hooks.
 *
 * @remarks
 * Re-exports the `FigmaVarsProvider` React context provider and the `useFigmaTokenContext` hook. Use this module to provide and access Figma API authentication and file scoping context throughout your app.
 *
 * @example
 * ```ts
 * import { FigmaVarsProvider, useFigmaTokenContext } from '@figma-vars/hooks';
 *
 * function App() {
 *   return (
 *     <FigmaVarsProvider token={process.env.FIGMA_PAT!} fileKey="your-file-key">
 *       <App />
 *     </FigmaVarsProvider>
 *   );
 * }
 * ```
 */
export { FigmaVarsProvider } from 'contexts/FigmaVarsProvider'
export { useFigmaTokenContext } from './useFigmaTokenContext'
export { FigmaTokenContext } from './FigmaTokenContext'
