import { scanText } from './rules.mjs'

function lineAndColumn(source, index) {
  const before = source.slice(0, index)
  const lines = before.split('\n')

  return {
    startLine: lines.length,
    startColumn: lines.at(-1).length + 1,
  }
}

export function scanDocsNavigationJson(file, source) {
  JSON.parse(source)

  const violations = []
  const stringPattern = /"(?:\\.|[^"\\])*"/gu

  for (const match of source.matchAll(stringPattern)) {
    if (match.index === undefined) {
      continue
    }

    const after = source.slice(match.index + match[0].length)
    if (/^\s*:/u.test(after)) {
      continue
    }

    const value = JSON.parse(match[0])
    violations.push(
      ...scanText(file, value, lineAndColumn(source, match.index + 1))
    )
  }

  return violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}
