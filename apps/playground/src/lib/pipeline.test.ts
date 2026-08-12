import { describe, expect, it } from 'vitest'
import { resolvePreview, type Preview } from './pipeline'

describe('resolvePreview', () => {
  it('uses effective token types in preview rows', () => {
    const preview = {
      dtcg: {
        files: {
          'tokens.json': {
            weights: {
              $type: 'fontWeight',
              base: { $value: 'semi-bold' },
            },
            semantic: {
              emphasis: { $value: '{weights.base}' },
            },
            labels: {
              emphasis: { $type: 'string', $value: 'semi-bold' },
            },
          },
        },
        resolver: {
          version: '2025.10',
          sets: {
            base: { sources: [{ $ref: 'tokens.json' }] },
          },
          resolutionOrder: [{ $ref: '#/sets/base' }],
        },
        resolverFileName: 'resolver.json',
        warnings: [],
      },
      pipeline: {
        files: [],
        warnings: [],
        summary: {
          collections: 1,
          variables: 3,
          tokenFiles: 1,
          contexts: {},
          files: [],
        },
      },
      contexts: {},
      fileName: 'variables.json',
    } satisfies Preview

    expect(
      resolvePreview(preview, {}).map(({ path, type, css, value }) => ({
        path,
        type,
        css,
        value,
      }))
    ).toEqual([
      {
        path: 'weights.base',
        type: 'fontWeight',
        css: '600',
        value: 'semi-bold',
      },
      {
        path: 'semantic.emphasis',
        type: 'fontWeight',
        css: '600',
        value: 'semi-bold',
      },
      {
        path: 'labels.emphasis',
        type: 'string',
        css: 'semi-bold',
        value: 'semi-bold',
      },
    ])
  })
})
