import fs from 'node:fs/promises'
import path from 'node:path'
import {
  toDTCG,
  type DTCGDocument,
  type ResolverDocument,
} from '@primitree/dtcg'

/** Token source for the MCP tools. @public */
export interface TokenSource {
  /** File-name map of DTCG token documents. */
  files: Record<string, DTCGDocument>
  /** The resolver describing contexts. */
  resolver: ResolverDocument
  /** Source file or directory path. */
  origin: string
  /** Variables JSON from a Figma export. */
  variablesJson?: unknown
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Load a Figma variables file or built token directory.
 *
 * The loader converts a Figma variables export (`variables.json`) in memory.
 * It reads `tokens.resolver.json` and `*.tokens.json` from a directory or its
 * `tokens/` subdirectory.
 *
 * @public
 */
export async function loadTokenSource(
  sourcePath: string
): Promise<TokenSource> {
  const resolved = path.resolve(sourcePath)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) {
    throw new Error(`Token source does not exist: ${resolved}`)
  }

  if (stat.isFile()) {
    const variablesJson = await readJson(resolved)
    const { files, resolver } = toDTCG(variablesJson)
    return { files, resolver, origin: resolved, variablesJson }
  }

  let dir = resolved
  const hasResolver = async (d: string) =>
    fs
      .stat(path.join(d, 'tokens.resolver.json'))
      .then(() => true)
      .catch(() => false)

  if (!(await hasResolver(dir))) {
    const nested = path.join(dir, 'tokens')
    if (await hasResolver(nested)) {
      dir = nested
    } else {
      throw new Error(
        `${resolved} contains no tokens.resolver.json in its root or tokens/ directory. ` +
          'Point --tokens at a Figma variables export or a primitree build output.'
      )
    }
  }

  const resolver = (await readJson(
    path.join(dir, 'tokens.resolver.json')
  )) as ResolverDocument
  const files: Record<string, DTCGDocument> = {}
  for (const entry of await fs.readdir(dir)) {
    if (entry.endsWith('.tokens.json')) {
      files[entry] = (await readJson(path.join(dir, entry))) as DTCGDocument
    }
  }
  return { files, resolver, origin: dir }
}
