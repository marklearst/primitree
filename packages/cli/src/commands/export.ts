import fs from 'node:fs/promises'
import path from 'node:path'
import {
  fetcher,
  FIGMA_LOCAL_VARIABLES_ENDPOINT,
  type LocalVariablesResponse,
} from '@figma-vars/core'
import { getStringFlag, type ParsedArgs } from '../args'

export const exportHelp = `
figma-vars export — download Figma variables as JSON

Usage:
  figma-vars export --file-key <FILE_KEY> [--out <OUTPUT_PATH>]

Options:
  --file-key, --fileKey   Figma file key (or set FIGMA_FILE_KEY)
  --out                   Output file path (default: figma-variables.json)

Environment:
  FIGMA_TOKEN or FIGMA_PAT   Figma Personal Access Token (required)
  FIGMA_FILE_KEY             Figma file key (alternative to --file-key)

Notes:
  Live variable export requires a Figma Enterprise seat with the
  file_variables:read scope. On other plans, export your variables JSON
  with a plugin (e.g. TokensBrücke) and feed it to 'figma-vars build'.
`

export async function runExport(args: ParsedArgs): Promise<void> {
  const token = process.env.FIGMA_TOKEN || process.env.FIGMA_PAT
  const fileKey =
    getStringFlag(args.flags, 'file-key', 'fileKey') ||
    process.env.FIGMA_FILE_KEY
  const out = getStringFlag(args.flags, 'out') || 'figma-variables.json'

  if (!token) {
    throw new Error('FIGMA_TOKEN (or FIGMA_PAT) is required')
  }
  if (!fileKey) {
    throw new Error('--file-key or FIGMA_FILE_KEY is required')
  }

  const data = await fetcher<LocalVariablesResponse>(
    FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey),
    token
  )

  const outputPath = path.resolve(out)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

  console.log(`Saved variables to ${outputPath}`)
  const variableCount = Object.keys(data.meta?.variables ?? {}).length
  const collectionCount = Object.keys(
    data.meta?.variableCollections ?? {}
  ).length
  console.log(`Collections: ${collectionCount}, variables: ${variableCount}`)
}
