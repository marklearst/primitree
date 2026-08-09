import type {
  DTCGDocument,
  DTCGGroup,
  DTCGToken,
  DTCGTokenType,
  ResolverDocument,
} from '../types'
import { isReferenceValue, isToken } from '../types'
import { applyResolver } from '../resolve'
import { claimCssVarName } from './css'

const NAMESPACE_NOISE: Record<string, Set<string>> = {
  color: new Set(['color', 'colors']),
  radius: new Set(['radius', 'radii']),
  spacing: new Set(['space', 'spacing']),
  font: new Set(['font', 'fonts', 'family', 'typeface']),
  'font-weight': new Set(['font', 'weight']),
  ease: new Set(['ease', 'easing', 'timing']),
}

interface TypedFlatToken {
  readonly path: string
  readonly token: DTCGToken
  readonly type: DTCGTokenType | undefined
}

const MAX_TAILWIND_GROUP_DEPTH = 64
const MAX_TAILWIND_ITEMS = 100_000

function flattenTypedTokens(document: DTCGDocument): TypedFlatToken[] {
  const entries: Array<{
    readonly path: string
    readonly token: DTCGToken
    readonly declaredType: DTCGTokenType | undefined
  }> = []
  let items = 0

  function walk(
    group: DTCGGroup,
    prefix: readonly string[],
    inheritedType: DTCGTokenType | undefined,
    depth: number
  ): void {
    if (depth > MAX_TAILWIND_GROUP_DEPTH) {
      throw new TypeError(
        'Tailwind output can read at most 64 token-group levels.'
      )
    }
    const groupType = Reflect.get(group, '$type')
    const type =
      typeof groupType === 'string'
        ? (groupType as DTCGTokenType)
        : inheritedType
    for (const [key, value] of Object.entries(group)) {
      items += 1
      if (items > MAX_TAILWIND_ITEMS) {
        throw new TypeError('Tailwind output can read at most 100,000 items.')
      }
      if (key.startsWith('$') && key !== '$root') {
        continue
      }
      if (isToken(value)) {
        entries.push({
          path: [...prefix, key].join('.'),
          token: value,
          declaredType: value.$type ?? type,
        })
      } else {
        walk(value, [...prefix, key], type, depth + 1)
      }
    }
  }

  walk(document, [], undefined, 0)
  const byPath = new Map(entries.map(entry => [entry.path, entry]))
  const resolved = new Map<string, DTCGTokenType | undefined>()

  function resolveType(
    start: (typeof entries)[number]
  ): DTCGTokenType | undefined {
    const active = new Set<string>()
    const trail: string[] = []
    let entry: (typeof entries)[number] | undefined = start
    let type: DTCGTokenType | undefined

    while (entry !== undefined) {
      if (entry.declaredType !== undefined) {
        type = entry.declaredType
        break
      }
      if (resolved.has(entry.path)) {
        type = resolved.get(entry.path)
        break
      }
      if (active.has(entry.path) || !isReferenceValue(entry.token.$value)) {
        break
      }
      active.add(entry.path)
      trail.push(entry.path)
      entry = byPath.get(entry.token.$value.slice(1, -1))
    }

    for (const path of trail) {
      resolved.set(path, type)
    }
    return type
  }

  return entries
    .map(entry => ({
      path: entry.path,
      token: entry.token,
      type: resolveType(entry),
    }))
    .sort((left, right) =>
      left.path === right.path ? 0 : left.path < right.path ? -1 : 1
    )
}

function tailwindName(path: string, namespace: string): string {
  const segments = path.split('.')
  // Drop the collection prefix, then leading segments that just repeat the
  // namespace (e.g. semantic.color.bg.brand -> bg-brand under --color-*,
  // primitives.font.family.sans -> sans under --font-*).
  let rest = segments.slice(1)
  const noise = NAMESPACE_NOISE[namespace] ?? new Set([namespace])
  while (rest.length > 1 && rest[0] && noise.has(rest[0].toLowerCase())) {
    rest = rest.slice(1)
  }
  const slug = rest
    .map(s =>
      s
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    )
    .filter(s => s.length > 0)
    .join('-')
  return slug.length > 0 ? slug : 'default'
}

/**
 * Emit a Tailwind CSS v4 `@theme inline` file that maps design tokens onto
 * Tailwind's theme namespaces, referencing the custom properties from the
 * generated `tokens.css` so mode switching keeps working.
 *
 * @remarks
 * Mapping: `color` → `--color-*`; `dimension` → `--radius-*` for paths that
 * mention radius and `--spacing-*` for other paths; `fontFamily` →
 * `--font-*`; `fontWeight` → `--font-weight-*`; `cubicBezier` → `--ease-*`.
 * The emitter skips types without a Tailwind namespace.
 *
 * @public
 */
export function emitTailwind(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument
): string {
  const flat = flattenTypedTokens(applyResolver(files, resolver))
  const cssNames = new Map<string, string>()
  const used = new Set<string>()
  const lines: string[] = [
    '/* @primitree/dtcg output for Tailwind CSS v4.',
    '   Import tokens.css BEFORE this file so the referenced variables exist:',
    "     @import './tokens.css';",
    "     @import './tokens.tailwind.css';  */",
    '',
    '@theme inline {',
  ]

  const entries: string[] = []
  for (const { path, type } of flat) {
    let namespace: string | null = null
    switch (type) {
      case 'color':
        namespace = 'color'
        break
      case 'dimension':
        namespace = /(^|[./-])radius/i.test(path) ? 'radius' : 'spacing'
        break
      case 'fontFamily':
        namespace = 'font'
        break
      case 'fontWeight':
        namespace = 'font-weight'
        break
      case 'cubicBezier':
        namespace = 'ease'
        break
      default:
        namespace = null
    }
    if (namespace === null) {
      continue
    }
    const cssName = claimCssVarName(cssNames, path)
    let name = `--${namespace}-${tailwindName(path, namespace)}`
    if (used.has(name)) {
      const collection = path.split('.')[0] ?? 'tokens'
      name = `--${namespace}-${collection}-${tailwindName(path, namespace)}`
    }
    if (used.has(name)) {
      const base = name
      let suffix = 2
      while (used.has(`${base}-${suffix}`)) {
        suffix += 1
      }
      name = `${base}-${suffix}`
    }
    used.add(name)
    entries.push(`  ${name}: var(${cssName});`)
  }

  lines.push(...entries, '}', '')
  return lines.join('\n')
}
