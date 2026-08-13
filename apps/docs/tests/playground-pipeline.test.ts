import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePreview, type Preview } from '../lib/playground/pipeline.ts'

function preview(): Preview {
  return {
    dtcg: {
      files: {},
      resolver: {
        version: '2025.10',
        sets: {
          base: {
            sources: [
              {
                weights: {
                  $type: 'fontWeight',
                  inherited: { $value: 'semi-bold' },
                },
                alias: { $value: '{weights.inherited}' },
                label: { $type: 'string', $value: 'semi-bold' },
              },
            ],
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      },
      resolverFileName: 'tokens.resolver.json',
      warnings: [],
    },
    pipeline: {
      files: [],
      warnings: [],
      summary: {
        collections: 0,
        variables: 3,
        tokenFiles: 1,
        contexts: {},
        files: [],
      },
    },
    contexts: {},
    fileName: 'variables.json',
  }
}

test('playground preview formats values with their effective token types', () => {
  const tokens = Object.fromEntries(
    resolvePreview(preview(), {}).map(token => [token.path, token])
  )

  assert.equal(tokens['weights.inherited']?.raw.$type, undefined)
  assert.equal(tokens['weights.inherited']?.type, 'fontWeight')
  assert.equal(tokens['weights.inherited']?.css, '600')

  assert.equal(tokens.alias?.raw.$type, undefined)
  assert.equal(tokens.alias?.type, 'fontWeight')
  assert.equal(tokens.alias?.css, '600')

  assert.equal(tokens.label?.type, 'string')
  assert.equal(tokens.label?.css, 'semi-bold')
})
