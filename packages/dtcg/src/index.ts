/**
 * @packageDocumentation
 *
 * Entry point for **@figma-vars/dtcg** — convert Figma variables JSON into
 * DTCG 2025.10 design tokens with a standards-compliant Resolver for modes.
 *
 * @remarks
 * Pure functions, no I/O: works in Node, browsers, and edge runtimes. Pairs
 * with `@figma-vars/cli` for file output and `@figma-vars/hooks` for runtime
 * consumption.
 */
export { toDTCG, FIGMA_EXTENSION_KEY, RESOLVER_SCHEMA_URL } from './emit'
export type { ToDTCGOptions, ToDTCGResult } from './emit'

export {
  mergeDocuments,
  flattenTokens,
  resolveTokenValues,
  applyResolver,
  listContexts,
  listPermutations,
  ReferenceResolutionError,
} from './resolve'
export type { FlatToken } from './resolve'

export { figmaColorToDTCG, colorToHex, isFigmaColor } from './color'
export { inferTokenType } from './inferType'
export { slugify, sanitizeSegment, toPathSegments, uniqueSlugs } from './naming'

export { isToken, isReferenceValue } from './types'
export type {
  DTCGColorValue,
  DTCGDimensionValue,
  DTCGDurationValue,
  DTCGTokenType,
  DTCGTokenValue,
  DTCGToken,
  DTCGGroup,
  DTCGDocument,
  DTCGRef,
  ResolverSet,
  ResolverModifier,
  ResolverDocument,
  FigmaVarsExtension,
} from './types'
