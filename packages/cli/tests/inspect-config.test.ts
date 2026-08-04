import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../src/args'
import { runInspect } from '../src/commands/inspect'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-inspect-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.exitCode = undefined
  await fs.writeFile(
    path.join(directory, 'primitree.config.ts'),
    `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: {
        layers: [
          { id: 'base', roots: ['size'], values: 'literal' },
          {
            id: 'meaning',
            roots: ['semantic'],
            values: 'reference',
            references: ['base', 'meaning'],
          },
        ],
      },
      ownership: {
        default: ['design-systems'],
        paths: { semantic: ['product-design'] },
      },
    },
  },
}
`,
    'utf8'
  )
  await fs.writeFile(
    path.join(directory, 'tokens.json'),
    JSON.stringify({
      size: { base: { $type: 'number', $value: 4 } },
      semantic: {
        action: { $type: 'number', $value: '{size.base}' },
        button: { $type: 'number', $value: '{semantic.action}' },
        toolbar: { $type: 'number', $value: '{semantic.button}' },
      },
    }),
    'utf8'
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(directory, { recursive: true, force: true })
})

function runInspectProcess(...args: string[]) {
  const cliPath = path.join(import.meta.dirname, '../dist/index.js')
  return spawnSync(process.execPath, [cliPath, 'inspect', ...args], {
    cwd: directory,
    encoding: 'utf8',
  })
}

describe('primitree inspect with a project config', () => {
  it('reports one exact token path as JSON', async () => {
    await runInspect(
      parseArgs([
        'semantic.action',
        '--config',
        path.join(directory, 'primitree.config.ts'),
        '--format',
        'json',
      ])
    )

    expect(process.exitCode).toBeUndefined()
    expect(console.log).toHaveBeenCalledTimes(1)
    const output = vi.mocked(console.log).mock.calls[0]?.[0]
    expect(JSON.parse(String(output))).toEqual({
      schemaVersion: 1,
      command: 'inspect',
      source: 'brand',
      token: {
        id: 'source:brand/token:semantic.action',
        path: ['semantic', 'action'],
        type: 'number',
        provenance: [{ uri: 'tokens.json', pointer: '/semantic/action' }],
      },
      resolvedValue: 4,
      aliasChain: [
        {
          id: 'source:brand/token:semantic.action',
          path: ['semantic', 'action'],
        },
        {
          id: 'source:brand/token:size.base',
          path: ['size', 'base'],
        },
      ],
      owners: ['product-design'],
      directDependents: [
        {
          id: 'source:brand/token:semantic.button',
          path: ['semantic', 'button'],
        },
      ],
    })
  })

  it('prints the token explanation as text', async () => {
    await runInspect(
      parseArgs([
        'semantic.action',
        '--config',
        path.join(directory, 'primitree.config.ts'),
      ])
    )

    expect(process.exitCode).toBeUndefined()
    const output = vi
      .mocked(console.log)
      .mock.calls.map(([value]) => String(value))
      .join('\n')
    expect(`${output}\n`).toBe(`Token: semantic.action
ID: source:brand/token:semantic.action
Source: brand
Type: number
Value: 4
Alias chain: semantic.action -> size.base
Owners: product-design
Direct dependents: semantic.button
Source file: tokens.json
Token pointer: /semantic/action
`)
  })

  it('rejects an invalid reference elsewhere in the source', async () => {
    await fs.writeFile(
      path.join(directory, 'tokens.json'),
      JSON.stringify({
        size: { base: { $type: 'number', $value: 4 } },
        semantic: {
          action: { $type: 'number', $value: '{semantic.button}' },
          button: { $type: 'number', $value: '{semantic.action}' },
        },
      }),
      'utf8'
    )

    await expect(
      runInspect(
        parseArgs([
          'size.base',
          '--config',
          path.join(directory, 'primitree.config.ts'),
        ])
      )
    ).rejects.toThrow('Token references contain a cycle.')
    expect(console.log).not.toHaveBeenCalled()
  })

  it.each([
    ['missing path', []],
    ['empty path', ['']],
    ['empty path segment', ['semantic..action']],
    ['unknown token', ['semantic.missing']],
    ['extra path', ['semantic.action', 'semantic.button']],
    ['unknown option', ['semantic.action', '--quiet']],
    [
      'repeated option',
      ['semantic.action', '--format', 'text', '--format=json'],
    ],
    ['missing format', ['semantic.action', '--format']],
  ])('returns exit code 2 for $name', (_name, args) => {
    const result = runInspectProcess(...args)

    expect(result.status).toBe(2)
  })
})
