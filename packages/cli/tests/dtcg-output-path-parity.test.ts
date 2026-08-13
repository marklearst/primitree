import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildDTCGOutputs,
  type DTCGDocument,
  type DTCGOutputSet,
  type PipelineFile,
} from '@primitree/dtcg'
import { inspectBuildOutput, installBuildOutput } from '../src/build-output'
import { createBuildManifest } from '../src/output-manifest'

const document = {
  value: { $type: 'number', $value: 1 },
} satisfies DTCGDocument

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-parity-'))
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

function buildTokenFiles(fileName: string): PipelineFile[] {
  const input: DTCGOutputSet = {
    files: { [fileName]: document },
    resolver: {
      version: '2025.10',
      sets: { source: { sources: [{ $ref: fileName }] } },
      resolutionOrder: [{ $ref: '#/sets/source' }],
    },
    resolverFileName: 'tokens.resolver.json',
  }
  const output = buildDTCGOutputs(input, {
    css: false,
    tailwind: false,
    typescript: false,
  }).files
  return [
    ...output,
    createBuildManifest({
      source: 'source',
      sourceContents: 'source\n',
      formats: ['dtcg'],
      files: output,
    }),
  ]
}

describe('DTCG and CLI output path parity', () => {
  it('rejects a token file name that the tokens prefix would put above the shared depth limit', () => {
    const fileName = `${Array.from(
      { length: 64 },
      (_, index) => `d${index}`
    ).join('/')}/deep.tokens.json`

    expect(() => buildTokenFiles(fileName)).toThrow(
      'The emitted DTCG token file path can contain at most 64 nested directory levels.'
    )
  })

  it('installs emitted token files at the shared directory-depth limit', async () => {
    const fileName = `${Array.from(
      { length: 63 },
      (_, index) => `d${index}`
    ).join('/')}/deep.tokens.json`
    const files = buildTokenFiles(fileName)
    const root = path.join(directory, 'project')
    const output = path.join(root, 'generated')
    await fs.mkdir(root)

    await expect(
      installBuildOutput(output, files, 'source', root)
    ).resolves.toBe('written')
    await expect(
      fs.readFile(path.join(output, 'tokens', fileName), 'utf8')
    ).resolves.toContain('"$value": 1')
  })

  it('rejects a DTCG-valid relative token path above the CLI resolved-path limit', async () => {
    const segment = 'a'.repeat(255)
    const fileName = Array.from({ length: 64 }, () => segment).join('/')
    const files = buildTokenFiles(fileName)
    const emittedPath = `tokens/${fileName}`
    const output = path.join(directory, 'missing')
    const resolvedPath = path.join(output, ...emittedPath.split('/'))
    const resolvedBytes = Buffer.byteLength(resolvedPath, 'utf8')

    expect(Buffer.byteLength(emittedPath, 'utf8')).toBe(16_390)
    expect(resolvedBytes).toBeGreaterThan(1_023)
    await expect(inspectBuildOutput(output, files)).rejects.toThrow(
      `Resolved build output file path is ${resolvedBytes} UTF-8 bytes; use at most 1023 UTF-8 bytes: ${JSON.stringify(emittedPath)}.`
    )
  })
})
