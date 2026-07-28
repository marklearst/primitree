import { scanText } from './rules.mjs'

function positionAt(source, index) {
  const lines = source.slice(0, index).split('\n')
  return {
    startLine: lines.length,
    startColumn: lines.at(-1).length + 1,
  }
}

function propertyValueIndex(source, property, value, start = 0) {
  const propertyIndex = source.indexOf(JSON.stringify(property), start)
  if (propertyIndex === -1) {
    return -1
  }

  const separatorIndex = source.indexOf(':', propertyIndex)
  if (separatorIndex === -1) {
    return -1
  }

  const encodedValue = JSON.stringify(value)
  const encodedIndex = source.indexOf(encodedValue, separatorIndex + 1)
  return encodedIndex === -1 ? -1 : encodedIndex + 1
}

export function scanFigmaPluginManifest(file, source) {
  const manifest = JSON.parse(source)
  const fields = []

  if (typeof manifest.name === 'string') {
    fields.push({
      value: manifest.name,
      index: propertyValueIndex(source, 'name', manifest.name),
    })
  }

  if (typeof manifest.networkAccess?.reasoning === 'string') {
    const networkAccessIndex = source.indexOf('"networkAccess"')
    fields.push({
      value: manifest.networkAccess.reasoning,
      index: propertyValueIndex(
        source,
        'reasoning',
        manifest.networkAccess.reasoning,
        Math.max(0, networkAccessIndex)
      ),
    })
  }

  return fields
    .flatMap(field =>
      scanText(
        file,
        field.value,
        field.index === -1 ? undefined : positionAt(source, field.index)
      )
    )
    .sort(
      (left, right) =>
        left.line - right.line ||
        left.column - right.column ||
        left.ruleId.localeCompare(right.ruleId)
    )
}
