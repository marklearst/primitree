import fs from 'node:fs/promises'
import path from 'node:path'
import {
  composeGraph,
  createSourceView,
  resolveView,
  type GraphView,
  type TokenGraph,
} from '@primitree/core'
import { toGraphFragment } from '@primitree/dtcg'
import { readJsonFile } from '../io'
import { loadPrimitreeConfig, type LoadedDTCGSourceConfig } from './load'

interface LoadConfiguredSourceOptions {
  readonly configPath?: string
  readonly sourceName?: string
}

export interface ConfiguredSourceGraph {
  readonly sourceName: string
  readonly source: LoadedDTCGSourceConfig
  readonly graph: TokenGraph
  readonly view: GraphView
}

function resultError(result: {
  readonly diagnostics: readonly { readonly message: string }[]
}): Error {
  return new Error(result.diagnostics.map(item => item.message).join('\n'))
}

export async function loadConfiguredSourceGraph(
  options: LoadConfiguredSourceOptions
): Promise<ConfiguredSourceGraph> {
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

  const stats = await fs.stat(source.file).catch(() => undefined)
  if (stats === undefined || !stats.isFile()) {
    throw new Error(`Could not read the file for source "${sourceName}".`)
  }
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error(`Source "${sourceName}" exceeds the 10 MiB file limit.`)
  }
  const document = await readJsonFile(source.file)
  const fragment = toGraphFragment(document, {
    source: sourceName,
    uri: path.relative(path.dirname(loaded.configPath), source.file),
  })
  if (!fragment.ok) {
    throw resultError(fragment)
  }
  const graph = composeGraph([fragment.value])
  if (!graph.ok) {
    throw resultError(graph)
  }
  const view = createSourceView(graph.value, { id: sourceName })
  if (!view.ok) {
    throw resultError(view)
  }
  const resolved = resolveView(graph.value, view.value)
  if (!resolved.ok) {
    throw resultError(resolved)
  }

  return Object.freeze({
    sourceName,
    source,
    graph: graph.value,
    view: view.value,
  })
}
