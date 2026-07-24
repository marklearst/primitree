import fs from 'node:fs/promises'
import path from 'node:path'
import {
  normalizeVariables,
  resolveAllVariableValues,
  VariablesParseError,
} from '@figmavars/core'
import {
  applyResolver,
  flattenTokens,
  listPermutations,
  resolveTokenValues,
  isToken,
  type DTCGDocument,
  type ResolverDocument,
} from '@figmavars/dtcg'
import { type ParsedArgs } from '../args'
import { fileExists, readJsonFile } from '../io'

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export const checkHelp = `
figma-vars check: validate an export or built token directory

Usage:
  figma-vars check <variables.json>     Validate a Figma variables export:
                                        shape, alias graph (cycles, dangling
                                        targets), per-mode resolvability.
  figma-vars check <tokens-dir>         Validate a generated pipeline (a
                                        directory containing
                                        tokens.resolver.json): each context
                                        permutation must merge and each
                                        reference must resolve.

Exit codes:
  0  valid
  1  problems found
`

interface CheckReport {
  errors: string[]
  warnings: string[]
}

async function checkVariablesFile(filePath: string): Promise<CheckReport> {
  const report: CheckReport = { errors: [], warnings: [] }
  let json: unknown
  try {
    json = await readJsonFile(filePath)
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err))
    return report
  }
  try {
    const normalized = normalizeVariables(json)
    report.warnings.push(...normalized.warnings)
    const { errors } = resolveAllVariableValues(normalized)
    for (const error of errors) {
      report.errors.push(`${error.code}: ${error.message}`)
    }
    if (normalized.variables.length === 0) {
      report.warnings.push('Export contains no variables')
    }
  } catch (err) {
    if (err instanceof VariablesParseError) {
      report.errors.push(err.message)
    } else {
      throw err
    }
  }
  return report
}

async function checkTokensDirectory(dir: string): Promise<CheckReport> {
  const report: CheckReport = { errors: [], warnings: [] }
  const resolverPath = path.join(dir, 'tokens.resolver.json')
  const resolver = (await readJsonFile(resolverPath)) as ResolverDocument
  if (resolver.version !== '2025.10') {
    report.errors.push(
      `Resolver version must be "2025.10", found "${String(resolver.version)}"`
    )
    return report
  }

  const files: Record<string, DTCGDocument> = {}
  const entries = await fs.readdir(dir)
  for (const entry of entries) {
    if (entry.endsWith('.tokens.json')) {
      files[entry] = (await readJsonFile(path.join(dir, entry))) as DTCGDocument
    }
  }
  if (Object.keys(files).length === 0) {
    report.errors.push(`No *.tokens.json files found in ${dir}`)
    return report
  }

  for (const permutation of listPermutations(resolver)) {
    const label =
      Object.keys(permutation).length > 0
        ? Object.entries(permutation)
            .map(([axis, context]) => `${axis}=${context}`)
            .join(', ')
        : 'default'
    try {
      const merged = applyResolver(files, resolver, permutation)
      const flat = flattenTokens(merged)
      resolveTokenValues(flat)
      for (const { path: tokenPath, token } of flat) {
        if (!isToken(token)) {
          continue
        }
        if (token.$type === undefined) {
          report.warnings.push(
            `Token "${tokenPath}" has no $type (context: ${label})`
          )
        }
      }
    } catch (err) {
      report.errors.push(
        `Context (${label}): ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  return report
}

export async function runCheck(args: ParsedArgs): Promise<void> {
  const target = args.positionals[0]
  if (!target) {
    throw new Error('Usage: figma-vars check <variables.json | tokens-dir>')
  }

  const resolved = path.resolve(target)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) {
    throw new Error(`Path does not exist: ${resolved}`)
  }

  let report: CheckReport
  if (stat.isDirectory()) {
    const hasResolver = await fileExists(
      path.join(resolved, 'tokens.resolver.json')
    )
    const nested = path.join(resolved, 'tokens')
    if (
      !hasResolver &&
      (await fileExists(path.join(nested, 'tokens.resolver.json')))
    ) {
      report = await checkTokensDirectory(nested)
    } else {
      report = await checkTokensDirectory(resolved)
    }
  } else {
    report = await checkVariablesFile(resolved)
  }

  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`)
  }
  for (const error of report.errors) {
    console.error(`error: ${error}`)
  }

  if (report.errors.length > 0) {
    console.error(
      `\nCheck failed: ${formatCount(report.errors.length, 'error')}, ` +
        `${formatCount(report.warnings.length, 'warning')}.`
    )
    process.exitCode = 1
  } else {
    console.log(
      `Check passed${
        report.warnings.length > 0
          ? ` with ${formatCount(report.warnings.length, 'warning')}`
          : ''
      }.`
    )
  }
}
