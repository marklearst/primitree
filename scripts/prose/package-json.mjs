import { scanText } from './rules.mjs'

export function scanPackageDescription(file, source) {
  const manifest = JSON.parse(source)
  if (typeof manifest.description !== 'string') {
    return []
  }

  const descriptionIndex = source.indexOf(manifest.description)
  const before = source.slice(0, Math.max(descriptionIndex, 0))
  const lines = before.split('\n')

  return scanText(file, manifest.description, {
    startLine: lines.length,
    startColumn: (lines.at(-1)?.length ?? 0) + 1,
  })
}
