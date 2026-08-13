import fs from 'node:fs/promises'
import path from 'node:path'
import {
  normalizeVariables,
  resolveAllVariableValues,
  VariablesParseError,
} from '@primitree/core'
import { createPolicy, evaluatePolicy } from '@primitree/core/policy'
import { validateResolverContexts } from '@primitree/dtcg'
import { type ParsedArgs } from '../args'
import { loadConfiguredSourceGraph } from '../config/source'
import {
  isMissingCheckSourcePath,
  loadBuiltTokenSource,
  loadVariablesCheckSource,
} from '../token-source'

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export const checkHelp = `
primitree check: check one configured DTCG source, Figma export, or built token directory

Usage:
  primitree check                      Check a DTCG source from
                                        ./primitree.config.ts.
  primitree check --config <path>      Use one exact config file.
  primitree check --source <name>      Select a named source.
  primitree check --format text|json   Set the report format.
  primitree check <variables.json>     Validate a Figma variables export:
                                        shape, alias graph (cycles, dangling
                                        targets), per-mode resolvability.
  primitree check <tokens-dir>         Validate a generated pipeline (a
                                        directory containing
                                        tokens.resolver.json): each context
                                        permutation must merge and each
                                        reference must resolve.

Exit codes:
  0  valid
  1  problems found
  2  command, config, or input error
`

interface CheckReport {
  errors: string[]
  warnings: string[]
}

const CONFIG_CHECK_FLAGS = new Set(['config', 'source', 'format'])

async function runConfiguredCheck(args: ParsedArgs): Promise<void> {
  if (args.positionals.length > 0) {
    throw new Error('Config-backed check does not accept a path argument.')
  }
  for (const flag of Object.keys(args.flags)) {
    if (!CONFIG_CHECK_FLAGS.has(flag)) {
      throw new Error(`Unknown option: --${flag}`)
    }
  }
  const format = args.flags.format ?? 'text'
  if (format !== 'text' && format !== 'json') {
    throw new Error('--format must be "text" or "json".')
  }
  const configFlag = args.flags.config
  if (configFlag === true) {
    throw new Error('--config needs a file path.')
  }
  const sourceFlag = args.flags.source
  if (sourceFlag === true) {
    throw new Error('--source needs a source name.')
  }

  const configured = await loadConfiguredSourceGraph({
    ...(typeof configFlag === 'string' ? { configPath: configFlag } : {}),
    ...(typeof sourceFlag === 'string' ? { sourceName: sourceFlag } : {}),
  })
  const { sourceName, source, graph, view } = configured
  const policy = createPolicy({
    id: sourceName,
    viewId: sourceName,
    layers: source.architecture.layers,
    ownership: source.ownership,
  })
  if (!policy.ok) {
    throw new Error(policy.diagnostics.map(item => item.message).join('\n'))
  }
  const report = evaluatePolicy({ graph, view }, policy.value)
  if (!report.ok) {
    throw new Error(report.diagnostics.map(item => item.message).join('\n'))
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        command: 'check',
        source: sourceName,
        findings: report.value.findings,
        summary: report.value.summary,
      })
    )
  } else if (report.value.findings.length === 0) {
    console.log(
      `Check passed for source "${sourceName}" with ${formatCount(graph.tokens.length, 'token')}.`
    )
  } else {
    for (const finding of report.value.findings) {
      console.error(
        `${finding.ruleId} ${finding.path.join('.')}: ${finding.message}`
      )
    }
    console.error(
      `Check found ${formatCount(report.value.summary.active, 'active finding')} for source "${sourceName}".`
    )
  }
  if (report.value.summary.active > 0) {
    process.exitCode = 1
  }
}

async function checkVariablesFile(filePath: string): Promise<CheckReport> {
  const report: CheckReport = { errors: [], warnings: [] }
  let json: unknown
  try {
    json = await loadVariablesCheckSource(filePath)
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
  const { files, resolver, origin } = await loadBuiltTokenSource(dir)
  if (resolver.version !== '2025.10') {
    report.errors.push(
      `Resolver version: expected "2025.10", received "${String(resolver.version)}"`
    )
    return report
  }

  if (Object.keys(files).length === 0) {
    report.errors.push(`${origin} contains no *.tokens.json files`)
    return report
  }

  for (const result of validateResolverContexts(files, resolver)) {
    const label =
      Object.keys(result.contexts).length > 0
        ? Object.entries(result.contexts)
            .map(([axis, context]) => `${axis}=${context}`)
            .join(', ')
        : 'default'
    if (!result.ok) {
      report.errors.push(`Context (${label}): ${result.error.message}`)
      continue
    }
    for (const tokenPath of result.untypedTokenPaths) {
      report.warnings.push(
        `Token "${tokenPath}" has no $type (context: ${label})`
      )
    }
  }
  return report
}

export async function runCheck(args: ParsedArgs): Promise<void> {
  const target = args.positionals[0]
  if (args.duplicateFlags.length > 0) {
    throw new Error(`Duplicate option: --${args.duplicateFlags[0]}`)
  }
  if (target === undefined || args.flags.config !== undefined) {
    await runConfiguredCheck(args)
    return
  }
  if (target.length === 0) {
    throw new Error('The path form needs a file or directory.')
  }
  if (args.positionals.length > 1) {
    throw new Error('The path form accepts one file or directory.')
  }
  const legacyFlag = Object.keys(args.flags)[0]
  if (legacyFlag !== undefined) {
    throw new Error(`Unknown option for the path form: --${legacyFlag}`)
  }

  const resolved = path.resolve(target)
  const stat = await fs.lstat(resolved).catch(error => {
    if (!isMissingCheckSourcePath(error)) {
      throw error
    }
    return null
  })
  if (!stat) {
    throw new Error(`Path does not exist: ${resolved}`)
  }

  let report: CheckReport
  if (stat.isDirectory()) {
    report = await checkTokensDirectory(resolved)
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
