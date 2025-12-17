import type { FigmaTokenContextType, FigmaVarsProviderProps } from "types/contexts";
import { FigmaTokenContext } from "./FigmaTokenContext";

/**
 * React context provider that supplies the Figma Personal Access Token and file key to all descendant components.
 *
 * @remarks
 * Wrap your application or feature subtree with this provider to securely and type-safely provide the Figma Personal Access Token (PAT) and target Figma file key. This enables all child hooks and utilities to access the Figma Variables REST API with consistent authentication and scoping.
 *
 * This is the central source of truth for Figma authentication and file context within the app.
 *
 * @example
 * ```tsx
 * import { FigmaVarsProvider } from '@figma-vars/hooks/contexts';
 *
 * function App() {
 *   return (
 *     <FigmaVarsProvider token={process.env.FIGMA_PAT!} fileKey="AbC123">
 *       <MyDashboard />
 *     </FigmaVarsProvider>
 *   );
 * }
 * ```
 *
 * @public
 */
export const FigmaVarsProvider = ({
  children,
  token,
  fileKey,
  fallbackFile,
}: FigmaVarsProviderProps) => {
  const value: FigmaTokenContextType =
    fallbackFile === undefined
      ? { token, fileKey }
      : { token, fileKey, fallbackFile };
  return (
    <FigmaTokenContext.Provider value={value}>
      {children}
    </FigmaTokenContext.Provider>
  );
};
