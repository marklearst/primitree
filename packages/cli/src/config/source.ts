import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import {
  composeGraph,
  createSourceView,
  resolveView,
  type GraphView,
  type TokenGraph,
} from '@primitree/core'
import { createDTCGGraphFragment } from '@primitree/dtcg'
import { loadPrimitreeConfig, type LoadedDTCGSourceConfig } from './load'

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const SOURCE_READ_BUFFER_BYTES = 64 * 1024

interface LoadConfiguredSourceOptions {
  readonly configPath?: string
  readonly sourceName?: string
}

interface BuildConfiguredSourceGraphOptions {
  readonly file?: string
  readonly label?: string
  readonly provenanceFile?: string
}

export interface ConfiguredSource {
  readonly configPath: string
  readonly sourceName: string
  readonly source: LoadedDTCGSourceConfig
}

export interface ConfiguredSourceGraph {
  readonly configPath: string
  readonly sourceName: string
  readonly source: LoadedDTCGSourceConfig
  readonly document: unknown
  readonly graph: TokenGraph
  readonly view: GraphView
}

function resultError(result: {
  readonly diagnostics: readonly { readonly message: string }[]
}): Error {
  return new Error(result.diagnostics.map(item => item.message).join('\n'))
}

async function readConfiguredJsonFile(
  filePath: string,
  sourceLabel: string
): Promise<unknown> {
  const absolute = path.resolve(filePath)
  const unreadable = () => new Error(`Could not read file: ${absolute}`)
  const handle = await fs
    .open(absolute, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
    .catch(() => {
      throw unreadable()
    })

  let raw: string | undefined
  let readFailed = false
  let readFailure: unknown
  try {
    const stats = await handle.stat().catch(() => {
      throw unreadable()
    })
    if (!stats.isFile()) {
      throw new Error(`Could not read the ${sourceLabel}.`)
    }
    if (stats.size > MAX_SOURCE_BYTES) {
      throw new Error(`The ${sourceLabel} exceeds the 10 MiB file limit.`)
    }

    const chunks: Buffer[] = []
    let position = 0
    while (true) {
      const buffer = Buffer.allocUnsafe(SOURCE_READ_BUFFER_BYTES)
      const { bytesRead } = await handle
        .read(buffer, 0, buffer.length, position)
        .catch(() => {
          throw unreadable()
        })
      if (bytesRead === 0) {
        break
      }
      position += bytesRead
      if (position > MAX_SOURCE_BYTES) {
        throw new Error(`The ${sourceLabel} exceeds the 10 MiB file limit.`)
      }
      chunks.push(buffer.subarray(0, bytesRead))
    }
    raw = Buffer.concat(chunks, position).toString('utf8')
  } catch (error) {
    readFailed = true
    readFailure = error
  }

  let closeFailure: unknown
  try {
    await handle.close()
  } catch (error) {
    closeFailure = error
  }
  if (readFailed) {
    if (closeFailure !== undefined) {
      const readMessage =
        readFailure instanceof Error ? readFailure.message : String(readFailure)
      throw new Error(`${readMessage}\nCould not close file: ${absolute}`, {
        cause: new AggregateError([readFailure, closeFailure]),
      })
    }
    throw readFailure
  }
  if (closeFailure !== undefined) {
    throw new Error(`Could not close file: ${absolute}`, {
      cause: closeFailure,
    })
  }
  if (raw === undefined) {
    throw unreadable()
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`File is not valid JSON: ${absolute}`)
  }
}

export async function loadConfiguredSource(
  options: LoadConfiguredSourceOptions
): Promise<ConfiguredSource> {
  const loaded = await loadPrimitreeConfig({
    ...(options.configPath === undefined
      ? {}
      : { configPath: options.configPath }),
  })
  const sourceNames = Object.keys(loaded.sources)
  if (options.sourceName === undefined && sourceNames.length > 1) {
    throw new Error('Use --source when the config has several sources.')
  }
  const sourceName = options.sourceName ?? sourceNames[0]
  if (sourceName === undefined) {
    throw new Error('Primitree config needs at least one named source.')
  }
  const source = loaded.sources[sourceName]
  if (source === undefined) {
    throw new Error(`Config source "${sourceName}" does not exist.`)
  }

  return Object.freeze({
    configPath: loaded.configPath,
    sourceName,
    source,
  })
}

export async function buildConfiguredSourceGraph(
  configured: ConfiguredSource,
  options: BuildConfiguredSourceGraphOptions = {}
): Promise<ConfiguredSourceGraph> {
  const sourceFile = options.file ?? configured.source.file
  const sourceLabel =
    options.label ?? `file for source "${configured.sourceName}"`

  const document = await readConfiguredJsonFile(sourceFile, sourceLabel)
  const fragment = createDTCGGraphFragment(document, {
    source: configured.sourceName,
    uri: path.relative(
      path.dirname(configured.configPath),
      options.provenanceFile ?? sourceFile
    ),
  })
  if (!fragment.ok) {
    throw resultError(fragment)
  }
  const graph = composeGraph([fragment.value])
  if (!graph.ok) {
    throw resultError(graph)
  }
  const view = createSourceView(graph.value, { id: configured.sourceName })
  if (!view.ok) {
    throw resultError(view)
  }
  const resolved = resolveView(graph.value, view.value)
  if (!resolved.ok) {
    throw resultError(resolved)
  }

  return Object.freeze({
    configPath: configured.configPath,
    sourceName: configured.sourceName,
    source: configured.source,
    document,
    graph: graph.value,
    view: view.value,
  })
}

export async function loadConfiguredSourceGraph(
  options: LoadConfiguredSourceOptions
): Promise<ConfiguredSourceGraph> {
  return buildConfiguredSourceGraph(await loadConfiguredSource(options))
}
