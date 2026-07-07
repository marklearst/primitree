import { createContext } from 'react'
import type {
  DTCGDocument,
  DTCGToken,
  DTCGTokenValue,
  FlatToken,
} from '@figma-vars/dtcg'

/**
 * Everything the local-token hooks derive from the provided documents.
 *
 * @public
 */
export interface TokensContextValue {
  /** The merged document for the active contexts. */
  document: DTCGDocument
  /** Flattened tokens of the merged document. */
  flat: FlatToken[]
  /** Token lookup by dot path. */
  tokensByPath: Map<string, DTCGToken>
  /** Fully reference-resolved values by dot path. */
  valuesByPath: Map<string, DTCGTokenValue>
  /** Active context per modifier axis (e.g. `{ semantic: 'dark' }`). */
  contexts: Record<string, string>
  /** All contexts declared by the resolver, per axis. */
  availableContexts: Record<string, string[]>
  /** Switch one axis to a different context. */
  setContext: (axis: string, context: string) => void
  /** Replace the whole context selection at once. */
  setContexts: (contexts: Record<string, string>) => void
}

export const TokensContext = createContext<TokensContextValue | null>(null)
