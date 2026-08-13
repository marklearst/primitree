import { constants as fsConstants, type BigIntStats, type Dir } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'

export const MAX_TOKEN_JSON_BYTES = 20 * 1024 * 1024
export const MAX_TOKEN_SOURCE_BYTES = 256 * 1024 * 1024
const TOKEN_READ_BUFFER_BYTES = 64 * 1024

export interface TokenScanBudget {
  entries: number
  files: number
  bytes: number
}

export interface FileIdentity {
  dev: bigint
  ino: bigint
}

export interface FileReadIdentity {
  dev: bigint
  ino: bigint
  size: bigint
  mtimeNs: bigint
  ctimeNs: bigint
}

export interface DirectoryIdentity extends FileIdentity {
  realPath: string
}

interface TokenDirectoryGuard {
  rootDirectory: string
  rootIdentity: DirectoryIdentity
  directory: string
  displayPath: string
  expectedIdentity: FileIdentity
}

interface JsonReadResult {
  value: unknown
  identity: FileReadIdentity
}

export async function readJson(
  filePath: string,
  displayPath = path.basename(filePath),
  budget?: TokenScanBudget,
  directoryGuard?: TokenDirectoryGuard,
  expectedIdentity?: FileReadIdentity
): Promise<JsonReadResult> {
  const directoryBefore =
    directoryGuard === undefined
      ? undefined
      : await inspectGuardedDirectory(directoryGuard)
  const flags =
    fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | fsConstants.O_NOFOLLOW
  let handle: Awaited<ReturnType<typeof fs.open>>
  try {
    handle = await fs.open(filePath, flags)
  } catch (error) {
    if (isErrorCode(error, 'ELOOP')) {
      throw new Error(
        `Token source cannot contain a symbolic link: ${displayPath}`
      )
    }
    throw error
  }

  let raw: string | undefined
  let parsed: unknown
  let completedIdentity: FileReadIdentity | undefined
  let readFailure: unknown
  try {
    if (directoryGuard !== undefined && directoryBefore !== undefined) {
      const directoryAfter = await inspectGuardedDirectory(directoryGuard)
      if (!sameDirectory(directoryBefore, directoryAfter)) {
        throw new Error(
          `Token source directory changed while reading: ${directoryGuard.displayPath}`
        )
      }
    }
    const stats = await handle.stat({ bigint: true })
    const readIdentity = fileReadIdentity(stats)
    if (!stats.isFile()) {
      throw new Error(
        `Token source JSON path is not a regular file: ${displayPath}`
      )
    }
    if (
      expectedIdentity !== undefined &&
      !sameFileRead(expectedIdentity, readIdentity)
    ) {
      throw new Error(`Token source file changed while reading: ${displayPath}`)
    }
    if (stats.size > BigInt(MAX_TOKEN_JSON_BYTES)) {
      throw new Error(
        `Token source JSON file exceeds the 20 MiB limit: ${displayPath}`
      )
    }

    const chunks: Buffer[] = []
    let fileBytes = 0
    while (true) {
      const buffer = Buffer.allocUnsafe(TOKEN_READ_BUFFER_BYTES)
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        fileBytes
      )
      if (bytesRead === 0) {
        break
      }
      fileBytes += bytesRead
      if (fileBytes > MAX_TOKEN_JSON_BYTES) {
        throw new Error(
          `Token source JSON file exceeds the 20 MiB limit: ${displayPath}`
        )
      }
      if (budget !== undefined) {
        budget.bytes += bytesRead
        if (budget.bytes > MAX_TOKEN_SOURCE_BYTES) {
          throw new Error(
            'Token source JSON files exceed the 256 MiB total limit.'
          )
        }
      }
      chunks.push(buffer.subarray(0, bytesRead))
    }
    const afterRead = fileReadIdentity(await handle.stat({ bigint: true }))
    if (!sameFileRead(readIdentity, afterRead)) {
      throw new Error(`Token source file changed while reading: ${displayPath}`)
    }
    completedIdentity = afterRead
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, fileBytes)
      )
    } catch (error) {
      throw new Error(`Token source JSON is invalid UTF-8: ${displayPath}`, {
        cause: error,
      })
    }
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Token source JSON is invalid: ${displayPath}`, {
        cause: error,
      })
    }
  } catch (error) {
    readFailure = error
  }

  let closeFailure: unknown
  try {
    await handle.close()
  } catch (error) {
    closeFailure = error
  }
  if (readFailure !== undefined) {
    if (closeFailure !== undefined) {
      const message =
        readFailure instanceof Error ? readFailure.message : String(readFailure)
      throw new Error(
        `${message}\nCould not close token source JSON file: ${displayPath}`,
        { cause: new AggregateError([readFailure, closeFailure]) }
      )
    }
    throw readFailure
  }
  if (closeFailure !== undefined) {
    throw new Error(`Could not close token source JSON file: ${displayPath}`, {
      cause: closeFailure,
    })
  }
  if (raw === undefined || completedIdentity === undefined) {
    throw new Error(`Could not read token source JSON file: ${displayPath}`)
  }
  return { value: parsed, identity: completedIdentity }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === code
  )
}

export function isMissingPathError(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')
}

export function sameDirectory(
  left: FileIdentity,
  right: FileIdentity
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}
export function fileIdentity(stats: BigIntStats): FileIdentity {
  return { dev: stats.dev, ino: stats.ino }
}

export function fileReadIdentity(stats: BigIntStats): FileReadIdentity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  }
}

function sameFileRead(
  before: FileReadIdentity,
  after: FileReadIdentity
): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  )
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

export async function inspectTokenDirectory(
  directory: string,
  rootRealPath: string,
  displayPath: string
): Promise<BigIntStats> {
  const stats = await fs.lstat(directory, { bigint: true })
  if (stats.isSymbolicLink()) {
    throw new Error(`Token source cannot use a symbolic link: ${displayPath}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(
      `Token source directory path is not a directory: ${displayPath}`
    )
  }
  const realPath = await fs.realpath(directory)
  const expectedRealPath = path.resolve(
    rootRealPath,
    displayPath === '.' ? '' : displayPath
  )
  if (
    !isWithinDirectory(rootRealPath, realPath) ||
    realPath !== expectedRealPath
  ) {
    throw new Error(
      `Token source directory changed while reading: ${displayPath}`
    )
  }
  return stats
}

export async function inspectSelectedRoot(
  directory: string,
  identity: DirectoryIdentity
): Promise<BigIntStats> {
  let stats: BigIntStats
  let realPath: string
  let statsAfterRealPath: BigIntStats
  try {
    stats = await fs.lstat(directory, { bigint: true })
    realPath = await fs.realpath(directory)
    statsAfterRealPath = await fs.lstat(directory, { bigint: true })
  } catch (error) {
    throw new Error('Token source directory changed while reading: .', {
      cause: error,
    })
  }
  if (
    !stats.isDirectory() ||
    !sameDirectory(identity, stats) ||
    !statsAfterRealPath.isDirectory() ||
    !sameDirectory(identity, statsAfterRealPath) ||
    realPath !== identity.realPath
  ) {
    throw new Error('Token source directory changed while reading: .')
  }
  return stats
}

async function inspectGuardedDirectory(
  guard: TokenDirectoryGuard
): Promise<BigIntStats> {
  await inspectSelectedRoot(guard.rootDirectory, guard.rootIdentity)
  const stats = await inspectTokenDirectory(
    guard.directory,
    guard.rootIdentity.realPath,
    guard.displayPath
  )
  if (!sameDirectory(guard.expectedIdentity, stats)) {
    throw new Error(
      `Token source directory changed while reading: ${guard.displayPath}`
    )
  }
  return stats
}

export async function verifyReadFile(
  filePath: string,
  displayPath: string,
  expectedIdentity: FileReadIdentity
): Promise<void> {
  let stats: BigIntStats
  try {
    stats = await fs.lstat(filePath, { bigint: true })
  } catch (error) {
    throw new Error(`Token source file changed while reading: ${displayPath}`, {
      cause: error,
    })
  }
  if (
    !stats.isFile() ||
    !sameFileRead(expectedIdentity, fileReadIdentity(stats))
  ) {
    throw new Error(`Token source file changed while reading: ${displayPath}`)
  }
}

export async function closeTokenDirectory(
  directoryHandle: Dir,
  displayDirectory: string,
  primaryFailure?: { error: unknown }
): Promise<void> {
  let closeFailure: { error: unknown } | undefined
  try {
    await directoryHandle.close()
  } catch (error) {
    closeFailure = { error }
  }

  if (primaryFailure !== undefined) {
    if (closeFailure !== undefined) {
      const message =
        primaryFailure.error instanceof Error
          ? primaryFailure.error.message
          : String(primaryFailure.error)
      throw new Error(
        `${message}\nCould not close token source directory: ${displayDirectory}`,
        {
          cause: new AggregateError([primaryFailure.error, closeFailure.error]),
        }
      )
    }
    throw primaryFailure.error
  }

  if (closeFailure !== undefined) {
    throw new Error(
      `Could not close token source directory: ${displayDirectory}`,
      { cause: closeFailure.error }
    )
  }
}
