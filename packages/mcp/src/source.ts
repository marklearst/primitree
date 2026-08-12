import type { BigIntStats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  toDTCG,
  type DTCGDocument,
  type ResolverDocument,
} from '@primitree/dtcg'
import {
  compareText,
  readTokenFiles,
  validateTokenFilePaths,
  verifyTokenDirectories,
  type ScannedTokenDirectory,
} from './source-directory'
import {
  MAX_TOKEN_JSON_BYTES,
  fileReadIdentity,
  inspectSelectedRoot,
  isMissingPathError,
  readJson,
  sameDirectory,
  verifyReadFile,
  type DirectoryIdentity,
  type FileReadIdentity,
  type TokenScanBudget,
} from './source-filesystem'

/** Token source for the MCP tools. @public */
export interface TokenSource {
  /** DTCG token documents keyed by slash-separated path relative to `tokens.resolver.json`. */
  files: Record<string, DTCGDocument>
  /** The resolver describing contexts. */
  resolver: ResolverDocument
  /** Source file or directory path. */
  origin: string
  /** Variables JSON from a Figma export. */
  variablesJson?: unknown
}

/**
 * Load a Figma variables file or token directory.
 *
 * The loader converts a Figma variables export (`variables.json`) in memory.
 * For a directory, it reads `tokens.resolver.json` from the root or `tokens/`
 * and loads root-level and nested `*.tokens.json` files. Returned file keys use
 * slash-separated paths relative to `tokens.resolver.json`.
 *
 * A directory scan accepts up to 64 nested directory levels, 100,000 entries,
 * and 1,000 token files. Each JSON file may contain up to 20 MiB, and all JSON
 * files together may contain up to 256 MiB.
 *
 * @param sourcePath - Path to a Figma variables file or token directory.
 * @returns The loaded token source.
 * @throws `Error` - The source is missing, uses a symbolic link, contains an
 * unsupported file-system entry, or changes during loading.
 * @throws `Error` - The loader cannot read or parse a JSON file, or the source
 * exceeds a scan or size limit.
 * @throws `Error` - A Figma variables document has an unsupported shape.
 * @throws `Error` - A token directory contains unsafe or colliding token file
 * paths.
 *
 * @public
 */
export async function loadTokenSource(
  sourcePath: string
): Promise<TokenSource> {
  const resolved = path.resolve(sourcePath)
  let stat: BigIntStats | null
  try {
    stat = await fs.lstat(resolved, { bigint: true })
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error
    }
    stat = null
  }
  if (!stat) {
    throw new Error(`Token source does not exist: ${resolved}`)
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Token source cannot use a symbolic link: ${resolved}`)
  }

  if (stat.isFile()) {
    const variablesRead = await readJson(
      resolved,
      path.basename(resolved),
      undefined,
      undefined,
      fileReadIdentity(stat)
    )
    const variablesJson = variablesRead.value
    const { files, resolver } = toDTCG(variablesJson)
    await verifyReadFile(
      resolved,
      path.basename(resolved),
      variablesRead.identity
    )
    return { files, resolver, origin: resolved, variablesJson }
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Token source path is not a regular file or directory: ${resolved}`
    )
  }

  let dir = resolved
  const resolverDirectoryStats = async (
    d: string
  ): Promise<BigIntStats | null> => {
    let directoryStats: BigIntStats
    try {
      directoryStats = await fs.lstat(d, { bigint: true })
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error
      }
      return null
    }
    if (directoryStats.isSymbolicLink()) {
      throw new Error(`Token source cannot use a symbolic link: ${d}`)
    }
    if (!directoryStats.isDirectory()) {
      return null
    }
    try {
      await fs.lstat(path.join(d, 'tokens.resolver.json'), { bigint: true })
      return directoryStats
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error
      }
      return null
    }
  }

  let selectedDirectoryStats = await resolverDirectoryStats(dir)
  if (selectedDirectoryStats === null) {
    const nested = path.join(dir, 'tokens')
    const nestedDirectoryStats = await resolverDirectoryStats(nested)
    if (nestedDirectoryStats !== null) {
      dir = nested
      selectedDirectoryStats = nestedDirectoryStats
    } else {
      throw new Error(
        `${resolved} contains no tokens.resolver.json in its root or tokens/ directory. ` +
          'Point --tokens at a Figma variables export or a primitree build output.'
      )
    }
  }

  const selectedDirectoryNow = await fs.lstat(dir, { bigint: true })
  if (!sameDirectory(selectedDirectoryStats, selectedDirectoryNow)) {
    throw new Error('Token source directory changed while reading: .')
  }
  const rootRealPath = await fs.realpath(dir)
  const selectedDirectoryAfterRealPath = await fs.lstat(dir, { bigint: true })
  if (!sameDirectory(selectedDirectoryStats, selectedDirectoryAfterRealPath)) {
    throw new Error('Token source directory changed while reading: .')
  }
  const rootIdentity: DirectoryIdentity = {
    dev: selectedDirectoryStats.dev,
    ino: selectedDirectoryStats.ino,
    realPath: rootRealPath,
  }
  await inspectSelectedRoot(dir, rootIdentity)

  const resolverPath = path.join(dir, 'tokens.resolver.json')
  const resolverStats = await fs.lstat(resolverPath, { bigint: true })
  if (resolverStats.isSymbolicLink()) {
    throw new Error(
      'Token source cannot contain a symbolic link: tokens.resolver.json'
    )
  }
  if (!resolverStats.isFile()) {
    throw new Error(
      'Token source Resolver path is not a regular file: tokens.resolver.json'
    )
  }
  if (resolverStats.size > BigInt(MAX_TOKEN_JSON_BYTES)) {
    throw new Error(
      'Token source JSON file exceeds the 20 MiB limit: tokens.resolver.json'
    )
  }
  const budget: TokenScanBudget = {
    entries: 0,
    files: 0,
    bytes: Number(resolverStats.size),
  }
  const tokenDirectories: ScannedTokenDirectory[] = []
  const tokenFiles = (
    await readTokenFiles(
      dir,
      rootIdentity,
      '',
      0,
      budget,
      rootIdentity,
      tokenDirectories
    )
  ).sort((left, right) => compareText(left.relativePath, right.relativePath))
  validateTokenFilePaths(tokenFiles)
  budget.bytes = 0
  const resolverRead = await readJson(
    resolverPath,
    'tokens.resolver.json',
    budget,
    {
      rootDirectory: dir,
      rootIdentity,
      directory: dir,
      displayPath: '.',
      expectedIdentity: rootIdentity,
    },
    fileReadIdentity(resolverStats)
  )
  const resolver = resolverRead.value as ResolverDocument
  const files: Record<string, DTCGDocument> = {}
  const readTokenIdentities: Array<{
    relativePath: string
    identity: FileReadIdentity
  }> = []
  for (const {
    relativePath,
    expectedIdentity,
    directoryIdentity,
  } of tokenFiles) {
    const relativeDirectory = path.posix.dirname(relativePath)
    const displayDirectory = relativeDirectory === '.' ? '.' : relativeDirectory
    const tokenRead = await readJson(
      path.join(dir, relativePath),
      relativePath,
      budget,
      {
        rootDirectory: dir,
        rootIdentity,
        directory: path.join(dir, relativeDirectory),
        displayPath: displayDirectory,
        expectedIdentity: directoryIdentity,
      },
      expectedIdentity
    )
    files[relativePath] = tokenRead.value as DTCGDocument
    readTokenIdentities.push({ relativePath, identity: tokenRead.identity })
  }
  await verifyTokenDirectories(dir, rootIdentity, tokenDirectories)
  await verifyReadFile(
    resolverPath,
    'tokens.resolver.json',
    resolverRead.identity
  )
  for (const { relativePath, identity } of readTokenIdentities) {
    await verifyReadFile(path.join(dir, relativePath), relativePath, identity)
  }
  await inspectSelectedRoot(dir, rootIdentity)
  return { files, resolver, origin: dir }
}
