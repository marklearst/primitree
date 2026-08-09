import fs from 'node:fs/promises'
import path from 'node:path'
import {
  composeGraph,
  createSourceView,
  resolveView,
  type GraphView,
  type TokenGraph,
} from '@primitree/core'
import { createDTCGGraphFragment } from '@primitree/dtcg'
import { readJsonFile } from '../io'
import { loadPrimitreeConfig, type LoadedDTCGSourceConfig } from './load'

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

  const stats = await fs.stat(sourceFile).catch(() => undefined)
  if (stats === undefined || !stats.isFile()) {
    throw new Error(`Could not read the ${sourceLabel}.`)
  }
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error(`The ${sourceLabel} exceeds the 10 MiB file limit.`)
  }
  const document = await readJsonFile(sourceFile)
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
