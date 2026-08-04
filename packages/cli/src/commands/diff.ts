import fs from 'node:fs/promises'
import path from 'node:path'
import {
  diffGraphViews,
  diffVariables,
  formatDiffMarkdown,
  type TokenId,
} from '@primitree/core'
import { createPolicy, evaluatePolicy } from '@primitree/core/policy'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import {
  buildConfiguredSourceGraph,
  loadConfiguredSource,
} from '../config/source'
import { readJsonFile } from '../io'

export const diffHelp = `
primitree diff: compare two configured DTCG files or Figma variables exports

The configured form reports token changes, affected tokens, and policy finding
changes. The older form matches stable Figma IDs.

Usage:
  primitree diff <before.tokens.json> <after.tokens.json> --config <path>
                  [--source <name>] [--format text|json]
  primitree diff <old.json> <new.json> [options]

Options:
  --config <path>        Read DTCG rules from this config file
  --source <name>        Select one configured DTCG source
  --format text|json     Set the configured report format
  --json                 Output the raw diff as JSON instead of Markdown
  --out <file>           Write output to a file instead of stdout
  --fail-on-breaking     Exit with code 2 after finding breaking changes

Examples:
  primitree diff backup/variables.json variables.json
  primitree diff old.json new.json --fail-on-breaking   # CI gate
`

const CONFIG_DIFF_FLAGS = new Set(['config', 'source', 'format'])

function resultError(result: {
  readonly diagnostics: readonly { readonly message: string }[]
}): Error {
  return new Error(result.diagnostics.map(item => item.message).join('\n'))
}

async function runConfiguredDiff(args: ParsedArgs): Promise<void> {
  if (args.duplicateFlags.length > 0) {
    throw new Error(`Duplicate option: --${args.duplicateFlags[0]}`)
  }
  if (
    args.positionals.length !== 2 ||
    args.positionals.some(item => item.length === 0)
  ) {
    throw new Error('Configured diff needs before and after token files.')
  }
  for (const flag of Object.keys(args.flags)) {
    if (!CONFIG_DIFF_FLAGS.has(flag))
      throw new Error(`Unknown option: --${flag}`)
  }
  const format = args.flags['format'] ?? 'text'
  if (format !== 'text' && format !== 'json') {
    throw new Error('--format must be "text" or "json".')
  }
  const configFlag = args.flags['config']
  if (configFlag === true) throw new Error('--config needs a file path.')
  const sourceFlag = args.flags['source']
  if (sourceFlag === true) throw new Error('--source needs a source name.')

  const configured = await loadConfiguredSource({
    ...(typeof configFlag === 'string' ? { configPath: configFlag } : {}),
    ...(typeof sourceFlag === 'string' ? { sourceName: sourceFlag } : {}),
  })
  const [before, after] = await Promise.all([
    buildConfiguredSourceGraph(configured, {
      file: path.resolve(args.positionals[0]!),
      label: 'before token file',
      provenanceFile: configured.source.file,
    }),
    buildConfiguredSourceGraph(configured, {
      file: path.resolve(args.positionals[1]!),
      label: 'after token file',
      provenanceFile: configured.source.file,
    }),
  ])
  const graphDiff = diffGraphViews(
    { graph: before.graph, view: before.view },
    { graph: after.graph, view: after.view }
  )
  if (!graphDiff.ok) throw resultError(graphDiff)
  const policy = createPolicy({
    id: configured.sourceName,
    viewId: configured.sourceName,
    layers: configured.source.architecture.layers,
    ownership: configured.source.ownership,
  })
  if (!policy.ok) throw resultError(policy)
  const beforeReport = evaluatePolicy(
    { graph: before.graph, view: before.view },
    policy.value
  )
  const afterReport = evaluatePolicy(
    { graph: after.graph, view: after.view },
    policy.value
  )
  if (!beforeReport.ok) throw resultError(beforeReport)
  if (!afterReport.ok) throw resultError(afterReport)

  const beforePaths = new Map(
    before.view.tokens.map(token => [token.tokenId, token.path])
  )
  const afterPaths = new Map(
    after.view.tokens.map(token => [token.tokenId, token.path])
  )
  const describeToken = (tokenId: TokenId, preferBefore = false) => ({
    id: tokenId,
    path: preferBefore
      ? beforePaths.get(tokenId)!
      : (afterPaths.get(tokenId) ?? beforePaths.get(tokenId)!),
  })
  const changes = graphDiff.value.changes.map(change => ({
    kind: change.kind,
    token: describeToken(change.tokenId, change.kind === 'removed'),
    impacted: change.impactedTokenIds.map(tokenId =>
      describeToken(tokenId, change.kind === 'removed')
    ),
  }))
  const beforeFindingIds = new Set(
    beforeReport.value.findings.map(finding => finding.findingId)
  )
  const afterFindingIds = new Set(
    afterReport.value.findings.map(finding => finding.findingId)
  )
  const describeFinding = (
    finding: (typeof beforeReport.value.findings)[number]
  ) => ({
    ruleId: finding.ruleId,
    path: finding.path,
    message: finding.message,
    owners: finding.owners,
  })
  const addedFindings = afterReport.value.findings
    .filter(finding => !beforeFindingIds.has(finding.findingId))
    .map(describeFinding)
  const resolvedFindings = beforeReport.value.findings
    .filter(finding => !afterFindingIds.has(finding.findingId))
    .map(describeFinding)

  if (format === 'json') {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        command: 'diff',
        source: configured.sourceName,
        changes,
        findings: { added: addedFindings, resolved: resolvedFindings },
      })
    )
  } else {
    console.log(
      `Diff found ${changes.length} token ${changes.length === 1 ? 'change' : 'changes'}.`
    )
    for (const change of changes) {
      console.log(`${change.kind} ${change.token.path.join('.')}`)
      console.log(
        `  Affected tokens: ${change.impacted.length === 0 ? 'none' : change.impacted.map(item => item.path.join('.')).join(', ')}`
      )
    }
    console.log(`New findings: ${addedFindings.length}`)
    console.log(`Resolved findings: ${resolvedFindings.length}`)
  }
  if (afterReport.value.summary.active > 0) process.exitCode = 1
}

export async function runDiff(args: ParsedArgs): Promise<void> {
  if (
    args.flags['config'] !== undefined ||
    args.flags['source'] !== undefined ||
    args.flags['format'] !== undefined
  ) {
    await runConfiguredDiff(args)
    return
  }
  const [oldPath, newPath] = args.positionals
  if (!oldPath || !newPath) {
    throw new Error('Usage: primitree diff <old.json> <new.json>')
  }

  const [oldJson, newJson] = await Promise.all([
    readJsonFile(oldPath),
    readJsonFile(newPath),
  ])
  const diff = diffVariables(oldJson, newJson)

  const output = getBooleanFlag(args.flags, 'json')
    ? `${JSON.stringify(diff, null, 2)}\n`
    : formatDiffMarkdown(diff)

  const outFile = getStringFlag(args.flags, 'out')
  if (outFile) {
    const target = path.resolve(outFile)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, output, 'utf8')
    console.log(`Wrote diff to ${target}`)
  } else {
    console.log(output)
  }

  if (diff.breaking && getBooleanFlag(args.flags, 'fail-on-breaking')) {
    process.exitCode = 2
  }
}
