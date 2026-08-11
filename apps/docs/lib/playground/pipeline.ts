import { zipSync, strToU8 } from 'fflate'
import {
  buildPipeline,
  toDTCG,
  applyResolver,
  flattenTypedTokens,
  resolveTokenValuesSafe,
  listContexts,
  typedCssValue,
  type BuildPipelineResult,
  type DTCGToken,
  type DTCGTokenType,
  type DTCGTokenValue,
  type ToDTCGResult,
} from '@primitree/dtcg'

export interface PreviewToken {
  path: string
  type: DTCGTokenType | undefined
  css: string | null
  value: DTCGTokenValue | undefined
  raw: DTCGToken
}

export interface Preview {
  dtcg: ToDTCGResult
  pipeline: BuildPipelineResult
  contexts: Record<string, string[]>
  fileName: string
}

/** Parse a variables JSON file into DTCG data, pipeline files, contexts, and a file name. */
export function analyze(jsonText: string, fileName: string): Preview {
  const parsed = JSON.parse(jsonText)
  const dtcg = toDTCG(parsed)
  const pipeline = buildPipeline(parsed)
  return {
    dtcg,
    pipeline,
    contexts: listContexts(dtcg.resolver),
    fileName,
  }
}

/** Resolve all tokens for a context selection, for the preview grid. */
export function resolvePreview(
  preview: Preview,
  selection: Record<string, string>
): PreviewToken[] {
  const merged = applyResolver(
    preview.dtcg.files,
    preview.dtcg.resolver,
    selection
  )
  const flat = flattenTypedTokens(merged)
  const { values } = resolveTokenValuesSafe(flat)
  return flat.map(({ path, token, type }) => {
    const value = values.get(path)
    return {
      path,
      type,
      css: value === undefined ? null : typedCssValue(value, type),
      value,
      raw: token,
    }
  })
}

/** Create a browser zip from the generated pipeline files. */
export function zipPipeline(pipeline: BuildPipelineResult): Blob {
  const entries: Record<string, Uint8Array> = {}
  for (const file of pipeline.files) {
    entries[file.path] = strToU8(file.contents)
  }
  const zipped = zipSync(entries, { level: 6 })
  const bytes = new Uint8Array(zipped.length)
  bytes.set(zipped)
  return new Blob([bytes.buffer], { type: 'application/zip' })
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
