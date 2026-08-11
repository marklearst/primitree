import type { DTCGDocument, DTCGTokenType, ResolverDocument } from '../types'
import {
  applyResolverWithBudget,
  chargeResolverWork,
  flattenTypedTokensWithBudget,
  readResolutionContextStatesWithBudget,
  type ResolverWorkBudget,
  type TypedFlatToken,
} from '../resolve'
import { claimCssVarName, cssVarName } from './css'
import { DTCGOutputCapabilityError } from './output-error'

const NAMESPACE_NOISE: Record<string, Set<string>> = {
  color: new Set(['color', 'colors']),
  radius: new Set(['radius', 'radii']),
  spacing: new Set(['space', 'spacing']),
  font: new Set(['font', 'fonts', 'family', 'typeface']),
  'font-weight': new Set(['font', 'weight']),
  ease: new Set(['ease', 'easing', 'timing']),
}

const MAX_TAILWIND_GROUP_DEPTH = 64
const MAX_TAILWIND_ITEMS = 100_000
const MAX_TAILWIND_WORK = 1_000_000
const MAX_TAILWIND_OUTPUT_BYTES = 20 * 1024 * 1024
const TAILWIND_WORK_LIMIT_MESSAGE =
  'Tailwind output exceeds the 1,000,000-unit work limit.'
const TAILWIND_DEPTH_LIMIT_MESSAGE =
  'Tailwind output can read at most 64 token-group levels.'
const TAILWIND_OUTPUT_LIMIT_MESSAGE =
  'Tailwind output can contain at most 20 MiB.'

type TailwindNamespace =
  'color' | 'radius' | 'spacing' | 'font' | 'font-weight' | 'ease'

function chargeTailwindText(value: string, budget: ResolverWorkBudget): void {
  chargeResolverWork(budget, value.length + 1)
}

function tailwindName(
  path: string,
  namespace: string,
  budget: ResolverWorkBudget
): string {
  chargeTailwindText(path, budget)
  const segments = path.split('.')
  chargeResolverWork(budget, segments.length)
  // Drop the collection prefix, then leading segments that just repeat the
  // namespace (e.g. semantic.color.bg.brand -> bg-brand under --color-*,
  // primitives.font.family.sans -> sans under --font-*).
  let rest = segments.slice(1)
  const noise = NAMESPACE_NOISE[namespace] ?? new Set([namespace])
  while (rest.length > 1 && rest[0] && noise.has(rest[0].toLowerCase())) {
    rest = rest.slice(1)
  }
  const slug = rest
    .map(segment => {
      chargeTailwindText(segment, budget)
      return cssVarName(segment).slice(2)
    })
    .filter(s => s.length > 0)
    .join('-')
  return slug.length > 0 ? slug : 'default'
}

function isRadiusPath(path: string): boolean {
  const wordSeparated = path.replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
  return /(^|[./_-])radius($|[./_-])/iu.test(wordSeparated)
}

function tailwindNamespace(
  path: string,
  type: DTCGTokenType | undefined
): TailwindNamespace | null {
  switch (type) {
    case 'color':
      return 'color'
    case 'dimension':
      return isRadiusPath(path) ? 'radius' : 'spacing'
    case 'fontFamily':
      return 'font'
    case 'fontWeight':
      return 'font-weight'
    case 'cubicBezier':
      return 'ease'
    default:
      return null
  }
}

function readTailwindTokens(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument,
  contexts: Record<string, string>,
  budget: ResolverWorkBudget
): TypedFlatToken[] {
  return flattenTypedTokensWithBudget(
    applyResolverWithBudget(files, resolver, contexts, budget),
    budget,
    {
      maxItems: MAX_TAILWIND_ITEMS,
      itemLimitMessage: 'Tailwind output can read at most 100,000 items.',
      sort: true,
    }
  )
}

function tailwindNamespaceClaims(
  flat: readonly TypedFlatToken[],
  budget: ResolverWorkBudget
): Map<string, TailwindNamespace | null> {
  chargeResolverWork(budget, flat.length)
  const claims = new Map<string, TailwindNamespace | null>()
  for (const { path, type } of flat) {
    chargeTailwindText(path, budget)
    claims.set(path, tailwindNamespace(path, type))
  }
  return claims
}

function assertStableTailwindNamespaces(
  defaults: ReadonlyMap<string, TailwindNamespace | null>,
  selected: ReadonlyMap<string, TailwindNamespace | null>,
  budget: ResolverWorkBudget
): void {
  chargeResolverWork(budget, defaults.size + selected.size)
  for (const [path, namespace] of defaults) {
    if (namespace !== null && selected.get(path) !== namespace) {
      throw new DTCGOutputCapabilityError(
        'tailwind',
        path,
        namespace,
        'tailwind-namespace'
      )
    }
  }
  for (const [path, namespace] of selected) {
    if (namespace !== null && defaults.get(path) !== namespace) {
      throw new DTCGOutputCapabilityError(
        'tailwind',
        path,
        namespace,
        'tailwind-namespace'
      )
    }
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0xfffd
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code <= 0xffff) {
      bytes += 3
    } else {
      bytes += 4
    }
  }
  return bytes
}

interface TailwindOutputState {
  bytes: number
}

function appendTailwindLine(
  lines: string[],
  output: TailwindOutputState,
  budget: ResolverWorkBudget,
  line: string
): void {
  chargeTailwindText(line, budget)
  const addedBytes = utf8ByteLength(line) + (lines.length === 0 ? 0 : 1)
  if (output.bytes + addedBytes > MAX_TAILWIND_OUTPUT_BYTES) {
    throw new TypeError(TAILWIND_OUTPUT_LIMIT_MESSAGE)
  }
  output.bytes += addedBytes
  lines.push(line)
}

function hasTailwindName(
  used: Set<string>,
  name: string,
  budget: ResolverWorkBudget
): boolean {
  chargeTailwindText(name, budget)
  return used.has(name)
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
 * The emitter skips types without a Tailwind namespace. A token path must map
 * to the same namespace in every Resolver context where Tailwind reads it.
 *
 * One call evaluates at most 1,000 active-context permutations, reads at most
 * 64 token-group levels and 100,000 items per context, and returns at most
 * 20 MiB. Its 1,000,000-unit work limit counts active Resolver contexts, token
 * merges, token walking, alias type resolution, namespace checks, token paths,
 * name allocation, and output text.
 *
 * @param files - Token files keyed by their path from the Resolver file.
 * @param resolver - Resolver that selects files and default contexts.
 * @returns Tailwind CSS v4 theme variables linked to generated CSS variables.
 *
 * @throws `TypeError` - A call exceeds 1,000 active-context permutations,
 * 1,000,000 work units, 64 token-group levels, 100,000 items per context, or
 * 20 MiB of output.
 * @throws {@link DTCGOutputCapabilityError} - A token path changes Tailwind
 * namespace or disappears between Resolver contexts.
 * @throws `Error` - Two emitted token paths map to the same CSS custom property
 * name.
 *
 * @public
 */
export function emitTailwind(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument
): string {
  const budget: ResolverWorkBudget = {
    remaining: MAX_TAILWIND_WORK,
    errorMessage: TAILWIND_WORK_LIMIT_MESSAGE,
    maxDepth: MAX_TAILWIND_GROUP_DEPTH,
    depthErrorMessage: TAILWIND_DEPTH_LIMIT_MESSAGE,
  }
  const flat = readTailwindTokens(files, resolver, {}, budget)
  const defaultNamespaces = tailwindNamespaceClaims(flat, budget)
  const contextStates = readResolutionContextStatesWithBudget(resolver, budget)
  for (const selection of contextStates.permutations) {
    const selectedEntries = Object.entries(selection)
    chargeResolverWork(budget, selectedEntries.length)
    if (
      selectedEntries.every(
        ([axis, context]) => contextStates.defaultSelection[axis] === context
      )
    ) {
      continue
    }
    const selected = readTailwindTokens(files, resolver, selection, budget)
    assertStableTailwindNamespaces(
      defaultNamespaces,
      tailwindNamespaceClaims(selected, budget),
      budget
    )
  }
  const cssNames = new Map<string, string>()
  const used = new Set<string>()
  const nextSuffix = new Map<string, number>()
  const lines: string[] = []
  const output: TailwindOutputState = { bytes: 0 }
  for (const line of [
    '/* @primitree/dtcg output for Tailwind CSS v4.',
    '   Import tokens.css BEFORE this file so the referenced variables exist:',
    "     @import './tokens.css';",
    "     @import './tokens.tailwind.css';  */",
    '',
    '@theme inline {',
  ]) {
    appendTailwindLine(lines, output, budget, line)
  }

  for (const { path } of flat) {
    chargeTailwindText(path, budget)
    const namespace = defaultNamespaces.get(path) ?? null
    if (namespace === null) {
      continue
    }
    const cssName = claimCssVarName(cssNames, path)
    let name = `--${namespace}-${tailwindName(path, namespace, budget)}`
    if (hasTailwindName(used, name, budget)) {
      chargeTailwindText(path, budget)
      const collection = path.split('.')[0] ?? 'tokens'
      chargeTailwindText(collection, budget)
      name =
        `--${namespace}-${cssVarName(collection).slice(2)}-` +
        tailwindName(path, namespace, budget)
    }
    if (hasTailwindName(used, name, budget)) {
      const base = name
      chargeTailwindText(base, budget)
      let suffix = nextSuffix.get(base) ?? 2
      while (hasTailwindName(used, `${base}-${suffix}`, budget)) {
        suffix += 1
      }
      name = `${base}-${suffix}`
      nextSuffix.set(base, suffix + 1)
    }
    chargeTailwindText(name, budget)
    used.add(name)
    appendTailwindLine(lines, output, budget, `  ${name}: var(${cssName});`)
  }

  appendTailwindLine(lines, output, budget, '}')
  appendTailwindLine(lines, output, budget, '')
  return lines.join('\n')
}
