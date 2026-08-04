import {
  getDependents,
  inspectToken,
  type JsonValue,
  type TokenId,
} from '@primitree/core'
import { type ParsedArgs } from '../args'
import { loadConfiguredSourceGraph } from '../config/source'

const INSPECT_FLAGS = new Set(['config', 'source', 'format'])

export const inspectHelp = `
primitree inspect: explain one token from a configured DTCG source

Usage:
  primitree inspect <token.path> [--config <path>] [--source <name>]
                                    [--format text|json]

Exit codes:
  0  token found
  2  command, config, or input error
`

function resultError(result: {
  readonly diagnostics: readonly { readonly message: string }[]
}): Error {
  return new Error(result.diagnostics.map(item => item.message).join('\n'))
}

function displayValue(value: JsonValue): string {
  return JSON.stringify(value)
}

export async function runInspect(args: ParsedArgs): Promise<void> {
  if (args.duplicateFlags.length > 0) {
    throw new Error(`Duplicate option: --${args.duplicateFlags[0]}`)
  }
  if (args.positionals.length !== 1 || args.positionals[0]!.length === 0) {
    throw new Error('Inspect needs one token path.')
  }
  for (const flag of Object.keys(args.flags)) {
    if (!INSPECT_FLAGS.has(flag)) throw new Error(`Unknown option: --${flag}`)
  }
  const format = args.flags['format'] ?? 'text'
  if (format !== 'text' && format !== 'json') {
    throw new Error('--format must be "text" or "json".')
  }
  const configFlag = args.flags['config']
  if (configFlag === true) throw new Error('--config needs a file path.')
  const sourceFlag = args.flags['source']
  if (sourceFlag === true) throw new Error('--source needs a source name.')
  const tokenPath = args.positionals[0]!.split('.')
  if (tokenPath.some(segment => segment.length === 0)) {
    throw new Error('Token path segments cannot be empty.')
  }

  const configured = await loadConfiguredSourceGraph({
    ...(typeof configFlag === 'string' ? { configPath: configFlag } : {}),
    ...(typeof sourceFlag === 'string' ? { sourceName: sourceFlag } : {}),
  })
  const inspection = inspectToken(
    { graph: configured.graph, view: configured.view },
    { kind: 'path', path: tokenPath }
  )
  if (!inspection.ok) throw resultError(inspection)
  const dependents = getDependents(configured.graph, inspection.value.tokenId)
  if (!dependents.ok) throw resultError(dependents)

  const paths = new Map(
    configured.view.tokens.map(token => [token.tokenId, token.path])
  )
  const describeToken = (tokenId: TokenId) =>
    Object.freeze({ id: tokenId, path: paths.get(tokenId)! })
  const root = inspection.value.path[0]
  const owners =
    root === undefined
      ? configured.source.ownership.default
      : (configured.source.ownership.paths[root] ??
        configured.source.ownership.default)
  const aliasChain =
    inspection.value.resolution.referenceChain.map(describeToken)
  const directDependents = dependents.value.map(describeToken)

  if (format === 'json') {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        command: 'inspect',
        source: configured.sourceName,
        token: {
          id: inspection.value.tokenId,
          path: inspection.value.path,
          type: inspection.value.token.type,
          provenance: inspection.value.token.provenance,
        },
        resolvedValue: inspection.value.resolution.value,
        aliasChain,
        owners,
        directDependents,
      })
    )
    return
  }

  console.log(`Token: ${inspection.value.path.join('.')}`)
  console.log(`ID: ${inspection.value.tokenId}`)
  console.log(`Source: ${configured.sourceName}`)
  console.log(`Type: ${inspection.value.token.type}`)
  console.log(`Value: ${displayValue(inspection.value.resolution.value)}`)
  console.log(
    `Alias chain: ${aliasChain.map(item => item.path.join('.')).join(' -> ')}`
  )
  console.log(`Owners: ${owners.length === 0 ? 'none' : owners.join(', ')}`)
  console.log(
    `Direct dependents: ${directDependents.length === 0 ? 'none' : directDependents.map(item => item.path.join('.')).join(', ')}`
  )
  for (const item of inspection.value.token.provenance) {
    console.log(`Source file: ${item.uri ?? 'unknown'}`)
    console.log(`Token pointer: ${item.pointer ?? 'unknown'}`)
  }
}
