import type { BigIntStats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DTCGDocument, ResolverDocument } from '@primitree/dtcg'
import {
  compareText,
  readTokenFiles,
  validateTokenFilePaths,
  verifyTokenDirectories,
  type ScannedTokenDirectory,
} from './token-source-directory'
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
} from './token-source-filesystem'

interface BuiltTokenSource {
  files: Record<string, DTCGDocument>
  resolver: ResolverDocument
  origin: string
}

export function isMissingCheckSourcePath(error: unknown): boolean {
  return isMissingPathError(error)
}

export async function loadVariablesCheckSource(
  sourcePath: string
): Promise<unknown> {
  const resolved = path.resolve(sourcePath)
  let stats: BigIntStats
  try {
    stats = await fs.lstat(resolved, { bigint: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(`Token source does not exist: ${resolved}`)
    }
    throw error
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Token source cannot use a symbolic link: ${resolved}`)
  }
  if (!stats.isFile()) {
    throw new Error(`Token source path is not a regular file: ${resolved}`)
  }
  const displayPath = path.basename(resolved)
  const read = await readJson(
    resolved,
    displayPath,
    undefined,
    undefined,
    fileReadIdentity(stats)
  )
  await verifyReadFile(resolved, displayPath, read.identity)
  return read.value
}

async function resolverDirectoryStats(
  directory: string
): Promise<BigIntStats | null> {
  let directoryStats: BigIntStats
  try {
    directoryStats = await fs.lstat(directory, { bigint: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }
    throw error
  }
  if (directoryStats.isSymbolicLink()) {
    throw new Error(`Token source cannot use a symbolic link: ${directory}`)
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(
      `Token source directory path is not a directory: ${directory}`
    )
  }
  try {
    await fs.lstat(path.join(directory, 'tokens.resolver.json'), {
      bigint: true,
    })
    return directoryStats
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }
    throw error
  }
}

export async function loadBuiltTokenSource(
  sourcePath: string
): Promise<BuiltTokenSource> {
  const resolved = path.resolve(sourcePath)
  let sourceStats: BigIntStats | null
  try {
    sourceStats = await fs.lstat(resolved, { bigint: true })
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error
    }
    sourceStats = null
  }
  if (sourceStats === null) {
    throw new Error(`Token source does not exist: ${resolved}`)
  }
  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Token source cannot use a symbolic link: ${resolved}`)
  }
  if (!sourceStats.isDirectory()) {
    throw new Error(`Token source path is not a directory: ${resolved}`)
  }

  const sourceRealPath = await fs.realpath(resolved)
  const sourceIdentity: DirectoryIdentity = {
    dev: sourceStats.dev,
    ino: sourceStats.ino,
    realPath: sourceRealPath,
  }
  await inspectSelectedRoot(resolved, sourceIdentity)

  let directory = resolved
  let selectedFallback = false
  let selectedDirectoryStats = await resolverDirectoryStats(directory)
  if (selectedDirectoryStats === null) {
    const nested = path.join(directory, 'tokens')
    const nestedDirectoryStats = await resolverDirectoryStats(nested)
    if (nestedDirectoryStats === null) {
      throw new Error(
        `${resolved} contains no tokens.resolver.json in its root or tokens/ directory. ` +
          'Point primitree check at a primitree build output.'
      )
    }
    directory = nested
    selectedFallback = true
    selectedDirectoryStats = nestedDirectoryStats
  }

  const selectedDirectoryNow = await fs.lstat(directory, { bigint: true })
  if (!sameDirectory(selectedDirectoryStats, selectedDirectoryNow)) {
    throw new Error('Token source directory changed while reading: .')
  }
  const rootRealPath = await fs.realpath(directory)
  const selectedDirectoryAfterRealPath = await fs.lstat(directory, {
    bigint: true,
  })
  if (!sameDirectory(selectedDirectoryStats, selectedDirectoryAfterRealPath)) {
    throw new Error('Token source directory changed while reading: .')
  }
  const rootIdentity: DirectoryIdentity = {
    dev: selectedDirectoryStats.dev,
    ino: selectedDirectoryStats.ino,
    realPath: rootRealPath,
  }
  await inspectSelectedRoot(directory, rootIdentity)

  const resolverPath = path.join(directory, 'tokens.resolver.json')
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
      directory,
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
      rootDirectory: directory,
      rootIdentity,
      directory,
      displayPath: '.',
      expectedIdentity: rootIdentity,
    },
    fileReadIdentity(resolverStats)
  )
  const resolver = resolverRead.value as ResolverDocument
  const files = Object.create(null) as Record<string, DTCGDocument>
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
      path.join(directory, relativePath),
      relativePath,
      budget,
      {
        rootDirectory: directory,
        rootIdentity,
        directory: path.join(directory, relativeDirectory),
        displayPath: displayDirectory,
        expectedIdentity: directoryIdentity,
      },
      expectedIdentity
    )
    files[relativePath] = tokenRead.value as DTCGDocument
    readTokenIdentities.push({ relativePath, identity: tokenRead.identity })
  }

  await verifyTokenDirectories(directory, rootIdentity, tokenDirectories)
  await verifyReadFile(
    resolverPath,
    'tokens.resolver.json',
    resolverRead.identity
  )
  for (const { relativePath, identity } of readTokenIdentities) {
    await verifyReadFile(
      path.join(directory, relativePath),
      relativePath,
      identity
    )
  }
  await inspectSelectedRoot(directory, rootIdentity)
  if (selectedFallback) {
    await inspectSelectedRoot(resolved, sourceIdentity)
    try {
      await fs.lstat(path.join(resolved, 'tokens.resolver.json'), {
        bigint: true,
      })
    } catch (error) {
      if (isMissingPathError(error)) {
        await inspectSelectedRoot(resolved, sourceIdentity)
        return { files, resolver, origin: directory }
      }
      throw error
    }
    throw new Error('Token source directory changed while reading: .')
  }

  return { files, resolver, origin: directory }
}
