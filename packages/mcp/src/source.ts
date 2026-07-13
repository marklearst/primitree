import fs from 'node:fs/promises'
import path from 'node:path'
import {
  toDTCG,
  type DTCGDocument,
  type ResolverDocument,
} from '@figmavars/dtcg'

/** An in-memory token source the MCP tools operate on. @public */
export interface TokenSource {
  /** DTCG token documents keyed by file name. */
  files: Record<string, DTCGDocument>
  /** The resolver describing contexts. */
  resolver: ResolverDocument
  /** Where the source was loaded from. */
  origin: string
  /** Raw variables JSON when the source was a Figma export (enables diffing). */
  variablesJson?: unknown
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Load a token source from disk. Accepts either:
 *
 * - a Figma variables export (`variables.json`), converted in-memory, or
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
