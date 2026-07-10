import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-diff-'))
  await fs.writeFile(
    path.join(directory, 'primitree.config.ts'),
    `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './after.tokens.json',
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
  const document = (base: number, extra = {}) => ({
    size: { base: { $type: 'number', $value: base } },
    semantic: {
      action: { $type: 'number', $value: '{size.base}' },
      button: { $type: 'number', $value: '{semantic.action}' },
      ...extra,
    },
  })
  await fs.writeFile(
    path.join(directory, 'before.tokens.json'),
    JSON.stringify(document(4)),
    'utf8'
  )
  await fs.writeFile(
    path.join(directory, 'after.tokens.json'),
    JSON.stringify(document(8, { bad: { $type: 'number', $value: 12 } })),
    'utf8'
  )
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

describe('primitree diff with a project config', () => {
  function runDiff(...args: string[]) {
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')
    return spawnSync(process.execPath, [cliPath, 'diff', ...args], {
      cwd: directory,
      encoding: 'utf8',
    })
  }

  it('reports token impact and new policy findings as JSON', () => {
    const result = runDiff(
      'before.tokens.json',
      'after.tokens.json',
      '--config',
      'primitree.config.ts',
      '--format',
      'json'
    )

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      command: 'diff',
      source: 'brand',
      changes: [
        {
          kind: 'added',
          token: {
            id: 'source:brand/token:semantic.bad',
            path: ['semantic', 'bad'],
          },
          impacted: [],
        },
        {
          kind: 'changed',
          token: { id: 'source:brand/token:size.base', path: ['size', 'base'] },
          impacted: [
            {
              id: 'source:brand/token:semantic.action',
              path: ['semantic', 'action'],
            },
            {
              id: 'source:brand/token:semantic.button',
              path: ['semantic', 'button'],
            },
          ],
        },
      ],
      findings: {
        added: [
          {
            ruleId: 'PT1003',
            path: ['semantic', 'bad'],
            message: 'Layer meaning does not allow this token value form.',
            owners: ['product-design'],
          },
        ],
        resolved: [],
      },
    })
  })

  it('prints token impact and finding counts as text', () => {
    const result = runDiff(
      'before.tokens.json',
      'after.tokens.json',
      '--config',
      'primitree.config.ts'
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toBe(`Diff found 2 token changes.
added semantic.bad
  Affected tokens: none
changed size.base
  Affected tokens: semantic.action, semantic.button
New findings: 1
Resolved findings: 0
`)
  })

  it('reports resolved findings without failing the after state', () => {
    const result = runDiff(
      'after.tokens.json',
      'before.tokens.json',
      '--config',
      'primitree.config.ts',
      '--format',
      'json'
    )

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).findings).toEqual({
      added: [],
      resolved: [
        {
          ruleId: 'PT1003',
          path: ['semantic', 'bad'],
          message: 'Layer meaning does not allow this token value form.',
          owners: ['product-design'],
        },
      ],
    })
  })

  it('reports no changes for matching token files', () => {
    const result = runDiff(
      'before.tokens.json',
      'before.tokens.json',
      '--config',
      'primitree.config.ts',
      '--format',
      'json'
    )

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      changes: [],
      findings: { added: [], resolved: [] },
    })
  })

  it.each([
    ['missing file', ['before.tokens.json', '--config', 'primitree.config.ts']],
    [
      'extra file',
      [
        'before.tokens.json',
        'after.tokens.json',
        'third.tokens.json',
        '--config',
        'primitree.config.ts',
      ],
    ],
    [
      'unknown option',
      [
        'before.tokens.json',
        'after.tokens.json',
        '--config',
        'primitree.config.ts',
        '--quiet',
      ],
    ],
    [
      'repeated option',
      [
        'before.tokens.json',
        'after.tokens.json',
        '--config',
        'primitree.config.ts',
        '--format',
        'text',
        '--format=json',
      ],
    ],
    [
      'missing format',
      [
        'before.tokens.json',
        'after.tokens.json',
        '--config',
        'primitree.config.ts',
        '--format',
      ],
    ],
    ['missing config', ['before.tokens.json', 'after.tokens.json', '--config']],
  ])('returns exit code 2 for $name', (_name, args) => {
    expect(runDiff(...args).status).toBe(2)
  })
})
