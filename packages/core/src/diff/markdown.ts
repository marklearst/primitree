import type { Color, VariableValue } from '../types/figma'
import { isVariableAlias } from '../normalize/resolve'
import type { VariablesDiff } from './diff'

function isColor(value: unknown): value is Color {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Color).r === 'number' &&
    typeof (value as Color).g === 'number' &&
    typeof (value as Color).b === 'number' &&
    typeof (value as Color).a === 'number'
  )
}

function hex(channel: number): string {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
}

/**
 * Human-readable rendering of a Figma variable value for diff output.
 *
 * @public
 */
export function formatValue(value: VariableValue | undefined): string {
  if (value === undefined) {
    return '(unset)'
  }
  if (isVariableAlias(value)) {
    return `alias(${value.id})`
  }
  if (isColor(value)) {
    const base = `#${hex(value.r)}${hex(value.g)}${hex(value.b)}`
    return value.a < 1 ? `${base}${hex(value.a)}` : base
  }
  if (typeof value === 'string') {
    return `"${value}"`
  }
  return String(value)
}

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return []
  }
  return ['', `### ${title}`, '', ...lines]
}

function changeCount(count: number, subject: string): string {
  return `${count} ${subject} change${count === 1 ? '' : 's'}`
}

/**
 * Render a {@link VariablesDiff} as a Markdown report.
 *
 * @public
 */
export function formatDiffMarkdown(diff: VariablesDiff): string {
  const out: string[] = ['# Figma variables diff', '']

  if (!diff.hasChanges) {
    out.push('No changes detected.', '')
    return out.join('\n')
  }

  const counts: string[] = []
  const v = diff.variables
  const c = diff.collections
  if (v.added.length) {
    counts.push(`${v.added.length} added`)
  }
  if (v.removed.length) {
    counts.push(`${v.removed.length} removed`)
  }
  if (v.renamed.length) {
    counts.push(`${v.renamed.length} renamed`)
  }
  if (v.moved.length) {
    counts.push(`${v.moved.length} moved`)
  }
  if (v.typeChanged.length) {
    counts.push(changeCount(v.typeChanged.length, 'type'))
  }
  if (v.valueChanged.length) {
    counts.push(changeCount(v.valueChanged.length, 'value'))
  }
  out.push(
    `Variables: ${counts.length > 0 ? counts.join(', ') : 'no variable changes'}.`
  )
  out.push(
    diff.breaking ? '**Breaking changes detected.**' : 'No breaking changes.'
  )

  const breaking: string[] = []
  breaking.push(
    ...section(
      'Removed variables (breaking)',
      v.removed.map(e => `- \`${e.name}\` (${e.collectionName})`)
    ),
    ...section(
      'Renamed variables (breaking)',
      v.renamed.map(e => `- \`${e.from}\` -> \`${e.to}\` (${e.collectionName})`)
    ),
    ...section(
      'Moved variables (breaking)',
      v.moved.map(e => `- \`${e.name}\`: ${e.from} -> ${e.to}`)
    ),
    ...section(
      'Type changes (breaking)',
      v.typeChanged.map(
        e => `- \`${e.name}\` (${e.collectionName}): ${e.from} -> ${e.to}`
      )
    ),
    ...section(
      'Removed collections (breaking)',
      c.removed.map(e => `- ${e.name}`)
    ),
    ...section(
      'Renamed collections (breaking)',
      c.renamed.map(e => `- ${e.from} -> ${e.to}`)
    ),
    ...section(
      'Removed modes (breaking)',
      c.modesRemoved.map(e => `- ${e.collectionName}: ${e.modeName}`)
    ),
    ...section(
      'Renamed modes (breaking)',
      c.modesRenamed.map(e => `- ${e.collectionName}: ${e.from} -> ${e.to}`)
    )
  )
  if (breaking.length > 0) {
    out.push('', '## Breaking', ...breaking)
  }

  const additive: string[] = []
  additive.push(
    ...section(
      'Added variables',
      v.added.map(e => `- \`${e.name}\` (${e.collectionName})`)
    ),
    ...section(
      'Added collections',
      c.added.map(e => `- ${e.name}`)
    ),
    ...section(
      'Added modes',
      c.modesAdded.map(e => `- ${e.collectionName}: ${e.modeName}`)
    )
  )
  if (additive.length > 0) {
    out.push('', '## Additions', ...additive)
  }

  if (v.valueChanged.length > 0) {
    out.push(
      '',
      '## Value changes',
      '',
      '| Variable | Collection | Mode | Before | After |',
      '| --- | --- | --- | --- | --- |',
      ...v.valueChanged.map(
        e =>
          `| \`${e.name}\` | ${e.collectionName} | ${e.modeName} | ` +
          `${formatValue(e.from)} | ${formatValue(e.to)} |`
      )
    )
  }

  if (v.descriptionChanged.length > 0) {
    out.push(
      '',
      '## Description changes',
      '',
      ...v.descriptionChanged.map(e => `- \`${e.name}\` (${e.collectionName})`)
    )
  }

  out.push('')
  return out.join('\n')
}
