import fs from 'node:fs/promises'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSourceId } from '@primitree/core'
import { createPolicy, type Policy } from '@primitree/core/policy'
import {
  buildOutputBackupPrefix,
  buildOutputLockName,
  buildOutputStagePrefix,
  MAX_BUILD_OUTPUT_NAME_BYTES,
} from '../build-output-paths'
import type { PrimitreeOutputFormat } from '../config'
import {
  hasLoneUtf16Surrogate,
  isUnsafePortablePathSegment,
  portablePathComparisonKey,
} from '../portable-path'
import {
  configuredSourceFileFingerprint,
  retainConfiguredSourceFileFingerprint,
  type ConfiguredSourceFileFingerprint,
} from './source-snapshot'

interface LoadPrimitreeConfigOptions {
  readonly cwd?: string
  readonly configPath?: string
}

export interface LoadedDTCGSourceConfig {
  readonly type: 'dtcg'
  readonly file: string
  readonly architecture: {
    readonly layers: Policy['layers']
  }
  readonly ownership: Policy['ownership']
  readonly outputs?: {
    readonly directory: string
    readonly formats: readonly PrimitreeOutputFormat[]
  }
}

export interface LoadedPrimitreeConfig {
  readonly schemaVersion: 1
  readonly configPath: string
  readonly sources: Readonly<Record<string, LoadedDTCGSourceConfig>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  location: string
): void {
  const allowedFields = new Set(allowed)
  const unknown = Object.keys(value).filter(key => !allowedFields.has(key))
  if (unknown.length > 0) {
    throw new Error(
      `${location} contains unsupported ${unknown.length === 1 ? 'field' : 'fields'}: ${unknown.join(', ')}.`
    )
  }
}

const PATH_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const OUTPUT_FORMAT_ORDER = [
  'dtcg',
  'css',
  'typescript',
  'tailwind',
] as const satisfies readonly PrimitreeOutputFormat[]

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

function configuredPathLabel(
  configDirectory: string,
  configuredPath: string
): string {
  return path
    .relative(configDirectory, configuredPath)
    .split(path.sep)
    .join('/')
}

interface OutputDirectoryEntry {
  readonly sourceId: string
  readonly directory: string
  readonly comparisonDirectory: string
  readonly order: number
}

interface SourceFileEntry {
  readonly sourceId: string
  readonly file: string
  readonly comparisonFile: string
  readonly followedLink: boolean
  readonly fingerprint?: ConfiguredSourceFileFingerprint
  readonly order: number
}

interface ConfiguredPathEntry {
  readonly sourceId: string
  readonly configuredPath: string
  readonly comparisonPath: string
  readonly kind: 'output directory' | 'token file'
  readonly order: number
}

interface OrderedConfiguredPath {
  readonly entry: ConfiguredPathEntry
  readonly key: string
}

function firstConfiguredPathAtOrAfter(
  entries: readonly OrderedConfiguredPath[],
  key: string
): OrderedConfiguredPath | undefined {
  let low = 0
  let high = entries.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const candidate = entries[middle]
    if (candidate !== undefined && candidate.key < key) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return entries[low]
}

function rejectReservedOutputPaths(
  configDirectory: string,
  outputDirectories: readonly OutputDirectoryEntry[],
  sourceFiles: readonly SourceFileEntry[]
): void {
  const configuredPaths: ConfiguredPathEntry[] = [
    ...outputDirectories.map(entry => ({
      sourceId: entry.sourceId,
      configuredPath: entry.directory,
      comparisonPath: entry.comparisonDirectory,
      kind: 'output directory' as const,
      order: entry.order,
    })),
    ...sourceFiles.map(entry => ({
      sourceId: entry.sourceId,
      configuredPath: entry.file,
      comparisonPath: entry.comparisonFile,
      kind: 'token file' as const,
      order: outputDirectories.length + entry.order,
    })),
  ]
  const ordered = configuredPaths
    .map(entry => ({
      entry,
      key: portablePathComparisonKey(entry.comparisonPath),
    }))
    .sort((left, right) =>
      left.key === right.key
        ? left.entry.order - right.entry.order
        : left.key < right.key
          ? -1
          : 1
    )

  for (const owner of outputDirectories) {
    const parent = path.dirname(owner.comparisonDirectory)
    const name = path.basename(owner.comparisonDirectory)
    const lockKey = portablePathComparisonKey(
      path.join(parent, buildOutputLockName(name))
    )
    const lockCandidate = firstConfiguredPathAtOrAfter(ordered, lockKey)
    let candidate = lockCandidate?.key === lockKey ? lockCandidate : undefined
    if (candidate === undefined) {
      const lockDescendantKey = `${lockKey}${path.sep}`
      const lockDescendant = firstConfiguredPathAtOrAfter(
        ordered,
        lockDescendantKey
      )
      if (lockDescendant?.key.startsWith(lockDescendantKey) === true) {
        candidate = lockDescendant
      }
    }
    if (candidate === undefined) {
      for (const reservedName of [
        buildOutputStagePrefix(name),
        buildOutputBackupPrefix(name),
      ]) {
        const reservedKey = portablePathComparisonKey(
          path.join(parent, reservedName)
        )
        const reservedCandidate = firstConfiguredPathAtOrAfter(
          ordered,
          reservedKey
        )
        if (reservedCandidate?.key.startsWith(reservedKey) === true) {
          candidate = reservedCandidate
          break
        }
      }
    }

    if (candidate !== undefined) {
      throw new Error(
        `Source "${candidate.entry.sourceId}" ${candidate.entry.kind} "${configuredPathLabel(configDirectory, candidate.entry.configuredPath)}" uses a path reserved for source "${owner.sourceId}" output directory "${configuredPathLabel(configDirectory, owner.directory)}".`
      )
    }
  }
}

function rejectOverlappingOutputDirectories(
  configDirectory: string,
  entries: readonly OutputDirectoryEntry[]
): void {
  const ordered = entries
    .map(entry => ({
      entry,
      key: `${portablePathComparisonKey(entry.comparisonDirectory)}${path.sep}`,
    }))
    .sort((left, right) =>
      left.key === right.key
        ? left.entry.order - right.entry.order
        : left.key < right.key
          ? -1
          : 1
    )

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    if (
      previous === undefined ||
      current === undefined ||
      (current.key !== previous.key && !current.key.startsWith(previous.key))
    ) {
      continue
    }
    const later =
      current.entry.order > previous.entry.order
        ? current.entry
        : previous.entry
    const earlier = later === current.entry ? previous.entry : current.entry
    throw new Error(
      `Source "${later.sourceId}" output directory "${configuredPathLabel(configDirectory, later.directory)}" overlaps source "${earlier.sourceId}" output directory "${configuredPathLabel(configDirectory, earlier.directory)}".`
    )
  }
}

function rejectOutputDirectoriesContainingSourceFiles(
  configDirectory: string,
  outputDirectories: readonly OutputDirectoryEntry[],
  sourceFiles: readonly SourceFileEntry[]
): void {
  const sources = sourceFiles
    .map(entry => ({
      entry,
      key: `${portablePathComparisonKey(entry.comparisonFile)}${path.sep}`,
    }))
    .sort((left, right) =>
      left.key === right.key
        ? left.entry.order - right.entry.order
        : left.key < right.key
          ? -1
          : 1
    )
  const sourceByKey = new Map<string, SourceFileEntry>()
  for (const source of sources) {
    if (!sourceByKey.has(source.key)) {
      sourceByKey.set(source.key, source.entry)
    }
  }

  for (const output of outputDirectories) {
    const outputKey = `${portablePathComparisonKey(output.comparisonDirectory)}${path.sep}`
    let sourceAncestor: SourceFileEntry | undefined
    for (
      let end = outputKey.indexOf(path.sep);
      end >= 0;
      end = outputKey.indexOf(path.sep, end + 1)
    ) {
      sourceAncestor = sourceByKey.get(outputKey.slice(0, end + 1))
      if (sourceAncestor !== undefined) {
        break
      }
    }
    if (sourceAncestor !== undefined) {
      const samePath =
        `${portablePathComparisonKey(sourceAncestor.comparisonFile)}${path.sep}` ===
        outputKey
      throw new Error(
        sourceAncestor.followedLink
          ? `Source "${sourceAncestor.sourceId}" token file "${configuredPathLabel(configDirectory, sourceAncestor.file)}" resolves to a path that contains source "${output.sourceId}" output directory "${configuredPathLabel(configDirectory, output.directory)}".`
          : samePath
            ? `Source "${output.sourceId}" output directory "${configuredPathLabel(configDirectory, output.directory)}" cannot contain source "${sourceAncestor.sourceId}" token file "${configuredPathLabel(configDirectory, sourceAncestor.file)}".`
            : `Source "${sourceAncestor.sourceId}" token file path "${configuredPathLabel(configDirectory, sourceAncestor.file)}" cannot contain source "${output.sourceId}" output directory "${configuredPathLabel(configDirectory, output.directory)}".`
      )
    }

    let low = 0
    let high = sources.length
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2)
      const candidate = sources[middle]
      if (candidate !== undefined && candidate.key < outputKey) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    const containedSource = sources[low]
    if (containedSource?.key.startsWith(outputKey) === true) {
      throw new Error(
        containedSource.entry.followedLink
          ? `Source "${containedSource.entry.sourceId}" token file "${configuredPathLabel(configDirectory, containedSource.entry.file)}" resolves inside source "${output.sourceId}" output directory "${configuredPathLabel(configDirectory, output.directory)}".`
          : `Source "${output.sourceId}" output directory "${configuredPathLabel(configDirectory, output.directory)}" cannot contain source "${containedSource.entry.sourceId}" token file "${configuredPathLabel(configDirectory, containedSource.entry.file)}".`
      )
    }
  }
}

async function rejectOutputSymlinks(
  sourceId: string,
  configDirectory: string,
  outputDirectory: string
): Promise<void> {
  const relative = path.relative(configDirectory, outputDirectory)
  let current = configDirectory
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current).catch(error => {
      if (isMissing(error)) {
        return undefined
      }
      throw error
    })
    if (stats === undefined) {
      return
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Source "${sourceId}" output directory cannot use a symbolic link.`
      )
    }
  }
}

const MAX_SOURCE_LINKS = 40
const MAX_SOURCE_PATH_RESOLUTION_CONCURRENCY = 16

async function resolveSourceComparisonPath(
  sourceId: string,
  configDirectory: string,
  comparisonConfigDirectory: string,
  sourceFile: string
): Promise<{
  readonly path: string
  readonly followedLink: boolean
  readonly fingerprint?: ConfiguredSourceFileFingerprint
}> {
  let candidate = path.resolve(
    comparisonConfigDirectory,
    path.relative(configDirectory, sourceFile)
  )
  let followedAnyLink = false
  for (let linkCount = 0; linkCount <= MAX_SOURCE_LINKS; linkCount += 1) {
    const root = path.parse(candidate).root
    const segments = candidate
      .slice(root.length)
      .split(path.sep)
      .filter(segment => segment.length > 0)
    let current = root
    let followedLink = false
    let finalFingerprint: ConfiguredSourceFileFingerprint | undefined

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) {
        continue
      }
      current = path.join(current, segment)
      const stats = await fs.lstat(current, { bigint: true }).catch(error => {
        if (isMissing(error)) {
          return undefined
        }
        throw error
      })
      if (stats === undefined) {
        return { path: candidate, followedLink: followedAnyLink }
      }
      if (!stats.isSymbolicLink()) {
        if (index === segments.length - 1 && stats.isFile()) {
          finalFingerprint = configuredSourceFileFingerprint(stats)
        }
        continue
      }
      if (linkCount === MAX_SOURCE_LINKS) {
        throw new Error(
          `Source "${sourceId}" token file uses too many symbolic links.`
        )
      }
      const target = await fs.readlink(current)
      candidate = path.resolve(
        path.dirname(current),
        target,
        ...segments.slice(index + 1)
      )
      followedAnyLink = true
      followedLink = true
      break
    }

    if (!followedLink) {
      return {
        path: candidate,
        followedLink: followedAnyLink,
        ...(finalFingerprint === undefined
          ? {}
          : { fingerprint: finalFingerprint }),
      }
    }
  }

  throw new Error(
    `Source "${sourceId}" token file uses too many symbolic links.`
  )
}

async function resolveSourceComparisonPaths(
  configDirectory: string,
  comparisonConfigDirectory: string,
  sourceFiles: readonly SourceFileEntry[]
): Promise<readonly SourceFileEntry[]> {
  const compared = [...sourceFiles]
  let nextIndex = 0
  let failed = false
  let failure: unknown
  const workers = Array.from(
    {
      length: Math.min(
        MAX_SOURCE_PATH_RESOLUTION_CONCURRENCY,
        sourceFiles.length
      ),
    },
    async () => {
      while (!failed && nextIndex < sourceFiles.length) {
        const index = nextIndex
        nextIndex += 1
        const sourceFile = sourceFiles[index]
        if (sourceFile === undefined) {
          continue
        }
        try {
          const resolved = await resolveSourceComparisonPath(
            sourceFile.sourceId,
            configDirectory,
            comparisonConfigDirectory,
            sourceFile.file
          )
          compared[index] = {
            ...sourceFile,
            comparisonFile: resolved.path,
            followedLink: resolved.followedLink,
            ...(resolved.fingerprint === undefined
              ? {}
              : { fingerprint: resolved.fingerprint }),
          }
        } catch (error) {
          if (!failed) {
            failed = true
            failure = error
          }
        }
      }
    }
  )
  await Promise.all(workers)
  if (failed) {
    throw failure
  }
  return compared
}

function resolveSourceFile(
  configuredPath: unknown,
  sourceId: string,
  configDirectory: string
): string {
  if (
    typeof configuredPath !== 'string' ||
    configuredPath.trim().length === 0
  ) {
    throw new Error(`Source "${sourceId}" needs a file path.`)
  }
  if (
    configuredPath.includes('\u0000') ||
    path.isAbsolute(configuredPath) ||
    configuredPath.startsWith('\\\\') ||
    configuredPath.startsWith('//') ||
    PATH_SCHEME_PATTERN.test(configuredPath)
  ) {
    throw new Error(
      `Source "${sourceId}" file must be relative to the config file.`
    )
  }
  if (hasLoneUtf16Surrogate(configuredPath)) {
    throw new Error(`Source "${sourceId}" file contains invalid Unicode.`)
  }
  return path.resolve(configDirectory, configuredPath)
}

function normalizeOutputs(
  value: unknown,
  sourceId: string,
  configDirectory: string,
  sourceFile: string
): LoadedDTCGSourceConfig['outputs'] {
  if (value === undefined) {
    return undefined
  }
  if (!isRecord(value)) {
    throw new Error(`Source "${sourceId}" outputs must be an object.`)
  }
  rejectUnknownFields(
    value,
    ['directory', 'formats'],
    `Source "${sourceId}" outputs`
  )
  const configuredDirectory = value.directory
  if (
    typeof configuredDirectory !== 'string' ||
    configuredDirectory.trim().length === 0
  ) {
    throw new Error(`Source "${sourceId}" outputs need a directory.`)
  }
  if (
    configuredDirectory.includes('\\') ||
    path.isAbsolute(configuredDirectory) ||
    configuredDirectory.startsWith('//')
  ) {
    throw new Error(
      `Source "${sourceId}" output directory must stay below the config directory.`
    )
  }
  const segments = configuredDirectory.split('/')
  const unsafeSegment = segments.find(
    segment =>
      segment !== '.' &&
      segment !== '..' &&
      isUnsafePortablePathSegment(segment)
  )
  if (unsafeSegment !== undefined) {
    throw new Error(
      `Source "${sourceId}" output directory has an unsafe path segment: ${JSON.stringify(unsafeSegment)}.`
    )
  }
  if (segments.some(segment => segment === '..')) {
    throw new Error(
      `Source "${sourceId}" output directory must stay below the config directory.`
    )
  }
  const directory = path.resolve(configDirectory, configuredDirectory)
  if (directory === configDirectory) {
    throw new Error(
      `Source "${sourceId}" output directory cannot be the config directory.`
    )
  }
  const outputNameBytes = Buffer.byteLength(path.basename(directory), 'utf8')
  if (outputNameBytes > MAX_BUILD_OUTPUT_NAME_BYTES) {
    throw new Error(
      `Source "${sourceId}" output directory name is ${outputNameBytes} UTF-8 bytes; use at most ${MAX_BUILD_OUTPUT_NAME_BYTES} UTF-8 bytes so Primitree can create its lock, staging, and backup paths.`
    )
  }
  const sourceFromOutput = path.relative(directory, sourceFile)
  if (
    sourceFromOutput === '' ||
    (!sourceFromOutput.startsWith(`..${path.sep}`) &&
      sourceFromOutput !== '..' &&
      !path.isAbsolute(sourceFromOutput))
  ) {
    throw new Error(
      `Source "${sourceId}" output directory cannot contain its token file.`
    )
  }

  const configuredFormats = value.formats ?? OUTPUT_FORMAT_ORDER
  if (!Array.isArray(configuredFormats) || configuredFormats.length === 0) {
    throw new Error(`Source "${sourceId}" outputs need at least one format.`)
  }
  const selected = new Set<PrimitreeOutputFormat>()
  for (const format of configuredFormats) {
    if (
      typeof format !== 'string' ||
      !OUTPUT_FORMAT_ORDER.includes(format as PrimitreeOutputFormat)
    ) {
      throw new Error(
        `Source "${sourceId}" has an unsupported output format: ${String(format)}.`
      )
    }
    if (selected.has(format as PrimitreeOutputFormat)) {
      throw new Error(`Source "${sourceId}" repeats output format "${format}".`)
    }
    selected.add(format as PrimitreeOutputFormat)
  }

  return Object.freeze({
    directory,
    formats: Object.freeze(
      OUTPUT_FORMAT_ORDER.filter(format => selected.has(format))
    ),
  })
}

function normalizeSource(
  sourceId: string,
  value: unknown,
  configDirectory: string
): LoadedDTCGSourceConfig {
  if (!createSourceId(sourceId).ok) {
    throw new Error(`Invalid source name "${sourceId}".`)
  }
  if (!isRecord(value)) {
    throw new Error(`Source "${sourceId}" must be an object.`)
  }
  rejectUnknownFields(
    value,
    ['type', 'file', 'architecture', 'ownership', 'outputs'],
    `Source "${sourceId}"`
  )
  if (value.type !== 'dtcg') {
    throw new Error(`Source "${sourceId}" type must be "dtcg".`)
  }
  if (!isRecord(value.architecture)) {
    throw new Error(`Source "${sourceId}" needs architecture settings.`)
  }
  rejectUnknownFields(
    value.architecture,
    ['layers'],
    `Source "${sourceId}" architecture`
  )
  if (!Array.isArray(value.architecture.layers)) {
    throw new Error(`Source "${sourceId}" needs one to four layers.`)
  }
  const layers = value.architecture.layers.map((layer, index) => {
    if (!isRecord(layer)) {
      throw new Error(
        `Source "${sourceId}" layer ${index + 1} must be an object.`
      )
    }
    rejectUnknownFields(
      layer,
      ['id', 'roots', 'values', 'references'],
      `Source "${sourceId}" layer ${index + 1}`
    )
    return { ...layer, references: layer.references ?? [] }
  })
  if (value.ownership !== undefined) {
    if (!isRecord(value.ownership)) {
      throw new Error(`Source "${sourceId}" ownership must be an object.`)
    }
    rejectUnknownFields(
      value.ownership,
      ['default', 'paths'],
      `Source "${sourceId}" ownership`
    )
  }

  const policy = createPolicy({
    id: sourceId,
    viewId: sourceId,
    layers,
    ownership: value.ownership,
  })
  if (!policy.ok) {
    throw new Error(
      `Source "${sourceId}" is invalid: ${policy.diagnostics[0].message}`
    )
  }
  const sourceFile = resolveSourceFile(value.file, sourceId, configDirectory)
  const outputs = normalizeOutputs(
    value.outputs,
    sourceId,
    configDirectory,
    sourceFile
  )
  return Object.freeze({
    type: 'dtcg',
    file: sourceFile,
    architecture: Object.freeze({ layers: policy.value.layers }),
    ownership: policy.value.ownership,
    ...(outputs === undefined ? {} : { outputs }),
  })
}

export async function loadPrimitreeConfig(
  options: LoadPrimitreeConfigOptions = {}
): Promise<LoadedPrimitreeConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const configPath = path.resolve(
    cwd,
    options.configPath ?? 'primitree.config.ts'
  )
  const configLabel = options.configPath ?? 'primitree.config.ts'
  const stats = await fs.stat(configPath).catch(() => undefined)
  if (stats === undefined || !stats.isFile()) {
    throw new Error(`Could not read Primitree config: ${configLabel}`)
  }

  const moduleUrl = pathToFileURL(configPath)
  moduleUrl.searchParams.set('loaded', `${Date.now()}-${Math.random()}`)
  const hooks =
    path.extname(configPath) === '.ts'
      ? registerHooks({
          load(url, context, nextLoad) {
            return nextLoad(
              url,
              url === moduleUrl.href
                ? { ...context, format: 'module-typescript' }
                : context
            )
          },
        })
      : undefined
  let imported: { default?: unknown }
  try {
    imported = (await import(moduleUrl.href)) as { default?: unknown }
  } catch {
    throw new Error(`Could not load Primitree config: ${configLabel}`)
  } finally {
    hooks?.deregister()
  }
  if (!isRecord(imported.default)) {
    throw new Error('Primitree config must have a default object export.')
  }
  const config = imported.default
  rejectUnknownFields(config, ['schemaVersion', 'sources'], 'Primitree config')
  if (config.schemaVersion !== 1) {
    throw new Error('Primitree config schemaVersion must be 1.')
  }
  if (!isRecord(config.sources) || Object.keys(config.sources).length === 0) {
    throw new Error('Primitree config needs at least one named source.')
  }

  const sources: Record<string, LoadedDTCGSourceConfig> = Object.create(null)
  const configDirectory = path.dirname(configPath)
  const comparisonConfigDirectory = await fs.realpath(configDirectory)
  const outputDirectories: OutputDirectoryEntry[] = []
  const sourceFiles: SourceFileEntry[] = []
  const normalizedSources: Array<{
    readonly sourceId: string
    readonly source: LoadedDTCGSourceConfig
  }> = []
  for (const [sourceId, value] of Object.entries(config.sources)) {
    const source = normalizeSource(sourceId, value, configDirectory)
    if (source.outputs !== undefined) {
      await rejectOutputSymlinks(
        sourceId,
        configDirectory,
        source.outputs.directory
      )
      outputDirectories.push({
        sourceId,
        directory: source.outputs.directory,
        comparisonDirectory: path.resolve(
          comparisonConfigDirectory,
          path.relative(configDirectory, source.outputs.directory)
        ),
        order: outputDirectories.length,
      })
    }
    sourceFiles.push({
      sourceId,
      file: source.file,
      comparisonFile: source.file,
      followedLink: false,
      order: sourceFiles.length,
    })
    normalizedSources.push({ sourceId, source })
  }
  const comparedSourceFiles =
    outputDirectories.length === 0
      ? sourceFiles
      : await resolveSourceComparisonPaths(
          configDirectory,
          comparisonConfigDirectory,
          sourceFiles
        )
  rejectOverlappingOutputDirectories(configDirectory, outputDirectories)
  rejectReservedOutputPaths(
    configDirectory,
    outputDirectories,
    comparedSourceFiles
  )
  rejectOutputDirectoriesContainingSourceFiles(
    configDirectory,
    outputDirectories,
    comparedSourceFiles
  )
  for (let index = 0; index < normalizedSources.length; index += 1) {
    const normalized = normalizedSources[index]
    if (normalized === undefined) {
      continue
    }
    const fingerprint = comparedSourceFiles[index]?.fingerprint
    if (fingerprint !== undefined) {
      retainConfiguredSourceFileFingerprint(normalized.source, fingerprint)
    }
    Object.defineProperty(sources, normalized.sourceId, {
      value: normalized.source,
      enumerable: true,
    })
  }
  return Object.freeze({
    schemaVersion: 1,
    configPath,
    sources: Object.freeze(sources),
  })
}
