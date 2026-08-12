import fs from 'node:fs/promises'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSourceId } from '@primitree/core'
import { createPolicy, type Policy } from '@primitree/core/policy'
import type { PrimitreeOutputFormat } from '../config'

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
const WINDOWS_INVALID_PATH_CHARACTER = /[<>:"|?*]/u
const WINDOWS_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu
const OUTPUT_FORMAT_ORDER = [
  'dtcg',
  'css',
  'typescript',
  'tailwind',
] as const satisfies readonly PrimitreeOutputFormat[]

function hasControlText(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function isUnsafeOutputSegment(segment: string): boolean {
  return (
    WINDOWS_INVALID_PATH_CHARACTER.test(segment) ||
    WINDOWS_DEVICE_NAME.test(segment) ||
    hasControlText(segment) ||
    segment.endsWith('.') ||
    segment.endsWith(' ')
  )
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  )
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
      segment !== '.' && segment !== '..' && isUnsafeOutputSegment(segment)
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
  for (const [sourceId, value] of Object.entries(config.sources)) {
    const source = normalizeSource(sourceId, value, path.dirname(configPath))
    if (source.outputs !== undefined) {
      await rejectOutputSymlinks(
        sourceId,
        path.dirname(configPath),
        source.outputs.directory
      )
    }
    Object.defineProperty(sources, sourceId, {
      value: source,
      enumerable: true,
    })
  }
  return Object.freeze({
    schemaVersion: 1,
    configPath,
    sources: Object.freeze(sources),
  })
}
