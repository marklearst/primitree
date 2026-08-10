import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import {
  composeGraph,
  createSourceView,
  resolveView,
  type GraphView,
  type TokenGraph,
} from '@primitree/core'
import { createDTCGGraphFragment } from '@primitree/dtcg'
import { loadPrimitreeConfig, type LoadedDTCGSourceConfig } from './load'
import {
  configuredSourceFileFingerprint,
  readConfiguredSourceFileFingerprint,
  readConfiguredSourcePathVerifier,
  sameConfiguredSourceFile,
  type ConfiguredSourceFileFingerprint,
  type ConfiguredSourcePathSnapshot,
  type ConfiguredSourcePathVerifier,
} from './source-snapshot'

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
  sourceLabel: string,
  expectedFingerprint?: ConfiguredSourceFileFingerprint,
  pathVerifier?: ConfiguredSourcePathVerifier
): Promise<unknown> {
  const absolute = path.resolve(filePath)
  const unreadable = () => new Error(`Could not read file: ${absolute}`)
  const changedBeforeReading = (cause?: unknown) =>
    new Error(
      `The ${sourceLabel} changed before reading.`,
      cause === undefined ? undefined : { cause }
    )
  let initialPathSnapshot: ConfiguredSourcePathSnapshot | undefined
  try {
    initialPathSnapshot = await pathVerifier?.()
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Build output path cannot use a symbolic link:')
    ) {
      throw error
    }
    throw changedBeforeReading(error)
  }
  const handle = await fs
    .open(absolute, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
    .catch(() => {
      throw unreadable()
    })

  let document: unknown
  let readCompleted = false
  let readFailed = false
  let readFailure: unknown
  try {
    const stats = await handle.stat({ bigint: true }).catch(() => {
      throw unreadable()
    })
    if (!stats.isFile()) {
      throw new Error(`Could not read the ${sourceLabel}.`)
    }
    const openedFingerprint = configuredSourceFileFingerprint(stats)
    const changed = () => new Error(`The ${sourceLabel} changed while reading.`)
    if (pathVerifier !== undefined) {
      let verifiedSnapshot: ConfiguredSourcePathSnapshot
      try {
        verifiedSnapshot = await pathVerifier()
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            'Build output path cannot use a symbolic link:'
          )
        ) {
          throw error
        }
        throw changedBeforeReading(error)
      }
      if (
        initialPathSnapshot === undefined ||
        verifiedSnapshot.targetKey !== initialPathSnapshot.targetKey ||
        verifiedSnapshot.fingerprint === undefined ||
        !sameConfiguredSourceFile(
          verifiedSnapshot.fingerprint,
          openedFingerprint
        )
      ) {
        throw changedBeforeReading()
      }
    }
    if (
      expectedFingerprint !== undefined &&
      !sameConfiguredSourceFile(expectedFingerprint, openedFingerprint)
    ) {
      throw changed()
    }
    if (stats.size > BigInt(MAX_SOURCE_BYTES)) {
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
    const completedFingerprint = configuredSourceFileFingerprint(
      await handle.stat({ bigint: true }).catch(() => {
        throw unreadable()
      })
    )
    if (!sameConfiguredSourceFile(openedFingerprint, completedFingerprint)) {
      throw changed()
    }
    if (pathVerifier !== undefined) {
      let verifiedSnapshot: ConfiguredSourcePathSnapshot
      try {
        verifiedSnapshot = await pathVerifier()
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            'Build output path cannot use a symbolic link:'
          )
        ) {
          throw error
        }
        throw new Error(`The ${sourceLabel} changed while reading.`, {
          cause: error,
        })
      }
      if (
        initialPathSnapshot === undefined ||
        verifiedSnapshot.targetKey !== initialPathSnapshot.targetKey ||
        verifiedSnapshot.fingerprint === undefined ||
        !sameConfiguredSourceFile(
          verifiedSnapshot.fingerprint,
          completedFingerprint
        )
      ) {
        throw changed()
      }
    }
    const pathStats = await fs.stat(absolute, { bigint: true }).catch(() => {
      throw changed()
    })
    if (
      !pathStats.isFile() ||
      !sameConfiguredSourceFile(
        completedFingerprint,
        configuredSourceFileFingerprint(pathStats)
      )
    ) {
      throw changed()
    }
    let raw: string
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, position)
      )
    } catch (error) {
      throw new Error(`File is not valid UTF-8: ${absolute}`, { cause: error })
    }
    try {
      document = JSON.parse(raw)
      readCompleted = true
    } catch {
      throw new Error(`File is not valid JSON: ${absolute}`)
    }
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
  if (!readCompleted) {
    throw unreadable()
  }
  return document
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

  const expectedFingerprint =
    options.file === undefined
      ? readConfiguredSourceFileFingerprint(configured.source)
      : undefined
  const pathVerifier =
    options.file === undefined
      ? readConfiguredSourcePathVerifier(configured.source)
      : undefined
  const document = await readConfiguredJsonFile(
    sourceFile,
    sourceLabel,
    expectedFingerprint,
    pathVerifier
  )
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
