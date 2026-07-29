import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../src/args'
import { runCheck } from '../src/commands/check'
import { runDiff } from '../src/commands/diff'
import { runInspect } from '../src/commands/inspect'

let directory: string

const beforeValues = {
  duration: { value: 100, unit: 'ms' },
  family: ['Inter', 'sans-serif'],
  weight: 'bold',
} as const

const afterValues = {
  duration: { value: 0.2, unit: 's' },
  family: ['Atkinson Hyperlegible', 'sans-serif'],
  weight: 650.5,
} as const

function tokenDocument(values: {
  readonly duration: { readonly value: number; readonly unit: 'ms' | 's' }
  readonly family: readonly string[]
  readonly weight: number | string
}) {
  return {
    base: {
      motion: {
        quick: { $type: 'duration', $value: values.duration },
      },
      type: {
        family: { $type: 'fontFamily', $value: values.family },
        weight: { $type: 'fontWeight', $value: values.weight },
      },
    },
    semantic: {
      motion: {
        quick: { $type: 'duration', $value: '{base.motion.quick}' },
        control: { $type: 'duration', $value: '{semantic.motion.quick}' },
      },
      type: {
        family: { $type: 'fontFamily', $value: '{base.type.family}' },
        body: { $type: 'fontFamily', $value: '{semantic.type.family}' },
        weight: { $type: 'fontWeight', $value: '{base.type.weight}' },
        emphasis: { $type: 'fontWeight', $value: '{semantic.type.weight}' },
      },
    },
  }
}

beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'primitree-configured-values-')
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.exitCode = undefined

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
          { id: 'base', roots: ['base'], values: 'literal' },
          {
            id: 'semantic',
            roots: ['semantic'],
            values: 'reference',
            references: ['base', 'semantic'],
          },
        ],
      },
      ownership: { default: ['design-systems'] },
    },
  },
}
`,
    'utf8'
  )
  await fs.writeFile(
    path.join(directory, 'before.tokens.json'),
    JSON.stringify(tokenDocument(beforeValues)),
    'utf8'
  )
  await fs.writeFile(
    path.join(directory, 'after.tokens.json'),
    JSON.stringify(tokenDocument(afterValues)),
    'utf8'
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(directory, { recursive: true, force: true })
})

function outputReport() {
  expect(console.log).toHaveBeenCalledTimes(1)
  const output = vi.mocked(console.log).mock.calls[0]?.[0]
  return JSON.parse(String(output))
}

describe('configured DTCG scalar values', () => {
  it('checks duration, font family, and font weight chains', async () => {
    await runCheck(
      parseArgs([
        '--config',
        path.join(directory, 'primitree.config.ts'),
        '--format',
        'json',
      ])
    )

    expect(process.exitCode).toBeUndefined()
    expect(outputReport()).toMatchObject({
      schemaVersion: 1,
      command: 'check',
      source: 'brand',
      summary: { active: 0, baseline: 0 },
      findings: [],
    })
  })

  it.each([
    [
      'semantic.motion.control',
      'duration',
      afterValues.duration,
      ['semantic.motion.control', 'semantic.motion.quick', 'base.motion.quick'],
    ],
    [
      'semantic.type.body',
      'fontFamily',
      afterValues.family,
      ['semantic.type.body', 'semantic.type.family', 'base.type.family'],
    ],
    [
      'semantic.type.emphasis',
      'fontWeight',
      afterValues.weight,
      ['semantic.type.emphasis', 'semantic.type.weight', 'base.type.weight'],
    ],
  ] as const)(
    'inspects %s through its full alias chain',
    async (tokenPath, type, value, chain) => {
      await runInspect(
        parseArgs([
          tokenPath,
          '--config',
          path.join(directory, 'primitree.config.ts'),
          '--format',
          'json',
        ])
      )

      expect(process.exitCode).toBeUndefined()
      const report = outputReport()
      expect(report.token.type).toBe(type)
      expect(report.resolvedValue).toEqual(value)
      expect(
        report.aliasChain.map((token: { path: string[] }) =>
          token.path.join('.')
        )
      ).toEqual(chain)
    }
  )

  it('reports two affected aliases for each changed literal', async () => {
    await runDiff(
      parseArgs([
        path.join(directory, 'before.tokens.json'),
        path.join(directory, 'after.tokens.json'),
        '--config',
        path.join(directory, 'primitree.config.ts'),
        '--format',
        'json',
      ])
    )

    expect(process.exitCode).toBeUndefined()
    const report = outputReport()
    expect(
      report.changes.map(
        (change: {
          kind: string
          token: { path: string[] }
          impacted: Array<{ path: string[] }>
        }) => ({
          kind: change.kind,
          path: change.token.path.join('.'),
          impacted: change.impacted.map(token => token.path.join('.')),
        })
      )
    ).toEqual([
      {
        kind: 'changed',
        path: 'base.motion.quick',
        impacted: ['semantic.motion.quick', 'semantic.motion.control'],
      },
      {
        kind: 'changed',
        path: 'base.type.family',
        impacted: ['semantic.type.family', 'semantic.type.body'],
      },
      {
        kind: 'changed',
        path: 'base.type.weight',
        impacted: ['semantic.type.weight', 'semantic.type.emphasis'],
      },
    ])
    expect(report.findings).toEqual({ added: [], resolved: [] })
  })
})
