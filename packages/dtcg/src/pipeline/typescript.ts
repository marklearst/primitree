import type { DTCGDocument, ResolverDocument } from '../types'
import { applyResolver, flattenTokens, resolveTokenValues } from '../resolve'
import { cssVarName, cssValue } from './css'

function stringLiteral(value: string): string {
  return JSON.stringify(value)
}

/**
 * Emit a typed TypeScript module for the generated tokens: a `TokenPath`
 * union, a map of CSS `var()` accessors, and the resolved default-context
 * values.
 *
 * @public
 */
export function emitTypescript(
  files: Record<string, DTCGDocument>,
  resolver: ResolverDocument
): string {
  const merged = applyResolver(files, resolver)
  const flat = flattenTokens(merged)
  const resolved = resolveTokenValues(flat)

  const paths = flat.map(f => f.path).sort()

  const lines: string[] = [
    '/**',
    ' * @primitree/cli TypeScript output from the source variables.',
    ' * Each modifier axis uses its default context.',
    ' */',
    '',
    paths.length === 0
      ? 'export type TokenPath = never'
      : 'export type TokenPath =',
  ]
  for (const path of paths) {
    lines.push(`  | ${stringLiteral(path)}`)
  }
  lines.push('')

  lines.push('/** CSS variable references for each token path. */')
  lines.push('export const tokenVars = {')
  for (const path of paths) {
    lines.push(
      `  [${stringLiteral(path)}]: ${stringLiteral(`var(${cssVarName(path)})`)},`
    )
  }
  lines.push('} as const satisfies Record<TokenPath, string>')
  lines.push('')

  lines.push('/** Values resolved for the default contexts. */')
  lines.push('export const tokenValues = {')
  for (const path of paths) {
    const value = resolved.get(path)
    const css = value === undefined ? null : cssValue(value)
    const literal = css === null ? JSON.stringify(value) : stringLiteral(css)
    lines.push(`  [${stringLiteral(path)}]: ${literal},`)
  }
  lines.push('} as const')
  lines.push('')

  return lines.join('\n')
}
