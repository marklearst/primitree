import { createContext } from 'react'
import type {
  DTCGDocument,
  DTCGToken,
  DTCGTokenType,
  DTCGTokenValue,
  TypedFlatToken,
} from '@primitree/dtcg'

/**
 * Token data and Resolver context controls.
 *
 * @public
 */
export interface TokensContextValue {
  /** The merged document for the active contexts. */
  document: DTCGDocument
  /** Flattened tokens and their effective types in the merged document. */
  flat: TypedFlatToken[]
  /** Token lookup by dot path. */
  tokensByPath: Map<string, DTCGToken>
  /** Effective token type by dot path. */
  typesByPath: Map<string, DTCGTokenType | undefined>
  /** Reference-resolved values by dot path. */
  valuesByPath: Map<string, DTCGTokenValue>
  /** Active context per modifier axis (e.g. `{ semantic: 'dark' }`). */
  contexts: Record<string, string>
  /** Resolver contexts for each axis. */
  availableContexts: Record<string, string[]>
  /** Switch one axis to a different context. */
  setContext: (axis: string, context: string) => void
  /** Replace the whole context selection at once. */
  setContexts: (contexts: Record<string, string>) => void
}

export const TokensContext = createContext<TokensContextValue | null>(null)
