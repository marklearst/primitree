import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../src/args'
import { runCheck } from '../src/commands/check'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-check-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(directory, { recursive: true, force: true })
})

async function writeProject(value: unknown): Promise<string> {
  const configPath = path.join(directory, 'primitree.config.ts')
  await fs.writeFile(
    configPath,
    `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: {
        layers: [
          { id: 'primitive', roots: ['size'], values: 'literal' },
          {
            id: 'semantic',
            roots: ['semantic'],
            values: 'reference',
            references: ['primitive', 'semantic'],
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
    path.join(directory, 'tokens.json'),
    JSON.stringify({
      size: { base: { $type: 'number', $value: 4 } },
      semantic: { action: { $type: 'number', $value: value } },
    }),
    'utf8'
  )
  return configPath
}

describe('primitree check with a project config', () => {
  it.each([
    ['passing source', '{size.base}', [], 0],
    ['policy finding', 8, [], 1],
    ['command error', '{size.base}', ['--quiet'], 2],
  ])(
    'returns the documented exit code for a $name',
    async (_name, value, extraArgs, exitCode) => {
      await writeProject(value)
      const cliPath = path.join(import.meta.dirname, '../dist/index.js')

      const result = spawnSync(
        process.execPath,
        [cliPath, 'check', ...extraArgs],
        { cwd: directory, encoding: 'utf8' }
      )

      expect(result.status).toBe(exitCode)
    }
  )

  it('loads a TypeScript config inside a CommonJS package', async () => {
    const configPath = await writeProject('{size.base}')
    const config = await fs.readFile(configPath, 'utf8')
    await fs.writeFile(
      configPath,
      `${config.replace('export default {', 'const config: unknown = {')}\nexport default config\n`,
      'utf8'
    )
    await fs.writeFile(
      path.join(directory, 'package.json'),
      `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
      'utf8'
    )
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')

    const result = spawnSync(process.execPath, [cliPath, 'check'], {
      cwd: directory,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Check passed for source "brand"')
  })

  it.each([
    ['source selection', ['--source', 'brand']],
    ['report format', ['--format', 'json']],
    ['unknown option', ['--quiet']],
    ['repeated option', ['--quiet', '--quiet']],
  ])('rejects $name with the older path form', (_name, extraArgs) => {
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')
    const fixturePath = path.join(
      import.meta.dirname,
      'fixtures/local-variables.json'
    )

    const result = spawnSync(
      process.execPath,
      [cliPath, 'check', fixturePath, ...extraArgs],
      { encoding: 'utf8' }
    )

    expect(result.status).toBe(2)
  })

  it('rejects an empty path', () => {
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')

    const fixturePath = path.join(
      import.meta.dirname,
      'fixtures/local-variables.json'
    )
    const build = spawnSync(
      process.execPath,
      [cliPath, 'build', fixturePath, '--out', directory],
      { encoding: 'utf8' }
    )
    expect(build.status).toBe(0)

    const result = spawnSync(process.execPath, [cliPath, 'check', ''], {
      cwd: directory,
      encoding: 'utf8',
    })

    expect(result.status).toBe(2)
  })

  it('passes a local DTCG source that follows its layer rules', async () => {
    const configPath = await writeProject('{size.base}')

    await runCheck(parseArgs(['--config', configPath]))

    expect(process.exitCode).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith(
      'Check passed for source "brand" with 2 tokens.'
    )
  })

  it('rejects a token reference cycle before reporting success', async () => {
    const configPath = await writeProject('{size.base}')
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

    await expect(runCheck(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Token references contain a cycle.'
    )
  })

  it('rejects a reference whose target has a different token type', async () => {
    const configPath = await writeProject('{size.base}')
    await fs.writeFile(
      path.join(directory, 'tokens.json'),
      JSON.stringify({
        size: { base: { $type: 'string', $value: '4' } },
        semantic: {
          action: { $type: 'number', $value: '{size.base}' },
        },
      }),
      'utf8'
    )

    await expect(runCheck(parseArgs(['--config', configPath]))).rejects.toThrow(
      'A DTCG alias type does not match its reference target.'
    )
  })

  it('keeps source file read errors', async () => {
    const configPath = await writeProject('{size.base}')
    const tokenPath = path.join(directory, 'tokens.json')
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target) === tokenPath) {
        throw new Error('Injected source read failure.')
      }
      return open(target, flags, mode)
    })

    await expect(runCheck(parseArgs(['--config', configPath]))).rejects.toThrow(
      `Could not read file: ${tokenPath}`
    )
  })

  it('reports policy findings as JSON and exits 1', async () => {
    const configPath = await writeProject(8)

    await runCheck(
      parseArgs([
        '--config',
        configPath,
        '--source',
        'brand',
        '--format',
        'json',
      ])
    )

    expect(process.exitCode).toBe(1)
    const output = vi.mocked(console.log).mock.calls[0]?.[0]
    const report = JSON.parse(String(output))
    expect(report).toMatchObject({
      schemaVersion: 1,
      command: 'check',
      source: 'brand',
      summary: { active: 1, baseline: 0 },
    })
    expect(report.findings).toEqual([
      expect.objectContaining({
        ruleId: 'PT1003',
        path: ['semantic', 'action'],
      }),
    ])
  })

  it('requires a source name when several sources are configured', async () => {
    const configPath = await writeProject('{size.base}')
    const text = await fs.readFile(configPath, 'utf8')
    await fs.writeFile(
      configPath,
      text.replace(
        '    brand: {',
        "    product: { type: 'dtcg', file: './tokens.json', architecture: { layers: [{ id: 'all', roots: ['size'], values: 'either' }] } },\n    brand: {"
      ),
      'utf8'
    )

    await expect(runCheck(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Use --source'
    )
  })

  it('rejects unknown flags in the config-backed command', async () => {
    const configPath = await writeProject('{size.base}')

    await expect(
      runCheck(parseArgs(['--config', configPath, '--quiet']))
    ).rejects.toThrow('Unknown option: --quiet')
  })

  it('rejects a repeated shared flag', async () => {
    const configPath = await writeProject('{size.base}')

    await expect(
      runCheck(
        parseArgs(['--config', configPath, '--format', 'text', '--format=json'])
      )
    ).rejects.toThrow('Duplicate option: --format')
  })
})
