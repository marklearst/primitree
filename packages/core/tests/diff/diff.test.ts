import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diffVariables } from '../../src/diff/diff'
import { formatDiffMarkdown, formatValue } from '../../src/diff/markdown'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/local-variables.json'), 'utf8')
)

describe('diffVariables', () => {
  it('reports no changes for identical inputs', () => {
    const diff = diffVariables(fixture, structuredClone(fixture))
    expect(diff.hasChanges).toBe(false)
    expect(diff.breaking).toBe(false)
    expect(formatDiffMarkdown(diff)).toContain('The exports match.')
  })

  it('detects renames by stable id instead of remove+add', () => {
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:2:201'].name = 'color/bg/primary'
    const diff = diffVariables(fixture, next)

    expect(diff.variables.renamed).toEqual([
      {
        id: 'VariableID:2:201',
        from: 'color/bg/brand',
        to: 'color/bg/primary',
        collectionName: 'Semantic',
      },
    ])
    expect(diff.variables.added).toEqual([])
    expect(diff.variables.removed).toEqual([])
    expect(diff.breaking).toBe(true)
  })

  it('detects per-mode value changes with mode names', () => {
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:2:202'].valuesByMode['2:1'] = {
      r: 1,
      g: 1,
      b: 1,
      a: 1,
    }
    const diff = diffVariables(fixture, next)

    expect(diff.variables.valueChanged).toHaveLength(1)
    const change = diff.variables.valueChanged[0]
    expect(change?.name).toBe('color/text/primary')
    expect(change?.modeName).toBe('Dark')
    expect(diff.breaking).toBe(false)
    expect(diff.hasChanges).toBe(true)
  })

  it('detects added and removed variables', () => {
    const next = structuredClone(fixture)
    delete next.meta.variables['VariableID:1:107']
    next.meta.variables['VariableID:1:200'] = {
      id: 'VariableID:1:200',
      name: 'color/green/500',
      variableCollectionId: 'VariableCollectionId:1:100',
      resolvedType: 'COLOR',
      valuesByMode: { '1:0': { r: 0, g: 1, b: 0, a: 1 } },
      description: '',
      hiddenFromPublishing: false,
      scopes: [],
      codeSyntax: {},
    }
    const diff = diffVariables(fixture, next)

    expect(diff.variables.added[0]?.name).toBe('color/green/500')
    expect(diff.variables.removed[0]?.name).toBe('opacity/disabled')
    expect(diff.breaking).toBe(true)
  })

  it('detects type changes, moves, and description changes', () => {
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:1:103'].resolvedType = 'STRING'
    next.meta.variables['VariableID:1:103'].valuesByMode['1:0'] = '4px'
    next.meta.variables['VariableID:1:104'].variableCollectionId =
      'VariableCollectionId:2:200'
    next.meta.variables['VariableID:1:105'].description = 'Now documented'
    const diff = diffVariables(fixture, next)

    expect(diff.variables.typeChanged[0]).toMatchObject({
      name: 'radius/sm',
      from: 'FLOAT',
      to: 'STRING',
    })
    expect(diff.variables.moved[0]).toMatchObject({
      name: 'space/2',
      from: 'Primitives',
      to: 'Semantic',
    })
    expect(diff.variables.descriptionChanged[0]?.name).toBe('font/family/sans')
  })

  it('detects collection and mode changes', () => {
    const next = structuredClone(fixture)
    next.meta.variableCollections['VariableCollectionId:2:200'].name = 'Theme'
    next.meta.variableCollections['VariableCollectionId:2:200'].modes.push({
      modeId: '2:2',
      name: 'High Contrast',
    })
    next.meta.variableCollections['VariableCollectionId:3:300'].modes = [
      { modeId: '3:0', name: 'Cozy' },
    ]
    const diff = diffVariables(fixture, next)

    expect(diff.collections.renamed[0]).toMatchObject({
      from: 'Semantic',
      to: 'Theme',
    })
    expect(diff.collections.modesAdded[0]?.modeName).toBe('High Contrast')
    expect(diff.collections.modesRemoved[0]?.modeName).toBe('Compact')
    expect(diff.collections.modesRenamed[0]).toMatchObject({
      from: 'Comfortable',
      to: 'Cozy',
    })
    expect(diff.breaking).toBe(true)
  })
})

describe('formatValue', () => {
  it('formats colors, aliases, strings, and unset', () => {
    expect(formatValue({ r: 0.2, g: 0.4, b: 1, a: 1 })).toBe('#3366ff')
    expect(formatValue({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
    expect(formatValue({ type: 'VARIABLE_ALIAS', id: 'X' })).toBe('alias(X)')
    expect(formatValue('Inter')).toBe('"Inter"')
    expect(formatValue(8)).toBe('8')
    expect(formatValue(undefined)).toBe('(unset)')
  })
})

describe('formatDiffMarkdown', () => {
  it('uses singular labels for one type or value change', () => {
    const valueChanged = structuredClone(fixture)
    valueChanged.meta.variables['VariableID:2:202'].valuesByMode['2:1'] = {
      r: 1,
      g: 1,
      b: 1,
      a: 1,
    }

    const typeChanged = structuredClone(fixture)
    typeChanged.meta.variables['VariableID:1:103'].resolvedType = 'STRING'
    typeChanged.meta.variables['VariableID:1:103'].valuesByMode['1:0'] = '4px'

    expect(formatDiffMarkdown(diffVariables(fixture, valueChanged))).toContain(
      'Variables: 1 value change.'
    )
    expect(formatDiffMarkdown(diffVariables(fixture, typeChanged))).toContain(
      'Variables: 1 type change, 1 value change.'
    )
  })

  it('renders a full changelog with breaking section and value table', () => {
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:2:201'].name = 'color/bg/primary'
    next.meta.variables['VariableID:2:202'].valuesByMode['2:1'] = {
      r: 1,
      g: 1,
      b: 1,
      a: 1,
    }
    const markdown = formatDiffMarkdown(diffVariables(fixture, next))

    expect(markdown).toContain('**The diff contains breaking changes.**')
    expect(markdown).toContain('### Renamed variables (breaking)')
    expect(markdown).toContain('`color/bg/brand` -> `color/bg/primary`')
    expect(markdown).toContain(
      '| Variable | Collection | Mode | Before | After |'
    )
    expect(markdown).toContain('| `color/text/primary` | Semantic | Dark |')
    expect(markdown).toContain('#f5f5fa')
  })
})
