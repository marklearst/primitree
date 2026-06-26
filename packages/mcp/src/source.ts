import fs from 'node:fs/promises'
import path from 'node:path'
import {
  toDTCG,
  type DTCGDocument,
  type ResolverDocument,
} from '@figmavars/dtcg'

/** Token files, Resolver, and origin used by the MCP tools. @public */
export interface TokenSource {
  /** DTCG token documents keyed by file name. */
  files: Record<string, DTCGDocument>
  /** The resolver describing contexts. */
  resolver: ResolverDocument
  /** File or directory used to load the source. */
  origin: string
  /** Source variables JSON, present when loaded from an export. */
  variablesJson?: unknown
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Load a token source from a Figma variables file or built token directory.
 *
 * - A Figma variables export (`variables.json`), converted in memory.
 * - a directory containing `tokens.resolver.json` + `*.tokens.json`
 *   (the `tokens/` output of `figma-vars build`), or a directory whose
 *   `tokens/` subdirectory contains them.
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
        `No tokens.resolver.json found in ${resolved} (or its tokens/ subdirectory). ` +
          'Point --tokens at a Figma variables export or a figma-vars build output.'
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
