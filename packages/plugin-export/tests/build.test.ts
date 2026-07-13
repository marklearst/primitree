import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeVariables } from '@figmavars/core'
import {
  buildLocalVariablesExport,
  summarizeExport,
  type ExportCollection,
  type ExportVariable,
} from '../src'

const fixturePath = join(
  import.meta.dirname,
  '../../core/tests/fixtures/local-variables.json'
)
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

function fromFixture() {
  const collections = Object.values(
    fixture.meta.variableCollections
  ) as ExportCollection[]
  const variables = Object.values(fixture.meta.variables) as ExportVariable[]
  return buildLocalVariablesExport(collections, variables)
}

describe('buildLocalVariablesExport', () => {
  it('produces a REST-shaped document', () => {
    const doc = fromFixture()
    expect(doc.status).toBe(200)
    expect(doc.error).toBe(false)
    expect(Object.keys(doc.meta.variableCollections)).toHaveLength(3)
    expect(Object.keys(doc.meta.variables)).toHaveLength(12)
  })

  it('round-trips through normalizeVariables', () => {
    const doc = fromFixture()
    const normalized = normalizeVariables(doc)
    expect(normalized.collections).toHaveLength(3)
    expect(normalized.variables).toHaveLength(12)
    expect(normalized.warnings).toEqual([])
  })

  it('can exclude hidden variables', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = Object.values(fixture.meta.variables) as ExportVariable[]
    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })
    expect(Object.keys(doc.meta.variables)).toHaveLength(11)
    expect(doc.meta.variables['VariableID:1:106']).toBeUndefined()
  })

  it('removes excluded variables from collection membership', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = Object.values(fixture.meta.variables) as ExportVariable[]
    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })

    expect(
      doc.meta.variableCollections['VariableCollectionId:1:100'].variableIds
    ).not.toContain('VariableID:1:106')
  })

  it('excludes visible variables whose aliases transitively depend on hidden variables', () => {
    const collections = Object.values(
      fixture.meta.variableCollections
    ) as ExportCollection[]
    const variables = (
      Object.values(fixture.meta.variables) as ExportVariable[]
    ).map(variable => {
      if (variable.id === 'VariableID:1:107') {
        return {
          ...variable,
          valuesByMode: {
            '1:0': {
              type: 'VARIABLE_ALIAS',
              id: 'VariableID:1:106',
            },
          },
        }
      }
      if (variable.id === 'VariableID:1:105') {
        return {
          ...variable,
          valuesByMode: {
            '1:0': {
              type: 'VARIABLE_ALIAS',
              id: 'VariableID:1:107',
            },
          },
        }
      }
      return variable
    })

    const doc = buildLocalVariablesExport(collections, variables, {
      excludeHidden: true,
    })

    expect(doc.meta.variables['VariableID:1:106']).toBeUndefined()
    expect(doc.meta.variables['VariableID:1:107']).toBeUndefined()
    expect(doc.meta.variables['VariableID:1:105']).toBeUndefined()
    expect(
      doc.meta.variableCollections['VariableCollectionId:1:100'].variableIds
    ).toEqual([
      'VariableID:1:101',
      'VariableID:1:102',
      'VariableID:1:103',
      'VariableID:1:104',
    ])
  })

  it('summarizes counts', () => {
    const doc = fromFixture()
    const summary = summarizeExport(doc, 'my-file')
    expect(summary.collections).toBe(3)
    expect(summary.variables).toBe(12)
    expect(summary.modes).toBe(5)
    expect(summary.fileName).toBe('my-file.json')
  })
})
