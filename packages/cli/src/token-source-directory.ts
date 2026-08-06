import type { Dir, Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  isUnsafePortablePathSegment,
  portablePathComparisonKey,
} from './portable-path'
import {
  MAX_TOKEN_JSON_BYTES,
  MAX_TOKEN_SOURCE_BYTES,
  closeTokenDirectory,
  fileIdentity,
  fileReadIdentity,
  inspectTokenDirectory,
  sameDirectory,
  type DirectoryIdentity,
  type FileIdentity,
  type FileReadIdentity,
  type TokenScanBudget,
} from './token-source-filesystem'

const MAX_TOKEN_DIRECTORY_DEPTH = 64
const MAX_TOKEN_FILES = 1_000
const MAX_TOKEN_SOURCE_ENTRIES = 100_000

interface TokenDirectoryVerificationBudget {
  entries: number
}

export interface ScannedTokenFile {
  relativePath: string
  expectedIdentity: FileReadIdentity
  directoryIdentity: FileIdentity
}

export interface ScannedTokenDirectory {
  relativePath: string
  expectedIdentity: FileIdentity
  entries: Dirent[]
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateTokenFilePath(value: string): void {
  const segments = value.split('/')
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.includes('\\') ||
    segments.some(
      segment =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        isUnsafePortablePathSegment(segment)
    )
  ) {
    throw new Error(`Unsafe DTCG token file path: "${value}".`)
  }
}

export function validateTokenFilePaths(files: ScannedTokenFile[]): void {
  const claimed = new Map<string, string>()
  for (const file of files) {
    validateTokenFilePath(file.relativePath)
    const key = portablePathComparisonKey(file.relativePath)
    const existing = claimed.get(key)
    if (existing !== undefined) {
      throw new Error(
        `DTCG output paths collide: "${existing}" and "${file.relativePath}".`
      )
    }
    claimed.set(key, file.relativePath)
  }
  for (const [key, filePath] of claimed) {
    let separator = key.indexOf('/')
    while (separator !== -1) {
      const parent = claimed.get(key.slice(0, separator))
      if (parent !== undefined) {
        throw new Error(
          `DTCG output paths collide: "${parent}" and "${filePath}".`
        )
      }
      separator = key.indexOf('/', separator + 1)
    }
  }
}

function tokenDirectoryEntryType(entry: Dirent): string {
  if (entry.isFile()) {
    return 'file'
  }
  if (entry.isDirectory()) {
    return 'directory'
  }
  if (entry.isSymbolicLink()) {
    return 'symbolic-link'
  }
  if (entry.isBlockDevice()) {
    return 'block-device'
  }
  if (entry.isCharacterDevice()) {
    return 'character-device'
  }
  if (entry.isFIFO()) {
    return 'fifo'
  }
  if (entry.isSocket()) {
    return 'socket'
  }
  return 'unknown'
}

function compareTokenDirectoryEntries(left: Dirent, right: Dirent): number {
  return (
    compareText(left.name, right.name) ||
    compareText(tokenDirectoryEntryType(left), tokenDirectoryEntryType(right))
  )
}

function sameTokenDirectoryEntries(left: Dirent[], right: Dirent[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((entry, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      entry.name === other.name &&
      tokenDirectoryEntryType(entry) === tokenDirectoryEntryType(other)
    )
  })
}

async function consumeTokenDirectory(
  directoryHandle: Dir,
  displayDirectory: string,
  chargeEntry: () => void
): Promise<Dirent[]> {
  const entries: Dirent[] = []
  let iterationFailure: { error: unknown } | undefined
  try {
    while (true) {
      const entry = await directoryHandle.read()
      if (entry === null) {
        break
      }
      chargeEntry()
      entries.push(entry)
    }
  } catch (error) {
    iterationFailure = { error }
  }
  await closeTokenDirectory(directoryHandle, displayDirectory, iterationFailure)
  return entries.sort(compareTokenDirectoryEntries)
}

async function verifyTokenDirectoryEntries(
  directoryPath: string,
  rootIdentity: DirectoryIdentity,
  displayDirectory: string,
  expectedDirectory: FileIdentity,
  expectedEntries: Dirent[],
  budget: TokenDirectoryVerificationBudget
): Promise<void> {
  const before = await inspectTokenDirectory(
    directoryPath,
    rootIdentity.realPath,
    displayDirectory
  )
  if (!sameDirectory(expectedDirectory, before)) {
    throw new Error(
      `Token source directory changed while reading: ${displayDirectory}`
    )
  }

  const directoryHandle = await fs.opendir(directoryPath)
  try {
    const after = await inspectTokenDirectory(
      directoryPath,
      rootIdentity.realPath,
      displayDirectory
    )
    if (
      !sameDirectory(before, after) ||
      !sameDirectory(expectedDirectory, after)
    ) {
      throw new Error(
        `Token source directory changed while reading: ${displayDirectory}`
      )
    }
  } catch (guardFailure) {
    await closeTokenDirectory(directoryHandle, displayDirectory, {
      error: guardFailure,
    })
  }

  const actualEntries = await consumeTokenDirectory(
    directoryHandle,
    displayDirectory,
    () => {
      budget.entries += 1
      if (budget.entries > MAX_TOKEN_SOURCE_ENTRIES) {
        throw new Error('Token source can contain at most 100,000 entries.')
      }
    }
  )
  const after = await inspectTokenDirectory(
    directoryPath,
    rootIdentity.realPath,
    displayDirectory
  )
  if (
    !sameDirectory(before, after) ||
    !sameDirectory(expectedDirectory, after) ||
    !sameTokenDirectoryEntries(expectedEntries, actualEntries)
  ) {
    throw new Error(
      `Token source directory changed while reading: ${displayDirectory}`
    )
  }
}

export async function verifyTokenDirectories(
  directory: string,
  rootIdentity: DirectoryIdentity,
  directories: ScannedTokenDirectory[]
): Promise<void> {
  const budget: TokenDirectoryVerificationBudget = { entries: 0 }
  for (let index = directories.length - 1; index >= 0; index -= 1) {
    const scanned = directories[index]
    if (scanned === undefined) {
      continue
    }
    const displayDirectory = scanned.relativePath || '.'
    await verifyTokenDirectoryEntries(
      path.join(directory, scanned.relativePath),
      rootIdentity,
      displayDirectory,
      scanned.expectedIdentity,
      scanned.entries,
      budget
    )
  }
}

export async function readTokenFiles(
  directory: string,
  rootIdentity: DirectoryIdentity,
  relativeDirectory = '',
  depth = 0,
  budget: TokenScanBudget = { entries: 0, files: 0, bytes: 0 },
  expectedDirectory: FileIdentity = rootIdentity,
  directories: ScannedTokenDirectory[] = []
): Promise<ScannedTokenFile[]> {
  const files: ScannedTokenFile[] = []
  const directoryPath = path.join(directory, relativeDirectory)
  const displayDirectory = relativeDirectory || '.'
  const before = await inspectTokenDirectory(
    directoryPath,
    rootIdentity.realPath,
    displayDirectory
  )
  if (!sameDirectory(expectedDirectory, before)) {
    throw new Error(
      `Token source directory changed while reading: ${displayDirectory}`
    )
  }
  const directoryHandle = await fs.opendir(directoryPath)
  try {
    const after = await inspectTokenDirectory(
      directoryPath,
      rootIdentity.realPath,
      displayDirectory
    )
    if (
      !sameDirectory(before, after) ||
      !sameDirectory(expectedDirectory, after)
    ) {
      throw new Error(
        `Token source directory changed while reading: ${displayDirectory}`
      )
    }
  } catch (guardFailure) {
    await closeTokenDirectory(directoryHandle, displayDirectory, {
      error: guardFailure,
    })
  }

  const entries = await consumeTokenDirectory(
    directoryHandle,
    displayDirectory,
    () => {
      budget.entries += 1
      if (budget.entries > MAX_TOKEN_SOURCE_ENTRIES) {
        throw new Error('Token source can contain at most 100,000 entries.')
      }
    }
  )
  directories.push({
    relativePath: relativeDirectory,
    expectedIdentity: fileIdentity(before),
    entries,
  })

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name)
    const stats = await fs.lstat(path.join(directory, relativePath), {
      bigint: true,
    })
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Token source cannot contain a symbolic link: ${relativePath}`
      )
    }
    if (stats.isDirectory()) {
      if (depth >= MAX_TOKEN_DIRECTORY_DEPTH) {
        throw new Error(
          'Token source can contain at most 64 nested directory levels.'
        )
      }
      files.push(
        ...(await readTokenFiles(
          directory,
          rootIdentity,
          relativePath,
          depth + 1,
          budget,
          stats,
          directories
        ))
      )
      continue
    }
    if (stats.isFile()) {
      if (entry.name.endsWith('.tokens.json')) {
        budget.files += 1
        if (budget.files > MAX_TOKEN_FILES) {
          throw new Error('Token source can contain at most 1,000 token files.')
        }
        if (stats.size > BigInt(MAX_TOKEN_JSON_BYTES)) {
          throw new Error(
            `Token source JSON file exceeds the 20 MiB limit: ${relativePath}`
          )
        }
        budget.bytes += Number(stats.size)
        if (budget.bytes > MAX_TOKEN_SOURCE_BYTES) {
          throw new Error(
            'Token source JSON files exceed the 256 MiB total limit.'
          )
        }
        files.push({
          relativePath,
          expectedIdentity: fileReadIdentity(stats),
          directoryIdentity: fileIdentity(before),
        })
      }
      continue
    }
    throw new Error(
      `Token source path is not a regular file or directory: ${relativePath}`
    )
  }

  return files
}
