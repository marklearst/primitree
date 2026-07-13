import {
  buildLocalVariablesExport,
  summarizeExport,
} from '@figmavars/plugin-export'
import { mapCollection, mapVariable } from './map'

figma.showUI(__html__, { width: 360, height: 420, themeColors: true })

figma.ui.onmessage = async msg => {
  if (msg.type !== 'export') {
    return
  }

  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync()
    const variables = await figma.variables.getLocalVariablesAsync()

    if (collections.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'No local variable collections in this file.',
      })
      return
    }

    const doc = buildLocalVariablesExport(
      collections.map(mapCollection),
      variables.map(mapVariable),
      { excludeHidden: msg.excludeHidden === true }
    )

    const baseName = figma.root.name.replace(/[^\w.-]+/g, '-').toLowerCase()
    const fileName = baseName || 'variables'
    const summary = summarizeExport(doc, fileName)
    const json = JSON.stringify(doc, null, 2)

    figma.ui.postMessage({
      type: 'exported',
      json,
      summary,
    })

    figma.notify(
      `Exported ${summary.variables} variables from ${summary.collections} collections`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    figma.ui.postMessage({ type: 'error', message })
    figma.notify(`Export failed: ${message}`, { error: true })
  }
}

figma.ui.postMessage({ type: 'ready', fileName: figma.root.name })
