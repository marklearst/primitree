import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSourceId } from '@primitree/core'
import { createPolicy, type Policy } from '@primitree/core/policy'

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
    ['type', 'file', 'architecture', 'ownership'],
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
      throw new Error(`Source "${sourceId}" layer ${index + 1} is invalid.`)
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
  return Object.freeze({
    type: 'dtcg',
    file: resolveSourceFile(value.file, sourceId, configDirectory),
    architecture: Object.freeze({ layers: policy.value.layers }),
    ownership: policy.value.ownership,
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
  const imported = (await import(moduleUrl.href).catch(() => {
    throw new Error(`Could not load Primitree config: ${configLabel}`)
  })) as { default?: unknown }
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
    Object.defineProperty(sources, sourceId, {
      value: normalizeSource(sourceId, value, path.dirname(configPath)),
      enumerable: true,
    })
  }
  return Object.freeze({
    schemaVersion: 1,
    configPath,
    sources: Object.freeze(sources),
  })
}
