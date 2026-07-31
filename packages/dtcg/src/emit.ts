import {
  normalizeVariables,
  isVariableAlias,
  type NormalizedCollection,
  type NormalizedVariable,
  type NormalizedVariables,
  type VariableValue,
} from '@primitree/core'
import { figmaColorToDTCG, isFigmaColor } from './color'
import { createDictionary, hasOwn } from './dictionary'
import { inferTokenType } from './inferType'
import { allocateUniqueSlugs, toPathSegments } from './naming'
import type {
  DTCGDocument,
  DTCGGroup,
  DTCGToken,
  DTCGTokenValue,
  FigmaMetadataExtension,
  ResolverDocument,
  ResolverModifier,
  ResolverSet,
} from './types'
import { isToken } from './types'

/** Options for {@link toDTCG}. @public */
export interface ToDTCGOptions {
  /**
   * Attach Figma metadata (variable id, collection, scopes, codeSyntax) under
   * `$extensions['com.primitree']`. Default: `true`.
   */
  includeFigmaExtensions?: boolean
  /** Resolver document name. */
  resolverName?: string
}

/** Result of {@link toDTCG}. @public */
export interface ToDTCGResult {
  /**
   * File-name map of token documents. One base file per collection
   * (`<collection>.tokens.json`) plus one override file per non-default mode
   * (`<collection>.<mode>.tokens.json`).
   */
  files: Record<string, DTCGDocument>
  /** DTCG Resolver (2025.10) describing how modes combine. */
  resolver: ResolverDocument
  /** Suggested file name for the resolver document. */
  resolverFileName: string
  /** Conversion warnings. The converter still returns token files when this array is non-empty. */
  warnings: string[]
}

/** Key for Figma metadata in a token's `$extensions` object. @public */
export const PRIMITREE_EXTENSION_KEY = 'com.primitree'

/** DTCG 2025.10 Resolver JSON Schema URL. @public */
export const RESOLVER_SCHEMA_URL =
  'https://www.designtokens.org/schemas/2025.10/resolver.json'

interface EmitContext {
  normalized: NormalizedVariables
  collectionSlugs: Map<string, string>
  tokenPaths: Map<string, string[]>
  options: Required<Pick<ToDTCGOptions, 'includeFigmaExtensions'>>
  warnings: string[]
}

function buildTokenPaths(
  normalized: NormalizedVariables,
  collectionSlugs: Map<string, string>,
  warnings: string[]
): Map<string, string[]> {
  const paths = new Map<string, string[]>()
  const claimed = new Set<string>()
  const nextSuffix = new Map<string, number>()

  for (const variable of normalized.variables) {
    const collection = normalized.collectionsById[variable.collectionId]
    if (!collection) {
      continue
    }
    const slug = collectionSlugs.get(collection.id) ?? 'tokens'
    let segments = [slug, ...toPathSegments(variable.name)]
    let key = segments.join('.')
    if (claimed.has(key)) {
      warnings.push(
        `Token path collision for "${variable.name}" in collection ` +
          `"${collection.name}". Primitree appended a suffix.`
      )
      let n = nextSuffix.get(key) ?? 2
      while (claimed.has(`${key}-${n}`)) {
        n += 1
      }
      nextSuffix.set(key, n + 1)
      const last = segments[segments.length - 1] as string
      segments = [...segments.slice(0, -1), `${last}-${n}`]
      key = segments.join('.')
    }
    claimed.add(key)
    paths.set(variable.id, segments)
  }

  const strictPrefixes = new Set<string>()
  for (const segments of paths.values()) {
    for (let index = 1; index < segments.length; index += 1) {
      strictPrefixes.add(segments.slice(0, index).join('.'))
    }
  }

  for (const [id, segments] of paths) {
    if (strictPrefixes.has(segments.join('.'))) {
      paths.set(id, [...segments, '$root'])
      warnings.push(
        `Token path "${segments.join('.')}" is a group. ` +
          'Primitree moved the token to "$root".'
      )
    }
  }

  return paths
}

function referenceFor(
  ctx: EmitContext,
  targetId: string,
  fromVariable: NormalizedVariable
): string | null {
  const path = ctx.tokenPaths.get(targetId)
  if (!path) {
    ctx.warnings.push(
      `Variable "${fromVariable.name}" aliases missing variable "${targetId}". ` +
        'Primitree omitted its value.'
    )
    return null
  }
  return `{${path.join('.')}}`
}

function convertValue(
  ctx: EmitContext,
  variable: NormalizedVariable,
  type: ReturnType<typeof inferTokenType>,
  value: VariableValue
): DTCGTokenValue | null {
  if (isVariableAlias(value)) {
    return referenceFor(ctx, value.id, variable)
  }
  switch (type) {
    case 'color': {
      if (isFigmaColor(value)) {
        return figmaColorToDTCG(value)
      }
      ctx.warnings.push(
        `Variable "${variable.name}" is COLOR but has a non-color value. ` +
          'Primitree omitted its value.'
      )
      return null
    }
    case 'dimension': {
      if (typeof value === 'number') {
        return { value, unit: 'px' }
      }
      break
    }
    case 'duration': {
      if (typeof value === 'number') {
        return { value, unit: 'ms' }
      }
      break
    }
    case 'number':
    case 'fontWeight': {
      if (typeof value === 'number') {
        return value
      }
      break
    }
    case 'fontFamily':
    case 'string': {
      if (typeof value === 'string') {
        return value
      }
      break
    }
    case 'boolean': {
      if (typeof value === 'boolean') {
        return value
      }
      break
    }
  }
  ctx.warnings.push(
    `Variable "${variable.name}" has a value that does not match its ` +
      `resolved type. Primitree omitted its value.`
  )
  return null
}

function buildExtension(
  variable: NormalizedVariable,
  collection: NormalizedCollection
): FigmaMetadataExtension {
  const extension: FigmaMetadataExtension = {
    variableId: variable.id,
    collectionId: collection.id,
    collectionName: collection.name,
  }
  if (variable.scopes.length > 0) {
    extension.scopes = [...variable.scopes]
  }
  if (Object.keys(variable.codeSyntax).length > 0) {
    extension.codeSyntax = { ...variable.codeSyntax }
  }
  if (variable.hiddenFromPublishing) {
    extension.hiddenFromPublishing = true
  }
  if (variable.resolvedType === 'BOOLEAN') {
    // `boolean` is a non-standard $type; preserve the source type.
    extension.resolvedType = 'BOOLEAN'
  }
  return extension
}

function buildToken(
  ctx: EmitContext,
  variable: NormalizedVariable,
  collection: NormalizedCollection,
  modeId: string
): DTCGToken | null {
  const raw = variable.valuesByMode[modeId]
  if (raw === undefined) {
    return null
  }
  const type = inferTokenType(variable)
  const value = convertValue(ctx, variable, type, raw)
  if (value === null) {
    return null
  }
  const token: DTCGToken = { $type: type, $value: value }
  if (variable.description.length > 0) {
    token.$description = variable.description
  }
  if (ctx.options.includeFigmaExtensions) {
    token.$extensions = {
      [PRIMITREE_EXTENSION_KEY]: buildExtension(variable, collection),
    }
  }
  return token
}

function insertToken(
  root: DTCGGroup,
  segments: string[],
  token: DTCGToken
): void {
  let node: DTCGGroup = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i] as string
    if (!hasOwn(node, segment)) {
      const next: DTCGGroup = createDictionary()
      node[segment] = next
      node = next
      continue
    }

    const existing = node[segment]
    if (
      existing === undefined ||
      isToken(existing) ||
      typeof existing !== 'object' ||
      existing === null ||
      Array.isArray(existing)
    ) {
      throw new Error(
        `Internal token path collision at "${segments
          .slice(0, i + 1)
          .join('.')}": token blocks a group after path allocation`
      )
    }
    node = existing as DTCGGroup
  }
  const leaf = segments[segments.length - 1] as string
  if (hasOwn(node, leaf)) {
    throw new Error(
      `Internal token path collision at "${segments.join('.')}": ` +
        'path remained occupied after path allocation'
    )
  }
  node[leaf] = token
}

/**
 * Convert supported Figma variables JSON into DTCG 2025.10 token files and
 * a Resolver document.
 *
 * @remarks
 * - The emitter writes one base token file per collection with its default-mode values,
 *   wrapped in a group named after the collection so cross-collection alias
 *   references (`{semantic.color.bg.brand}`) are unambiguous.
 * - The emitter writes an override file for each non-default mode.
 * - The Resolver records multi-mode collections as modifiers with mode-name
 *   contexts. The default mode context applies no overrides.
 * - The emitter keeps Figma aliases as DTCG references.
 * - Boolean variables use the documented Primitree `boolean` extension.
 *
 * @param input - Figma variables JSON for `normalizeVariables`.
 * @param options - Emission options.
 *
 * @example
 * ```ts
 * import { toDTCG } from '@primitree/dtcg'
 *
 * const { files, resolver } = toDTCG(variablesJson)
 * for (const [name, doc] of Object.entries(files)) {
 *   await fs.writeFile(name, JSON.stringify(doc, null, 2))
 * }
 * ```
 *
 * @public
 */
export function toDTCG(
  input: unknown,
  options: ToDTCGOptions = {}
): ToDTCGResult {
  const normalized = normalizeVariables(input)
  const warnings = [...normalized.warnings]

  const collectionSlugList = allocateUniqueSlugs(
    normalized.collections,
    collection => collection.name
  )
  const slugsById = new Map(
    normalized.collections.map((collection, index) => [
      collection.id,
      collectionSlugList[index] as string,
    ])
  )

  const ctx: EmitContext = {
    normalized,
    collectionSlugs: slugsById,
    tokenPaths: new Map(),
    options: {
      includeFigmaExtensions: options.includeFigmaExtensions !== false,
    },
    warnings,
  }
  ctx.tokenPaths = buildTokenPaths(normalized, slugsById, warnings)

  const files = createDictionary<DTCGDocument>()
  const sets = createDictionary<ResolverSet>()
  const modifiers = createDictionary<ResolverModifier>()

  for (const collection of normalized.collections) {
    const slug = slugsById.get(collection.id) as string
    const baseFileName = `${slug}.tokens.json`
    const baseRoot: DTCGGroup = createDictionary()

    for (const variableId of collection.variableIds) {
      const variable = normalized.variablesById[variableId]
      if (!variable) {
        continue
      }
      const segments = ctx.tokenPaths.get(variableId)
      if (!segments) {
        continue
      }
      const token = buildToken(
        ctx,
        variable,
        collection,
        collection.defaultModeId
      )
      if (token) {
        insertToken(baseRoot, segments, token)
      }
    }

    files[baseFileName] = baseRoot
    sets[slug] = { sources: [{ $ref: `./${baseFileName}` }] }

    const extraModes = collection.modes.filter(
      m => m.id !== collection.defaultModeId
    )
    if (extraModes.length === 0) {
      continue
    }

    const modeSlugList = allocateUniqueSlugs(
      collection.modes,
      mode => mode.name
    )
    const modeSlugsById = new Map(
      collection.modes.map((mode, index) => [
        mode.id,
        modeSlugList[index] as string,
      ])
    )
    const contexts: ResolverModifier['contexts'] = createDictionary()
    const defaultMode = collection.modes.find(
      m => m.id === collection.defaultModeId
    )
    if (defaultMode) {
      contexts[modeSlugsById.get(defaultMode.id) ?? 'default'] = []
    }

    for (const mode of extraModes) {
      const modeSlug = modeSlugsById.get(mode.id) ?? 'mode'
      const modeFileName = `${slug}.${modeSlug}.tokens.json`
      const modeRoot: DTCGGroup = createDictionary()
      for (const variableId of collection.variableIds) {
        const variable = normalized.variablesById[variableId]
        if (!variable) {
          continue
        }
        const segments = ctx.tokenPaths.get(variableId)
        if (!segments) {
          continue
        }
        const token = buildToken(ctx, variable, collection, mode.id)
        if (token) {
          insertToken(modeRoot, segments, token)
        }
      }
      files[modeFileName] = modeRoot
      contexts[modeSlug] = [{ $ref: `./${modeFileName}` }]
    }

    const modifier: ResolverModifier = {
      description: `Figma modes for the "${collection.name}" collection`,
      contexts,
    }
    if (defaultMode) {
      modifier.default = modeSlugsById.get(defaultMode.id) ?? defaultMode.name
    }
    modifiers[slug] = modifier
  }

  const resolutionOrder = [
    ...Object.keys(sets).map(slug => ({ $ref: `#/sets/${slug}` })),
    ...Object.keys(modifiers).map(slug => ({ $ref: `#/modifiers/${slug}` })),
  ]

  const resolver: ResolverDocument = {
    $schema: RESOLVER_SCHEMA_URL,
    name: options.resolverName ?? 'Design Tokens',
    version: '2025.10',
    description:
      'DTCG Resolver from a Figma variables export via @primitree/dtcg.',
    sets,
    ...(Object.keys(modifiers).length > 0 ? { modifiers } : {}),
    resolutionOrder,
  }

  return {
    files,
    resolver,
    resolverFileName: 'tokens.resolver.json',
    warnings,
  }
}
