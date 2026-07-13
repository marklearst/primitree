/**
 * @packageDocumentation
 *
 * Entry point for **@figmavars/dtcg** — convert Figma variables JSON into
 * DTCG 2025.10 design tokens with a standards-compliant Resolver for modes.
 *
 * @remarks
 * Pure functions, no I/O: works in Node, browsers, and edge runtimes. Pairs
 * with `@figmavars/cli` for file output and `@figmavars/hooks` for runtime
 * consumption.
 */
export { toDTCG, FIGMA_EXTENSION_KEY, RESOLVER_SCHEMA_URL } from './emit'
export type { ToDTCGOptions, ToDTCGResult } from './emit'

export {
  mergeDocuments,
  flattenTokens,
  resolveTokenValues,
  resolveTokenValuesSafe,
  applyResolver,
  listContexts,
  listPermutations,
  ReferenceResolutionError,
} from './resolve'
export type { FlatToken } from './resolve'

export { figmaColorToDTCG, colorToHex, isFigmaColor } from './color'
export { inferTokenType } from './inferType'
export { slugify, sanitizeSegment, toPathSegments, uniqueSlugs } from './naming'

export { emitCss, cssVarName, cssValue } from './pipeline/css'
export type { EmitCssOptions } from './pipeline/css'
export { emitTailwind } from './pipeline/tailwind'
export { emitTypescript } from './pipeline/typescript'
export { buildPipeline } from './pipeline/build'
export type {
  PipelineFile,
  BuildPipelineOptions,
  BuildPipelineResult,
  PipelineSummary,
} from './pipeline/build'

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
