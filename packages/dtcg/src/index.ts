/**
 * Convert Figma variables JSON to DTCG 2025.10 plus a documented boolean
 * extension.
 *
 * @remarks
 * The package emits token documents and a DTCG 2025.10 Resolver for Figma
 * modes. Its functions do not read or write files.
 *
 * @module dtcg
 */
export { toDTCG, PRIMITREE_EXTENSION_KEY, RESOLVER_SCHEMA_URL } from './emit'
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
export {
  allocateUniqueSlugs,
  slugify,
  sanitizeSegment,
  toPathSegments,
  uniqueSlugs,
} from './naming'

export { emitCss, cssVarName, cssValue } from './pipeline/css'
export type { EmitCssOptions } from './pipeline/css'
export { emitTailwind } from './pipeline/tailwind'
export { emitTypescript } from './pipeline/typescript'
export {
  buildDTCGOutputs,
  buildPipeline,
  DTCGOutputCapabilityError,
} from './pipeline/build'
export type {
  PipelineFile,
  DTCGOutputSet,
  BuildOutputOptions,
  BuildPipelineOptions,
  BuildPipelineResult,
  PipelineSummary,
} from './pipeline/build'

export { isToken, isReferenceValue } from './types'
export { createDTCGGraphFragment } from './graph'
export type { DTCGGraphFragmentOptions } from './graph'
export type {
  DTCGColorValue,
  DTCGDimensionValue,
  DTCGDurationValue,
  DTCGFontFamilyValue,
  DTCGFontWeightValue,
  DTCGTokenType,
  DTCGTokenValue,
  DTCGToken,
  DTCGGroup,
  DTCGDocument,
  DTCGRef,
  ResolverSet,
  ResolverModifier,
  ResolverDocument,
  FigmaMetadataExtension,
} from './types'
