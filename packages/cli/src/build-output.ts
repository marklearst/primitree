import { createHash, randomUUID } from 'node:crypto'
import type { BigIntStats, Dir, Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import type { PipelineFile } from '@primitree/dtcg'
import {
  buildOutputBackupName,
  buildOutputBackupPrefix,
  buildOutputCleanupName,
  buildOutputLockName,
  buildOutputStagePrefix,
  MAX_PORTABLE_PATH_SEGMENT_BYTES,
} from './build-output-paths'
import { writePipelineFiles } from './io'
import {
  BUILD_MANIFEST_PATH,
  hashBuildText,
  MAX_BUILD_FILE_BYTES,
  parseBuildManifest,
  type BuildManifest,
} from './output-manifest'
import {
  isUnsafePortablePathSegment,
  portablePathComparisonKey,
} from './portable-path'

export interface BuildOutputDrift {
  readonly path: string
  readonly kind: 'missing' | 'changed' | 'unexpected'
}

export type BuildOutputState =
  | { readonly status: 'current'; readonly paths: readonly [] }
  | { readonly status: 'drift'; readonly paths: readonly BuildOutputDrift[] }

const MAX_OUTPUT_ENTRIES = 100_000
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const READ_BUFFER_BYTES = 64 * 1024
const DIRECTORY_PERMISSION_BITS = 0o777

interface OutputPathIdentity {
  readonly dev: bigint
  readonly ino: bigint
}

interface OutputDirectoryEpoch extends OutputPathIdentity {
  readonly mtimeNs: bigint
  readonly ctimeNs: bigint
}

interface OutputPathSnapshotEntry {
  readonly path: string
  readonly identity?: OutputPathIdentity
}

type OutputPathSnapshot = readonly OutputPathSnapshotEntry[]
type OutputPathGuard = () => Promise<void>
type BuildOutputFileHandle = Awaited<ReturnType<typeof fs.open>>

interface OutputDirectoryEpochTracker {
  capture(
    directory: string,
    parent?: string,
    expectedStats?: BigIntStats
  ): Promise<BigIntStats>
  guard(directory?: string): OutputPathGuard
  verifyAll(): Promise<void>
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

function isMissingExpectedFile(error: unknown): boolean {
  return (
    isMissing(error) ||
    (error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOTDIR')
  )
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'EEXIST'
  )
}

async function setOutputDirectoryMode(
  directory: string,
  mode: number
): Promise<void> {
  if (process.platform !== 'win32') {
    await fs.chmod(directory, mode & DIRECTORY_PERMISSION_BITS)
  }
}

function validateBuildFiles(files: readonly PipelineFile[]): void {
  if (files.length > MAX_OUTPUT_ENTRIES) {
    throw new Error('Build output can contain at most 100,000 files.')
  }
  const pathsByKey = new Map<string, string>()
  for (const file of files) {
    const segments = file.path.split('/')
    if (
      file.path.length === 0 ||
      path.posix.isAbsolute(file.path) ||
      path.win32.isAbsolute(file.path) ||
      file.path.includes('\\') ||
      segments.some(
        segment =>
          segment.length === 0 ||
          segment === '.' ||
          segment === '..' ||
          isUnsafePortablePathSegment(segment)
      )
    ) {
      throw new Error(`Unsafe build output path: ${JSON.stringify(file.path)}.`)
    }
    const oversizedSegment = segments.find(
      segment =>
        Buffer.byteLength(segment, 'utf8') > MAX_PORTABLE_PATH_SEGMENT_BYTES
    )
    if (oversizedSegment !== undefined) {
      throw new Error(
        `Build output path segment is ${Buffer.byteLength(oversizedSegment, 'utf8')} UTF-8 bytes; use at most ${MAX_PORTABLE_PATH_SEGMENT_BYTES} UTF-8 bytes: ${JSON.stringify(file.path)}.`
      )
    }
    const key = portablePathComparisonKey(file.path)
    const prior = pathsByKey.get(key)
    if (prior !== undefined) {
      throw new Error(
        `Build output paths collide: ${JSON.stringify(prior)} and ${JSON.stringify(file.path)}.`
      )
    }
    pathsByKey.set(key, file.path)
  }
  for (const [key, filePath] of pathsByKey) {
    const segments = key.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join('/')
      const prior = pathsByKey.get(parent)
      if (prior !== undefined) {
        throw new Error(
          `Build output paths collide: ${JSON.stringify(prior)} and ${JSON.stringify(filePath)}.`
        )
      }
    }
  }
  if (files.filter(file => file.path === BUILD_MANIFEST_PATH).length !== 1) {
    throw new Error('Build output requires one Primitree manifest file.')
  }
}

function validateBuildCandidate(files: readonly PipelineFile[]) {
  validateBuildFiles(files)
  const manifestFile = files.find(file => file.path === BUILD_MANIFEST_PATH)
  if (manifestFile === undefined) {
    throw new Error('Build output requires one Primitree manifest file.')
  }
  if (Buffer.byteLength(manifestFile.contents, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new Error('Build output manifest exceeds the 16 MiB limit.')
  }
  const manifest = parseBuildManifest(manifestFile.contents)
  const generated = files
    .filter(file => file.path !== BUILD_MANIFEST_PATH)
    .sort((left, right) => left.path.localeCompare(right.path))
  if (
    manifest.files.length !== generated.length ||
    manifest.files.some((file, index) => {
      const candidate = generated[index]
      return (
        candidate === undefined ||
        file.path !== candidate.path ||
        file.bytes !== Buffer.byteLength(candidate.contents, 'utf8') ||
        file.sha256 !== hashBuildText(candidate.contents)
      )
    })
  ) {
    throw new Error('Build output manifest does not match its files.')
  }
  return manifest
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function rethrowAfterGuard(
  operationFailure: unknown,
  guard: OutputPathGuard | undefined
): Promise<never> {
  let guardFailure: unknown
  try {
    await guard?.()
  } catch (error) {
    guardFailure = error
  }
  if (guardFailure !== undefined) {
    throw new Error(
      `${errorMessage(operationFailure)}\n${errorMessage(guardFailure)}`,
      { cause: new AggregateError([operationFailure, guardFailure]) }
    )
  }
  throw operationFailure
}

async function runGuardedPathOperation<T>(
  guard: OutputPathGuard | undefined,
  operation: () => Promise<T>
): Promise<T> {
  await guard?.()
  let result: T
  try {
    result = await operation()
  } catch (error) {
    return rethrowAfterGuard(error, guard)
  }
  await guard?.()
  return result
}

async function closeBuildOutputDirectory(
  handle: Dir,
  directory: string,
  operationFailure?: { readonly error: unknown },
  guard?: OutputPathGuard
): Promise<void> {
  const failures: Array<{
    readonly error: unknown
    readonly message: string
    readonly kind: 'operation' | 'guard' | 'close'
  }> = []
  if (operationFailure !== undefined) {
    failures.push({
      error: operationFailure.error,
      message: errorMessage(operationFailure.error),
      kind: 'operation',
    })
  }
  try {
    await handle.close()
  } catch (error) {
    failures.push({
      error,
      message: `Could not close build output directory: ${directory}`,
      kind: 'close',
    })
  }
  try {
    await guard?.()
  } catch (error) {
    failures.push({
      error,
      message: errorMessage(error),
      kind: 'guard',
    })
  }
  if (failures.length === 0) {
    return
  }
  const onlyFailure = failures[0]
  if (failures.length === 1 && onlyFailure !== undefined) {
    if (onlyFailure.kind === 'close') {
      throw new Error(onlyFailure.message, { cause: onlyFailure.error })
    }
    throw onlyFailure.error
  }
  throw new Error(failures.map(failure => failure.message).join('\n'), {
    cause: new AggregateError(failures.map(failure => failure.error)),
  })
}

async function openBuildOutputDirectory(
  directory: string,
  guard: OutputPathGuard | undefined
): Promise<Dir> {
  await guard?.()
  let handle: Dir
  try {
    handle = await fs.opendir(directory)
  } catch (error) {
    return rethrowAfterGuard(error, guard)
  }
  try {
    await guard?.()
  } catch (error) {
    await closeBuildOutputDirectory(handle, directory, { error })
    throw error
  }
  return handle
}

async function visitBuildOutputDirectory(
  directory: string,
  guard: OutputPathGuard | undefined,
  visit: (entry: Dirent) => void
): Promise<void> {
  const handle = await openBuildOutputDirectory(directory, guard)
  let operationFailure: { readonly error: unknown } | undefined
  try {
    await guard?.()
    while (true) {
      const entry = await handle.read()
      if (entry === null) {
        break
      }
      visit(entry)
    }
  } catch (error) {
    operationFailure = { error }
  }
  await closeBuildOutputDirectory(handle, directory, operationFailure, guard)
}

async function listOutputPaths(
  directory: string,
  symbolicLinks: 'reject' | 'list',
  epochs: OutputDirectoryEpochTracker
): Promise<{
  readonly files: readonly string[]
  readonly directories: readonly string[]
  readonly symbolicLinks: readonly string[]
}> {
  const files: string[] = []
  const directories: string[] = []
  const foundSymbolicLinks: string[] = []
  const pending: Array<{
    readonly absolute: string
    readonly relative: string
    readonly parent?: string
  }> = [{ absolute: directory, relative: '', parent: path.dirname(directory) }]
  let count = 0

  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) {
      break
    }
    await epochs.capture(current.absolute, current.parent)
    await visitBuildOutputDirectory(
      current.absolute,
      epochs.guard(current.absolute),
      entry => {
        count += 1
        if (count > MAX_OUTPUT_ENTRIES) {
          throw new Error('Build output can contain at most 100,000 entries.')
        }
        const relative = path.posix.join(current.relative, entry.name)
        const absolute = path.join(current.absolute, entry.name)
        if (entry.isSymbolicLink()) {
          if (symbolicLinks === 'reject') {
            throw new Error(
              `Build output cannot contain a symbolic link: ${relative}`
            )
          }
          foundSymbolicLinks.push(relative)
          return
        }
        if (entry.isDirectory()) {
          directories.push(`${relative}/`)
          pending.push({ absolute, relative, parent: current.absolute })
        } else if (entry.isFile()) {
          files.push(relative)
        } else {
          throw new Error(
            `Build output path is not a file or directory: ${relative}`
          )
        }
      }
    )
  }

  return {
    files: files.sort(),
    directories: directories.sort(),
    symbolicLinks: foundSymbolicLinks.sort(),
  }
}

async function listVerifiedOutputPaths(
  directory: string,
  symbolicLinks: 'reject' | 'list',
  epochs: OutputDirectoryEpochTracker
): ReturnType<typeof listOutputPaths> {
  return listOutputPaths(directory, symbolicLinks, epochs)
}

function fileReadIdentity(stats: BigIntStats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  }
}

function sameFileRead(
  left: ReturnType<typeof fileReadIdentity>,
  right: ReturnType<typeof fileReadIdentity>
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

async function closeBuildOutputFile(
  handle: BuildOutputFileHandle,
  filePath: string,
  operationFailure?: { readonly error: unknown }
): Promise<void> {
  let closeFailure: unknown
  try {
    await handle.close()
  } catch (error) {
    closeFailure = error
  }
  if (operationFailure !== undefined) {
    if (closeFailure !== undefined) {
      throw new Error(
        `${errorMessage(operationFailure.error)}\nCould not close build output file: ${filePath}`,
        {
          cause: new AggregateError([operationFailure.error, closeFailure]),
        }
      )
    }
    throw operationFailure.error
  }
  if (closeFailure !== undefined) {
    throw new Error(`Could not close build output file: ${filePath}`, {
      cause: closeFailure,
    })
  }
}

async function openBuildOutputFile(
  filePath: string,
  guard: OutputPathGuard | undefined
): Promise<BuildOutputFileHandle> {
  await guard?.()
  let handle: BuildOutputFileHandle
  try {
    handle = await fs.open(filePath, 'r')
  } catch (error) {
    return rethrowAfterGuard(error, guard)
  }
  try {
    await guard?.()
  } catch (error) {
    await closeBuildOutputFile(handle, filePath, { error })
    throw error
  }
  return handle
}

async function readBuildManifest(
  manifestPath: string,
  expectedStats: BigIntStats,
  guard?: OutputPathGuard
): Promise<BuildManifest> {
  if (expectedStats.size > BigInt(MAX_MANIFEST_BYTES)) {
    throw new Error('Build output manifest exceeds the 16 MiB limit.')
  }
  const handle = await openBuildOutputFile(manifestPath, guard)
  let manifest: BuildManifest | undefined
  let operationFailure: { readonly error: unknown } | undefined
  try {
    await guard?.()
    const openedStats = await handle.stat({ bigint: true })
    const openedIdentity = fileReadIdentity(openedStats)
    if (
      !openedStats.isFile() ||
      !sameFileRead(fileReadIdentity(expectedStats), openedIdentity) ||
      openedStats.size > BigInt(MAX_MANIFEST_BYTES)
    ) {
      throw new Error(
        'Primitree found a changed build output manifest while reading it.'
      )
    }
    const chunks: Buffer[] = []
    let total = 0
    let position = 0
    while (true) {
      const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position
      )
      if (bytesRead === 0) {
        break
      }
      total += bytesRead
      if (total > MAX_MANIFEST_BYTES) {
        throw new Error('Build output manifest exceeds the 16 MiB limit.')
      }
      chunks.push(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const completedStats = await handle.stat({ bigint: true })
    if (!sameFileRead(openedIdentity, fileReadIdentity(completedStats))) {
      throw new Error(
        'Primitree found a changed build output manifest while reading it.'
      )
    }
    await guard?.()
    const pathStats = await fs.lstat(manifestPath, { bigint: true })
    await guard?.()
    if (
      !pathStats.isFile() ||
      !sameFileRead(openedIdentity, fileReadIdentity(pathStats))
    ) {
      throw new Error(
        'Primitree found a changed build output manifest while reading it.'
      )
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, total)
      )
    } catch (error) {
      throw new Error(
        `Build output manifest is not valid UTF-8: ${manifestPath}`,
        { cause: error }
      )
    }
    manifest = parseBuildManifest(text)
  } catch (error) {
    operationFailure = { error }
  }
  await closeBuildOutputFile(handle, manifestPath, operationFailure)
  if (manifest === undefined) {
    throw new Error(`Could not read build output manifest: ${manifestPath}`)
  }
  return manifest
}

async function hashFile(
  filePath: string,
  expectedStats: BigIntStats,
  expectedBytes: number,
  guard?: OutputPathGuard
): Promise<string> {
  if (expectedBytes > MAX_BUILD_FILE_BYTES) {
    throw new Error(`Build output file exceeds the 64 MiB limit: ${filePath}`)
  }
  const handle = await openBuildOutputFile(filePath, guard)
  let digest: string | undefined
  let operationFailure: { readonly error: unknown } | undefined
  try {
    await guard?.()
    const openedStats = await handle.stat({ bigint: true })
    if (
      !openedStats.isFile() ||
      !sameFileRead(
        fileReadIdentity(expectedStats),
        fileReadIdentity(openedStats)
      ) ||
      openedStats.size !== BigInt(expectedBytes)
    ) {
      throw new Error(
        `Primitree found changed build output while reading: ${filePath}`
      )
    }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position
      )
      if (bytesRead === 0) {
        break
      }
      if (position + bytesRead > expectedBytes) {
        throw new Error(
          `Primitree found changed build output while reading: ${filePath}`
        )
      }
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const finalStats = await handle.stat({ bigint: true })
    if (
      position !== expectedBytes ||
      !sameFileRead(fileReadIdentity(openedStats), fileReadIdentity(finalStats))
    ) {
      throw new Error(
        `Primitree found changed build output while reading: ${filePath}`
      )
    }
    await guard?.()
    const pathStats = await fs.lstat(filePath, { bigint: true })
    await guard?.()
    if (
      !pathStats.isFile() ||
      !sameFileRead(fileReadIdentity(openedStats), fileReadIdentity(pathStats))
    ) {
      throw new Error(
        `Primitree found changed build output while reading: ${filePath}`
      )
    }
    digest = hash.digest('hex')
  } catch (error) {
    operationFailure = { error }
  }
  await closeBuildOutputFile(handle, filePath, operationFailure)
  if (digest === undefined) {
    throw new Error(`Could not read build output file: ${filePath}`)
  }
  return digest
}

async function checkOutputParent(
  rootDirectory: string,
  outputDirectory: string,
  createMissing: boolean
): Promise<OutputPathSnapshot> {
  const root = path.resolve(rootDirectory)
  const output = path.resolve(outputDirectory)
  const relative = path.relative(root, output)
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Build output path must stay below this folder: ${root}`)
  }

  const parentSegments = relative.split(path.sep).slice(0, -1)
  const snapshot: OutputPathSnapshotEntry[] = []
  let current = root
  const rootStats = await fs.lstat(root, { bigint: true }).catch(error => {
    if (isMissing(error)) {
      return undefined
    }
    throw error
  })
  if (
    rootStats === undefined ||
    !rootStats.isDirectory() ||
    rootStats.isSymbolicLink()
  ) {
    throw new Error(`Build output root must be a directory: ${root}`)
  }
  snapshot.push({
    path: root,
    identity: { dev: rootStats.dev, ino: rootStats.ino },
  })

  for (const segment of parentSegments) {
    current = path.join(current, segment)
    await assertOutputPathSnapshot(snapshot)
    let stats = await fs.lstat(current, { bigint: true }).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    if (stats === undefined && createMissing) {
      await assertOutputPathSnapshot(snapshot)
      await fs.mkdir(current).catch(error => {
        if (!isAlreadyExists(error)) {
          throw error
        }
      })
      await assertOutputPathSnapshot(snapshot)
      stats = await fs.lstat(current, { bigint: true })
    }
    if (stats === undefined) {
      snapshot.push({ path: current })
      continue
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Build output path cannot use a symbolic link: ${current}`
      )
    }
    if (!stats.isDirectory()) {
      throw new Error(`Build output parent must be a directory: ${current}`)
    }
    await assertOutputPathSnapshot(snapshot)
    snapshot.push({
      path: current,
      identity: { dev: stats.dev, ino: stats.ino },
    })
  }
  await assertOutputPathSnapshot(snapshot)
  return snapshot
}

async function assertOutputPathSnapshot(
  snapshot: OutputPathSnapshot
): Promise<void> {
  for (const entry of snapshot) {
    const stats = await fs.lstat(entry.path, { bigint: true }).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    const unchanged =
      entry.identity === undefined
        ? stats === undefined
        : stats?.isDirectory() &&
          !stats.isSymbolicLink() &&
          stats.dev === entry.identity.dev &&
          stats.ino === entry.identity.ino
    if (!unchanged) {
      throw new Error(
        `Primitree found a changed build output path while inspecting: ${entry.path}`
      )
    }
  }
}

function outputDirectoryEpoch(stats: BigIntStats): OutputDirectoryEpoch {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  }
}

function isSameDirectoryEpoch(
  left: OutputDirectoryEpoch,
  right: OutputDirectoryEpoch
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

function changedOutputScanError(directory: string, cause?: unknown): Error {
  return new Error(
    `Primitree found a changed build output path while inspecting: ${directory}`,
    cause === undefined ? undefined : { cause }
  )
}

function createOutputDirectoryEpochTracker(
  directory: string,
  parentGuard?: OutputPathGuard
): OutputDirectoryEpochTracker {
  const epochs = new Map<
    string,
    { readonly epoch: OutputDirectoryEpoch; readonly parent?: string }
  >()
  const assertEpoch = async (trackedDirectory: string): Promise<void> => {
    const expected = epochs.get(trackedDirectory)
    if (expected === undefined) {
      return
    }
    const stats = await fs
      .lstat(trackedDirectory, { bigint: true })
      .catch(error => {
        throw changedOutputScanError(directory, error)
      })
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      !isSameDirectoryEpoch(outputDirectoryEpoch(stats), expected.epoch)
    ) {
      throw changedOutputScanError(directory)
    }
  }
  const guard =
    (trackedDirectory?: string): OutputPathGuard =>
    async () => {
      await parentGuard?.()
      if (trackedDirectory !== undefined) {
        const tracked = epochs.get(trackedDirectory)
        if (tracked?.parent !== undefined) {
          await assertEpoch(tracked.parent)
        }
        await assertEpoch(trackedDirectory)
      }
      await parentGuard?.()
    }
  const capture = async (
    trackedDirectory: string,
    parent?: string,
    expectedStats?: BigIntStats
  ): Promise<BigIntStats> => {
    const relevantGuard = guard(parent)
    await relevantGuard()
    const stats = await fs
      .lstat(trackedDirectory, { bigint: true })
      .catch(error => {
        throw changedOutputScanError(directory, error)
      })
    await relevantGuard()
    const epoch = outputDirectoryEpoch(stats)
    const prior = epochs.get(trackedDirectory)
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      (expectedStats !== undefined &&
        !isSameDirectoryEpoch(epoch, outputDirectoryEpoch(expectedStats))) ||
      (prior !== undefined && !isSameDirectoryEpoch(epoch, prior.epoch))
    ) {
      throw changedOutputScanError(directory)
    }
    if (prior === undefined) {
      epochs.set(
        trackedDirectory,
        parent === undefined ? { epoch } : { epoch, parent }
      )
    } else if (prior.parent !== parent) {
      throw changedOutputScanError(directory)
    }
    await guard(trackedDirectory)()
    return stats
  }
  const verifyAll = async (): Promise<void> => {
    await parentGuard?.()
    for (const trackedDirectory of epochs.keys()) {
      await assertEpoch(trackedDirectory)
    }
    await parentGuard?.()
  }
  return { guard, capture, verifyAll }
}

async function captureOutputLineageEpochs(
  directory: string,
  parentSnapshot: OutputPathSnapshot | undefined,
  parentGuard: OutputPathGuard | undefined
): Promise<OutputDirectoryEpochTracker> {
  const epochs = createOutputDirectoryEpochTracker(directory, parentGuard)
  let parent: string | undefined
  for (const entry of parentSnapshot ?? []) {
    if (entry.identity !== undefined) {
      await epochs.capture(entry.path, parent)
      parent = entry.path
    }
  }
  return epochs
}

function createOutputRootGuard(
  directory: string,
  stats: BigIntStats,
  parentGuard: OutputPathGuard | undefined
): OutputPathGuard {
  const identity = outputDirectoryEpoch(stats)
  return async () => {
    await parentGuard?.()
    const current = await fs.lstat(directory, { bigint: true }).catch(error => {
      throw new Error(
        `Primitree found a changed build output path while inspecting: ${directory}`,
        { cause: error }
      )
    })
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      !isSameDirectoryEpoch(outputDirectoryEpoch(current), identity)
    ) {
      throw new Error(
        `Primitree found a changed build output path while inspecting: ${directory}`
      )
    }
    await parentGuard?.()
  }
}

async function captureOutputRootGuard(
  directory: string,
  parentGuard: OutputPathGuard | undefined,
  expectedStats?: BigIntStats
): Promise<{ readonly stats: BigIntStats; readonly guard: OutputPathGuard }> {
  const stats = await runGuardedPathOperation(parentGuard, () =>
    fs.lstat(directory, { bigint: true })
  )
  if (
    expectedStats !== undefined &&
    (stats.dev !== expectedStats.dev || stats.ino !== expectedStats.ino)
  ) {
    throw new Error(
      `Primitree found a changed build output path while inspecting: ${directory}`
    )
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      'The configured output path must point to a directory, not a symbolic link.'
    )
  }
  const guard = createOutputRootGuard(directory, stats, parentGuard)
  await guard()
  return { stats, guard }
}

async function isEmptyOutputDirectory(
  directory: string,
  parentGuard?: OutputPathGuard,
  expectedStats?: BigIntStats,
  parentSnapshot?: OutputPathSnapshot
): Promise<boolean> {
  const epochs = await captureOutputLineageEpochs(
    directory,
    parentSnapshot,
    parentGuard
  )
  await epochs.capture(directory, path.dirname(directory), expectedStats)
  const paths = await listVerifiedOutputPaths(directory, 'reject', epochs)
  await epochs.verifyAll()
  return paths.files.length === 0 && paths.directories.length === 0
}

async function findInterruptedBackups(
  parent: string,
  name: string,
  guard?: OutputPathGuard
): Promise<readonly string[]> {
  const prefix = buildOutputBackupPrefix(name)
  const backups: string[] = []
  let count = 0
  await visitBuildOutputDirectory(parent, guard, entry => {
    count += 1
    if (count > MAX_OUTPUT_ENTRIES) {
      throw new Error(
        'Build output parent can contain at most 100,000 entries.'
      )
    }
    if (entry.name.startsWith(prefix)) {
      backups.push(path.join(parent, entry.name))
    }
  })
  return backups.sort()
}

async function restorePriorOutput(
  backup: string,
  directory: string,
  operationFailure: unknown,
  parentGuard?: OutputPathGuard,
  expectedStats?: BigIntStats
): Promise<never> {
  try {
    if (expectedStats === undefined) {
      throw new Error(
        `Primitree could not verify the prior build output before restoring it: ${backup}`
      )
    }
    const backupGuard = createOutputRootGuard(
      backup,
      expectedStats,
      parentGuard
    )
    await backupGuard()
    await fs.rename(backup, directory)
    await captureOutputRootGuard(directory, parentGuard, expectedStats)
  } catch (restoreFailure) {
    const retained = await locateRetainedPath(
      expectedStats,
      [backup, directory],
      path.dirname(directory)
    )
    const operationMessage =
      operationFailure instanceof Error
        ? operationFailure.message
        : String(operationFailure)
    const restoreMessage =
      restoreFailure instanceof Error
        ? restoreFailure.message
        : String(restoreFailure)
    throw new Error(
      `${operationMessage}\nPrimitree could not restore the prior build output.\nRestore error: ${restoreMessage}\nInspect this location before running the build again: ${retained}`,
      {
        cause: new AggregateError([operationFailure, restoreFailure]),
      }
    )
  }
  throw operationFailure
}

function isSamePathIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.isDirectory() === right.isDirectory() &&
    left.isFile() === right.isFile() &&
    left.isSymbolicLink() === right.isSymbolicLink()
  )
}

async function bindOutputLock(
  handle: BuildOutputFileHandle,
  lock: string,
  parentGuard: OutputPathGuard
): Promise<BigIntStats> {
  try {
    await parentGuard()
    const openedStats = await handle.stat({ bigint: true })
    await parentGuard()
    const pathStats = await fs.lstat(lock, { bigint: true })
    await parentGuard()
    if (
      !openedStats.isFile() ||
      !pathStats.isFile() ||
      pathStats.isSymbolicLink() ||
      openedStats.dev !== pathStats.dev ||
      openedStats.ino !== pathStats.ino
    ) {
      throw new Error('The opened lock does not match the lock path.')
    }
    return openedStats
  } catch (error) {
    const bindFailure = new Error(
      `Primitree could not bind the output lock to its path: ${lock}\nLock binding error: ${errorMessage(error)}`,
      { cause: error }
    )
    try {
      await handle.close()
    } catch (closeFailure) {
      throw new Error(
        `${bindFailure.message}\nCould not close output lock: ${lock}`,
        { cause: new AggregateError([bindFailure, closeFailure]) }
      )
    }
    throw bindFailure
  }
}

async function locateRetainedPath(
  expectedStats: BigIntStats | undefined,
  candidates: readonly string[],
  parent: string
): Promise<string> {
  if (expectedStats !== undefined) {
    for (const candidate of candidates) {
      const stats = await fs
        .lstat(candidate, { bigint: true })
        .catch(() => undefined)
      if (stats !== undefined && isSamePathIdentity(stats, expectedStats)) {
        return candidate
      }
    }
  }
  return parent
}

async function removeVerifiedPath(
  target: string,
  expectedStats: BigIntStats,
  parent: string,
  outputName: string,
  guard: OutputPathGuard | undefined,
  recursive: boolean,
  failureMessage: string
): Promise<void> {
  const quarantine = path.join(
    parent,
    buildOutputCleanupName(outputName, randomUUID())
  )
  try {
    const targetStats = await runGuardedPathOperation(guard, () =>
      fs.lstat(target, { bigint: true })
    )
    if (!isSamePathIdentity(targetStats, expectedStats)) {
      throw new Error(
        `Primitree found a changed build output path while inspecting: ${target}`
      )
    }
    await runGuardedPathOperation(guard, () => fs.rename(target, quarantine))
    const quarantineStats = await runGuardedPathOperation(guard, () =>
      fs.lstat(quarantine, { bigint: true })
    )
    if (!isSamePathIdentity(quarantineStats, expectedStats)) {
      throw new Error(
        `Primitree found a changed build output path while inspecting: ${quarantine}`
      )
    }
    await fs.rm(quarantine, recursive ? { recursive: true } : undefined)
    await guard?.()
  } catch (error) {
    const retained = await locateRetainedPath(
      expectedStats,
      [target, quarantine],
      parent
    )
    throw new Error(`${failureMessage}: ${retained}`, { cause: error })
  }
}

function expectedDirectories(paths: readonly string[]): Set<string> {
  const directories = new Set<string>()
  for (const filePath of paths) {
    const segments = filePath.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(`${segments.slice(0, index).join('/')}/`)
    }
  }
  return directories
}

async function verifyOwnedOutput(
  directory: string,
  sourceId: string,
  parentGuard?: OutputPathGuard,
  expectedStats?: BigIntStats,
  parentSnapshot?: OutputPathSnapshot
): Promise<void> {
  const epochs = await captureOutputLineageEpochs(
    directory,
    parentSnapshot,
    parentGuard
  )
  await epochs.capture(directory, path.dirname(directory), expectedStats)
  const outputGuard = epochs.guard(directory)
  const manifestPath = path.join(directory, BUILD_MANIFEST_PATH)
  await outputGuard()
  const manifestStats = await fs
    .lstat(manifestPath, { bigint: true })
    .catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
  await outputGuard()
  if (
    manifestStats === undefined ||
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink()
  ) {
    throw new Error(
      'Existing build output needs a Primitree manifest file and cannot use a symbolic link in its place.'
    )
  }
  const manifest = await readBuildManifest(
    manifestPath,
    manifestStats,
    outputGuard
  )
  validateBuildFiles([
    ...manifest.files.map(file => ({ path: file.path, contents: '' })),
    { path: BUILD_MANIFEST_PATH, contents: '' },
  ])
  if (manifest.source.id !== sourceId) {
    throw new Error(
      `Existing build output belongs to source "${manifest.source.id}", not "${sourceId}".`
    )
  }
  const ownedFiles = new Set([
    BUILD_MANIFEST_PATH,
    ...manifest.files.map(file => file.path),
  ])
  const ownedDirectories = expectedDirectories([...ownedFiles])
  const actual = await listVerifiedOutputPaths(directory, 'reject', epochs)
  const unexpected = [
    ...actual.files.filter(file => !ownedFiles.has(file)),
    ...actual.directories.filter(child => !ownedDirectories.has(child)),
  ].sort()
  if (unexpected[0] !== undefined) {
    throw new Error(
      `Refusing to replace unexpected build output: ${unexpected[0]}`
    )
  }
  for (const file of manifest.files) {
    const filePath = path.join(directory, ...file.path.split('/'))
    const fileGuard = epochs.guard(path.dirname(filePath))
    await fileGuard()
    const stats = await fs.lstat(filePath, { bigint: true }).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    await fileGuard()
    if (stats === undefined || !stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Refusing to replace missing build output: ${file.path}`)
    }
    if (
      stats.size !== BigInt(file.bytes) ||
      (await hashFile(filePath, stats, file.bytes, fileGuard)) !== file.sha256
    ) {
      throw new Error(`Refusing to replace changed build output: ${file.path}`)
    }
  }
  await epochs.verifyAll()
}

export async function inspectBuildOutput(
  directory: string,
  files: readonly PipelineFile[],
  rootDirectory?: string
): Promise<BuildOutputState> {
  validateBuildCandidate(files)
  const parentSnapshot =
    rootDirectory === undefined
      ? undefined
      : await checkOutputParent(rootDirectory, directory, false)
  const parentGuard =
    parentSnapshot === undefined
      ? undefined
      : () => assertOutputPathSnapshot(parentSnapshot)
  const epochs = await captureOutputLineageEpochs(
    directory,
    parentSnapshot,
    parentGuard
  )
  const stats = await runGuardedPathOperation(epochs.guard(), () =>
    fs.lstat(directory, { bigint: true }).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
  )
  if (stats === undefined) {
    await epochs.verifyAll()
    return {
      status: 'drift',
      paths: [...files]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(file => ({ path: file.path, kind: 'missing' as const })),
    }
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      'The configured output path must point to a directory, not a symbolic link.'
    )
  }
  await epochs.capture(directory, path.dirname(directory), stats)
  const drift: BuildOutputDrift[] = []
  const expectedFiles = new Set(files.map(file => file.path))
  const expectedDirectoriesForFiles = expectedDirectories(
    files.map(file => file.path)
  )
  const actual = await listVerifiedOutputPaths(directory, 'list', epochs)
  const actualFiles = new Set(actual.files)
  const actualSymbolicLinks = new Set(actual.symbolicLinks)
  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    if (actualSymbolicLinks.has(file.path)) {
      drift.push({ path: file.path, kind: 'changed' })
      continue
    }
    if (!actualFiles.has(file.path)) {
      drift.push({ path: file.path, kind: 'missing' })
      continue
    }
    const filePath = path.join(directory, ...file.path.split('/'))
    const fileGuard = epochs.guard(path.dirname(filePath))
    await fileGuard()
    const fileStats = await fs
      .lstat(filePath, { bigint: true })
      .catch(error => {
        if (isMissingExpectedFile(error)) {
          return undefined
        }
        throw error
      })
    await fileGuard()
    if (fileStats === undefined) {
      drift.push({ path: file.path, kind: 'missing' })
      continue
    }
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
      drift.push({ path: file.path, kind: 'changed' })
      continue
    }
    if (
      fileStats.size !== BigInt(Buffer.byteLength(file.contents, 'utf8')) ||
      (await hashFile(
        filePath,
        fileStats,
        Buffer.byteLength(file.contents, 'utf8'),
        fileGuard
      )) !== hashBuildText(file.contents)
    ) {
      drift.push({ path: file.path, kind: 'changed' })
    }
  }
  for (const file of actual.files) {
    if (!expectedFiles.has(file)) {
      drift.push({ path: file, kind: 'unexpected' })
    }
  }
  for (const childDirectory of actual.directories) {
    if (!expectedDirectoriesForFiles.has(childDirectory)) {
      drift.push({ path: childDirectory, kind: 'unexpected' })
    }
  }
  for (const symbolicLink of actual.symbolicLinks) {
    if (!expectedFiles.has(symbolicLink)) {
      drift.push({ path: symbolicLink, kind: 'unexpected' })
    }
  }
  drift.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind)
  )
  await epochs.verifyAll()
  return drift.length === 0
    ? { status: 'current', paths: [] }
    : { status: 'drift', paths: drift }
}

async function verifyBuildOutputTree(
  directory: string,
  files: readonly PipelineFile[],
  rootDirectory: string,
  expectedStats: BigIntStats,
  parentGuard: OutputPathGuard,
  failureMessage: string
): Promise<OutputPathGuard> {
  const { guard } = await captureOutputRootGuard(
    directory,
    parentGuard,
    expectedStats
  )
  const state = await inspectBuildOutput(directory, files, rootDirectory)
  await guard()
  if (state.status !== 'current') {
    throw new Error(failureMessage)
  }
  return guard
}

export async function installBuildOutput(
  directory: string,
  files: readonly PipelineFile[],
  sourceId: string,
  rootDirectory: string
): Promise<'written' | 'current'> {
  const manifest = validateBuildCandidate(files)
  if (manifest.source.id !== sourceId) {
    throw new Error(
      `Build output manifest belongs to source "${manifest.source.id}", not "${sourceId}".`
    )
  }
  const parent = path.dirname(directory)
  const name = path.basename(directory)
  await checkOutputParent(rootDirectory, directory, true)
  const parentSnapshot = await checkOutputParent(
    rootDirectory,
    directory,
    false
  )
  const guard = () => assertOutputPathSnapshot(parentSnapshot)
  const lock = path.join(parent, buildOutputLockName(name))
  await guard()
  const lockHandle = await fs.open(lock, 'wx').catch(error => {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'EEXIST'
    ) {
      throw new Error(`Another Primitree build holds the output lock: ${lock}`)
    }
    throw error
  })
  const lockStats = await bindOutputLock(lockHandle, lock, guard)
  const runLockedInstall = async (): Promise<'written' | 'current'> => {
    await guard()
    const parentStats = await runGuardedPathOperation(guard, () =>
      fs.lstat(parent, { bigint: true })
    )
    const backupScanGuard = createOutputRootGuard(parent, parentStats, guard)
    await backupScanGuard()
    const interruptedBackups = await findInterruptedBackups(
      parent,
      name,
      backupScanGuard
    )
    await backupScanGuard()
    if (interruptedBackups.length > 0) {
      throw new Error(
        `Primitree found one or more backups from an interrupted build. Check these paths before running the build again: ${interruptedBackups.join(', ')}`
      )
    }
    await guard()
    const state = await inspectBuildOutput(directory, files, rootDirectory)
    await guard()
    if (state.status === 'current') {
      return 'current'
    }
    let stats = await fs.lstat(directory, { bigint: true }).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    await guard()
    if (
      stats !== undefined &&
      !(await isEmptyOutputDirectory(directory, guard, stats, parentSnapshot))
    ) {
      await verifyOwnedOutput(directory, sourceId, guard, stats, parentSnapshot)
    }
    await guard()
    const stage = await fs.mkdtemp(
      path.join(parent, buildOutputStagePrefix(name))
    )
    await guard()
    const stageStats = await fs.lstat(stage, { bigint: true })
    let stageExists = true
    const runPreparedInstall = async (): Promise<'written'> => {
      await guard()
      await writePipelineFiles(stage, [...files])
      await guard()
      await verifyBuildOutputTree(
        stage,
        files,
        rootDirectory,
        stageStats,
        guard,
        'Prepared build output does not match its manifest.'
      )

      stats = await fs.lstat(directory, { bigint: true }).catch(error => {
        if (isMissing(error)) {
          return undefined
        }
        throw error
      })
      await guard()
      if (stats === undefined) {
        await setOutputDirectoryMode(
          stage,
          DIRECTORY_PERMISSION_BITS & ~process.umask()
        )
        await verifyBuildOutputTree(
          stage,
          files,
          rootDirectory,
          stageStats,
          guard,
          'Prepared build output does not match its manifest.'
        )
        await guard()
        await fs.rename(stage, directory)
        stageExists = false
        const installedGuard = await verifyBuildOutputTree(
          directory,
          files,
          rootDirectory,
          stageStats,
          guard,
          'Prepared build output does not match its manifest.'
        )
        await installedGuard()
        return 'written'
      }
      if (
        !(await isEmptyOutputDirectory(directory, guard, stats, parentSnapshot))
      ) {
        await verifyOwnedOutput(
          directory,
          sourceId,
          guard,
          stats,
          parentSnapshot
        )
      }
      const backup = path.join(
        parent,
        buildOutputBackupName(name, randomUUID())
      )
      await guard()
      await fs.rename(directory, backup)
      await guard()
      let outputMode: number
      let backupGuard: OutputPathGuard | undefined
      let backupStats: BigIntStats | undefined
      try {
        backupStats = await fs.lstat(backup, { bigint: true })
        backupGuard = createOutputRootGuard(backup, backupStats, guard)
        await backupGuard()
        outputMode = Number(backupStats.mode)
        if (
          !(await isEmptyOutputDirectory(
            backup,
            guard,
            backupStats,
            parentSnapshot
          ))
        ) {
          await verifyOwnedOutput(
            backup,
            sourceId,
            guard,
            backupStats,
            parentSnapshot
          )
        }
      } catch (error) {
        return restorePriorOutput(backup, directory, error, guard, backupStats)
      }
      let installedGuard: OutputPathGuard | undefined
      try {
        await setOutputDirectoryMode(stage, outputMode)
        await verifyBuildOutputTree(
          stage,
          files,
          rootDirectory,
          stageStats,
          guard,
          'Prepared build output does not match its manifest.'
        )
        await guard()
        await fs.rename(stage, directory)
        stageExists = false
        installedGuard = await verifyBuildOutputTree(
          directory,
          files,
          rootDirectory,
          stageStats,
          guard,
          'Prepared build output does not match its manifest.'
        )
        await installedGuard()
      } catch (error) {
        return restorePriorOutput(backup, directory, error, guard, backupStats)
      }
      await guard()
      await installedGuard()
      await backupGuard()
      if (backupStats === undefined) {
        throw new Error(
          `Primitree installed the build output and retained the prior output because cleanup could not verify its path: ${parent}`
        )
      }
      await removeVerifiedPath(
        backup,
        backupStats,
        parent,
        name,
        guard,
        true,
        'Primitree installed the build output and retained the prior output because cleanup could not verify its path'
      )
      await guard()
      await installedGuard()
      return 'written'
    }
    let stageResult: 'written' | undefined
    let stageFailed = false
    let stageFailure: unknown
    try {
      stageResult = await runPreparedInstall()
    } catch (error) {
      stageFailed = true
      stageFailure = error
    }
    let stageCleanupError: unknown
    if (stageExists) {
      try {
        await removeVerifiedPath(
          stage,
          stageStats,
          parent,
          name,
          guard,
          true,
          'Primitree could not remove prepared build output'
        )
      } catch (error) {
        stageCleanupError = error
      }
    }
    const cleanupMessage =
      stageCleanupError instanceof Error
        ? stageCleanupError.message
        : `Primitree could not remove prepared build output: ${parent}`
    if (stageFailed) {
      if (stageCleanupError !== undefined) {
        const failureMessage =
          stageFailure instanceof Error
            ? stageFailure.message
            : String(stageFailure)
        throw new Error(`${failureMessage}\n${cleanupMessage}`, {
          cause: new AggregateError([stageFailure, stageCleanupError]),
        })
      }
      throw stageFailure
    }
    if (stageCleanupError !== undefined) {
      throw new Error(cleanupMessage, { cause: stageCleanupError })
    }
    if (stageResult === undefined) {
      throw new Error('Prepared build output did not return a result.')
    }
    return stageResult
  }

  let operationResult: 'written' | 'current' | undefined
  let operationFailed = false
  let operationFailure: unknown
  try {
    operationResult = await runLockedInstall()
  } catch (error) {
    operationFailed = true
    operationFailure = error
  }
  const cleanupErrors: unknown[] = []
  try {
    await lockHandle.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    await removeVerifiedPath(
      lock,
      lockStats,
      parent,
      name,
      guard,
      false,
      'Primitree could not release the output lock'
    )
  } catch (error) {
    cleanupErrors.push(error)
  }
  const lockCleanupError = cleanupErrors.find(
    error =>
      error instanceof Error &&
      error.message.startsWith('Primitree could not release the output lock:')
  )
  const lockCleanupMessage =
    lockCleanupError instanceof Error
      ? lockCleanupError.message
      : `Primitree could not release the output lock: ${parent}`
  if (operationFailed) {
    if (cleanupErrors.length > 0) {
      const operationMessage =
        operationFailure instanceof Error
          ? operationFailure.message
          : String(operationFailure)
      throw new Error(`${operationMessage}\n${lockCleanupMessage}`, {
        cause: new AggregateError([operationFailure, ...cleanupErrors]),
      })
    }
    throw operationFailure
  }
  if (cleanupErrors.length > 0) {
    throw new Error(lockCleanupMessage, {
      cause:
        cleanupErrors.length === 1
          ? cleanupErrors[0]
          : new AggregateError(cleanupErrors),
    })
  }
  if (operationResult === undefined) {
    throw new Error('Build output installation did not return a result.')
  }
  return operationResult
}
