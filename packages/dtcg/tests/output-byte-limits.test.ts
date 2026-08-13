import { describe, expect, it } from 'vitest'
import { buildDTCGOutputs, type DTCGOutputSet } from '../src/pipeline/build'
import type { DTCGDocument } from '../src/types'

const resolver = {
  version: '2025.10',
  sets: {
    brand: { sources: [{ $ref: 'brand.tokens.json' }] },
  },
  resolutionOrder: [{ $ref: '#/sets/brand' }],
} satisfies DTCGOutputSet['resolver']

const outputOptions = {
  css: false,
  tailwind: false,
  typescript: false,
} as const

describe('buildDTCGOutputs JSON byte limits', () => {
  it(
    'counts UTF-8 bytes across token names and text values',
    { timeout: 10_000 },
    () => {
      const value = '😀'.repeat(2_625_000)
      const files = {
        'brand.tokens.json': {
          first: { $type: 'fontFamily', $value: value },
        },
        'second.tokens.json': {
          second: { $type: 'fontFamily', $value: value },
        },
      } satisfies Record<string, DTCGDocument>

      expect(() =>
        buildDTCGOutputs(
          {
            files,
            resolver,
            resolverFileName: 'tokens.resolver.json',
          },
          outputOptions
        )
      ).toThrow('DTCG output text can contain at most 20 MiB.')
    }
  )

  it(
    'counts UTF-8 bytes in each serialized token file',
    { timeout: 10_000 },
    () => {
      const value = '界'.repeat(75)
      const document = {
        family: {
          $type: 'fontFamily',
          $value: Array.from({ length: 90_000 }, () => value),
        },
      } satisfies DTCGDocument

      expect(() =>
        buildDTCGOutputs(
          {
            files: { 'brand.tokens.json': document },
            resolver,
            resolverFileName: 'tokens.resolver.json',
          },
          outputOptions
        )
      ).toThrow('A DTCG output file can contain at most 20 MiB.')
    }
  )
})
