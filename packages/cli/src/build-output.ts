import { createHash, randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PipelineFile } from '@primitree/dtcg'
import { writePipelineFiles } from './io'
import {
  BUILD_MANIFEST_PATH,
  hashBuildText,
  MAX_BUILD_FILE_BYTES,
  parseBuildManifest,
} from './output-manifest'

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
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

function hasControlText(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
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
      hasControlText(file.path) ||
      segments.some(
        segment =>
          segment.length === 0 ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':') ||
          segment.endsWith('.') ||
          segment.endsWith(' ') ||
          WINDOWS_DEVICE_NAME.test(segment)
      )
    ) {
      throw new Error(`Unsafe build output path: ${JSON.stringify(file.path)}.`)
    }
    const key = file.path.normalize('NFC').toLowerCase()
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

async function listOutputPaths(directory: string): Promise<{
  readonly files: readonly string[]
  readonly directories: readonly string[]
}> {
  const files: string[] = []
  const directories: string[] = []
  const pending = [{ absolute: directory, relative: '' }]
  let count = 0

  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) {
      break
    }
    const entries = await fs.opendir(current.absolute)
    for await (const entry of entries) {
      count += 1
      if (count > MAX_OUTPUT_ENTRIES) {
        throw new Error('Build output can contain at most 100,000 entries.')
      }
      const relative = path.posix.join(current.relative, entry.name)
      const absolute = path.join(current.absolute, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Build output cannot contain a symbolic link: ${relative}`
        )
      }
      if (entry.isDirectory()) {
        directories.push(`${relative}/`)
        pending.push({ absolute, relative })
      } else if (entry.isFile()) {
        files.push(relative)
      } else {
        throw new Error(
          `Build output path is not a file or directory: ${relative}`
        )
      }
    }
  }

  return {
    files: files.sort(),
    directories: directories.sort(),
  }
}

function isSameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function readManifestText(
  manifestPath: string,
  expectedStats: Stats
): Promise<string> {
  if (expectedStats.size > MAX_MANIFEST_BYTES) {
    throw new Error('Build output manifest exceeds the 16 MiB limit.')
  }
  const handle = await fs.open(manifestPath, 'r')
  try {
    const openedStats = await handle.stat()
    if (
      !openedStats.isFile() ||
      !isSameFile(expectedStats, openedStats) ||
      openedStats.size > MAX_MANIFEST_BYTES
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
    return Buffer.concat(chunks, total).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function hashFile(
  filePath: string,
  expectedStats: Stats,
  expectedBytes: number
): Promise<string> {
  if (expectedBytes > MAX_BUILD_FILE_BYTES) {
    throw new Error(`Build output file exceeds the 64 MiB limit: ${filePath}`)
  }
  const handle = await fs.open(filePath, 'r')
  try {
    const openedStats = await handle.stat()
    if (
      !openedStats.isFile() ||
      !isSameFile(expectedStats, openedStats) ||
      openedStats.size !== expectedBytes
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
    const finalStats = await handle.stat()
    if (position !== expectedBytes || finalStats.size !== expectedBytes) {
      throw new Error(
        `Primitree found changed build output while reading: ${filePath}`
      )
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

async function checkOutputParent(
  rootDirectory: string,
  outputDirectory: string,
  createMissing: boolean
): Promise<void> {
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
  let current = root
  const rootStats = await fs.lstat(root).catch(error => {
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

  for (const segment of parentSegments) {
    current = path.join(current, segment)
    let stats = await fs.lstat(current).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    if (stats === undefined && createMissing) {
      await fs.mkdir(current).catch(error => {
        if (!isAlreadyExists(error)) {
          throw error
        }
      })
      stats = await fs.lstat(current)
    }
    if (stats === undefined) {
      return
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Build output path cannot use a symbolic link: ${current}`
      )
    }
    if (!stats.isDirectory()) {
      throw new Error(`Build output parent must be a directory: ${current}`)
    }
  }
}

async function isEmptyOutputDirectory(directory: string): Promise<boolean> {
  const stats = await fs.lstat(directory)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      'The configured output path must point to a directory, not a symbolic link.'
    )
  }
  const paths = await listOutputPaths(directory)
  return paths.files.length === 0 && paths.directories.length === 0
}

async function findInterruptedBackups(
  parent: string,
  name: string
): Promise<readonly string[]> {
  const prefix = `.${name}.primitree-backup-`
  const backups: string[] = []
  const entries = await fs.opendir(parent)
  let count = 0
  for await (const entry of entries) {
    count += 1
    if (count > MAX_OUTPUT_ENTRIES) {
      throw new Error(
        'Build output parent can contain at most 100,000 entries.'
      )
    }
    if (entry.name.startsWith(prefix)) {
      backups.push(path.join(parent, entry.name))
    }
  }
  return backups.sort()
}

async function restorePriorOutput(
  backup: string,
  directory: string,
  operationFailure: unknown
): Promise<never> {
  try {
    await fs.rename(backup, directory)
  } catch (restoreFailure) {
    const operationMessage =
      operationFailure instanceof Error
        ? operationFailure.message
        : String(operationFailure)
    const restoreMessage =
      restoreFailure instanceof Error
        ? restoreFailure.message
        : String(restoreFailure)
    throw new Error(
      `${operationMessage}\nPrimitree could not restore the prior build output.\nRestore error: ${restoreMessage}\nCheck this path before running the build again: ${backup}`,
      {
        cause: new AggregateError([operationFailure, restoreFailure]),
      }
    )
  }
  throw operationFailure
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
  sourceId: string
): Promise<void> {
  const manifestPath = path.join(directory, BUILD_MANIFEST_PATH)
  const manifestStats = await fs.lstat(manifestPath).catch(error => {
    if (isMissing(error)) {
      return undefined
    }
    throw error
  })
  if (
    manifestStats === undefined ||
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink()
  ) {
    throw new Error(
      'Existing build output needs a Primitree manifest file and cannot use a symbolic link in its place.'
    )
  }
  const manifest = parseBuildManifest(
    await readManifestText(manifestPath, manifestStats)
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
  const actual = await listOutputPaths(directory)
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
    const stats = await fs.lstat(filePath).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    if (stats === undefined || !stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Refusing to replace missing build output: ${file.path}`)
    }
    if (
      stats.size !== file.bytes ||
      (await hashFile(filePath, stats, file.bytes)) !== file.sha256
    ) {
      throw new Error(`Refusing to replace changed build output: ${file.path}`)
    }
  }
}

export async function inspectBuildOutput(
  directory: string,
  files: readonly PipelineFile[]
): Promise<BuildOutputState> {
  validateBuildCandidate(files)
  const stats = await fs.lstat(directory).catch(error => {
    if (isMissing(error)) {
      return undefined
    }
    throw error
  })
  if (stats === undefined) {
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
  const drift: BuildOutputDrift[] = []
  const expectedFiles = new Set(files.map(file => file.path))
  const expectedDirectoriesForFiles = expectedDirectories(
    files.map(file => file.path)
  )
  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    const filePath = path.join(directory, ...file.path.split('/'))
    const fileStats = await fs.lstat(filePath).catch(error => {
      if (isMissingExpectedFile(error)) {
        return undefined
      }
      throw error
    })
    if (fileStats === undefined) {
      drift.push({ path: file.path, kind: 'missing' })
      continue
    }
    if (fileStats.isDirectory()) {
      drift.push({ path: file.path, kind: 'missing' })
      continue
    }
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
      throw new Error(
        `Build output path must point to a file, not a symbolic link: ${file.path}`
      )
    }
    if (
      fileStats.size !== Buffer.byteLength(file.contents, 'utf8') ||
      (await hashFile(
        filePath,
        fileStats,
        Buffer.byteLength(file.contents, 'utf8')
      )) !== hashBuildText(file.contents)
    ) {
      drift.push({ path: file.path, kind: 'changed' })
    }
  }
  const actual = await listOutputPaths(directory)
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
  drift.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind)
  )
  return drift.length === 0
    ? { status: 'current', paths: [] }
    : { status: 'drift', paths: drift }
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
  await checkOutputParent(rootDirectory, directory, false)
  const lock = path.join(parent, `.${name}.primitree-lock`)
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
  const runLockedInstall = async (): Promise<'written' | 'current'> => {
    const interruptedBackups = await findInterruptedBackups(parent, name)
    if (interruptedBackups.length > 0) {
      throw new Error(
        `Primitree found one or more backups from an interrupted build. Check these paths before running the build again: ${interruptedBackups.join(', ')}`
      )
    }
    const state = await inspectBuildOutput(directory, files)
    if (state.status === 'current') {
      return 'current'
    }
    let stats = await fs.lstat(directory).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    if (stats !== undefined && !(await isEmptyOutputDirectory(directory))) {
      await verifyOwnedOutput(directory, sourceId)
    }
    const stage = await fs.mkdtemp(
      path.join(parent, `.${name}.primitree-stage-`)
    )
    let stageExists = true
    const runPreparedInstall = async (): Promise<'written'> => {
      await writePipelineFiles(stage, [...files])
      const staged = await inspectBuildOutput(stage, files)
      if (staged.status !== 'current') {
        throw new Error('Prepared build output does not match its manifest.')
      }

      stats = await fs.lstat(directory).catch(error => {
        if (isMissing(error)) {
          return undefined
        }
        throw error
      })
      if (stats === undefined) {
        await setOutputDirectoryMode(
          stage,
          DIRECTORY_PERMISSION_BITS & ~process.umask()
        )
        await fs.rename(stage, directory)
        stageExists = false
        return 'written'
      }
      if (!(await isEmptyOutputDirectory(directory))) {
        await verifyOwnedOutput(directory, sourceId)
      }
      const backup = path.join(
        parent,
        `.${name}.primitree-backup-${randomUUID()}`
      )
      await fs.rename(directory, backup)
      let outputMode: number
      try {
        outputMode = (await fs.lstat(backup)).mode
        if (!(await isEmptyOutputDirectory(backup))) {
          await verifyOwnedOutput(backup, sourceId)
        }
      } catch (error) {
        return restorePriorOutput(backup, directory, error)
      }
      try {
        await setOutputDirectoryMode(stage, outputMode)
        await fs.rename(stage, directory)
        stageExists = false
      } catch (error) {
        return restorePriorOutput(backup, directory, error)
      }
      await fs.rm(backup, { recursive: true }).catch(() => {
        throw new Error(
          `Primitree installed the build output and could not remove the prior output: ${backup}`
        )
      })
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
        await fs.rm(stage, { recursive: true, force: true })
      } catch (error) {
        stageCleanupError = error
      }
    }
    const cleanupMessage = `Primitree could not remove prepared build output: ${stage}`
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
    await fs.rm(lock)
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (operationFailed) {
    if (cleanupErrors.length > 0) {
      const operationMessage =
        operationFailure instanceof Error
          ? operationFailure.message
          : String(operationFailure)
      const cleanupMessage = `Primitree could not release the output lock: ${lock}`
      throw new Error(`${operationMessage}\n${cleanupMessage}`, {
        cause: new AggregateError([operationFailure, ...cleanupErrors]),
      })
    }
    throw operationFailure
  }
  if (cleanupErrors.length > 0) {
    throw new Error(`Primitree could not release the output lock: ${lock}`, {
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
