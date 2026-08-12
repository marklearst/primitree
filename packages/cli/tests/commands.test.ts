import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from '../src/args'
import { runBuild } from '../src/commands/build'
import { runDiff } from '../src/commands/diff'
import { runCheck } from '../src/commands/check'
import { runExport } from '../src/commands/export'
import { runInit } from '../src/commands/init'

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')

let tmpDir: string
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-cli-'))
  vi.clearAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  process.exitCode = undefined
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function readOut(...segments: string[]): Promise<string> {
  return fs.readFile(path.join(tmpDir, ...segments), 'utf8')
}

describe('primitree global help', () => {
  it('accepts --help as a successful global option', () => {
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage:')
    expect(result.stdout).toContain('primitree <command> [options]')
    expect(result.stderr).toBe('')
  })
})

describe('primitree build', () => {
  it('uses singular labels for one collection and token', async () => {
    const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
    const collectionId = 'VariableCollectionId:1:100'
    const variableId = 'VariableID:1:101'
    fixture.meta.variableCollections = {
      [collectionId]: {
        ...fixture.meta.variableCollections[collectionId],
        variableIds: [variableId],
      },
    }
    fixture.meta.variables = {
      [variableId]: fixture.meta.variables[variableId],
    }
    const singleVariablePath = path.join(tmpDir, 'single-variable.json')
    const out = path.join(tmpDir, 'single-variable-tokens')
    await fs.writeFile(singleVariablePath, JSON.stringify(fixture))

    await runBuild(parseArgs([singleVariablePath, '--out', out]))

    expect(console.log).toHaveBeenCalledWith(
      `Wrote 1 token from 1 collection to ${out}/`
    )
  })

  it('writes the full pipeline to the output directory', async () => {
    const out = path.join(tmpDir, 'design-tokens')
    await runBuild(parseArgs([fixturePath, '--out', out]))

    const resolver = JSON.parse(
      await readOut('design-tokens', 'tokens', 'tokens.resolver.json')
    )
    expect(resolver.version).toBe('2025.10')

    const css = await readOut('design-tokens', 'css', 'tokens.css')
    expect(css).toContain(':root {')
    expect(css).toContain("[data-semantic='dark']")

    const ts = await readOut('design-tokens', 'ts', 'tokens.ts')
    expect(ts).toContain('export type TokenPath')

    const sd = await readOut('design-tokens', 'style-dictionary.config.mjs')
    expect(sd).toContain('tokens/primitives.tokens.json')

    const workflow = await readOut(
      'design-tokens',
      'design-tokens.workflow.yml'
    )
    expect(workflow).toContain('@primitree/cli@1.0.0')
    expect(workflow).toContain('./node_modules/.bin/primitree build')
    expect(workflow).not.toMatch(/\bnpx\b/)
  })

  it('supports --terrazzo and opt-out flags', async () => {
    const out = path.join(tmpDir, 'tz')
    await runBuild(
      parseArgs([fixturePath, '--out', out, '--terrazzo', '--no-tailwind'])
    )
    await expect(readOut('tz', 'terrazzo.config.mjs')).resolves.toContain(
      '@terrazzo/cli'
    )
    await expect(
      fs.stat(path.join(out, 'css/tokens.tailwind.css'))
    ).rejects.toThrow()
  })

  it('fails on a missing input file', async () => {
    await expect(
      runBuild(parseArgs(['nope.json', '--out', tmpDir]))
    ).rejects.toThrow(/could not read file/i)
  })
})

describe('primitree diff', () => {
  it('writes a markdown changelog and sets exit code on breaking changes', async () => {
    const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
    const next = structuredClone(fixture)
    next.meta.variables['VariableID:2:201'].name = 'color/bg/primary'
    const nextPath = path.join(tmpDir, 'new.json')
    await fs.writeFile(nextPath, JSON.stringify(next))

    const outPath = path.join(tmpDir, 'diff.md')
    await runDiff(
      parseArgs([fixturePath, nextPath, '--out', outPath, '--fail-on-breaking'])
    )

    const markdown = await fs.readFile(outPath, 'utf8')
    expect(markdown).toContain('`color/bg/brand` -> `color/bg/primary`')
    expect(markdown).toContain('**The diff contains breaking changes.**')
    expect(process.exitCode).toBe(2)
  })

  it('emits JSON with --json', async () => {
    const outPath = path.join(tmpDir, 'diff.json')
    await runDiff(
      parseArgs([fixturePath, fixturePath, '--json', '--out', outPath])
    )
    const diff = JSON.parse(await fs.readFile(outPath, 'utf8'))
    expect(diff.hasChanges).toBe(false)
    expect(process.exitCode).toBeUndefined()
  })
})

describe('primitree check', () => {
  it('uses a singular warning label when one warning passes', async () => {
    const emptyPath = path.join(tmpDir, 'empty.json')
    await fs.writeFile(
      emptyPath,
      JSON.stringify({
        meta: {
          variableCollections: {},
          variables: {},
        },
      })
    )

    await runCheck(parseArgs([emptyPath]))

    expect(console.log).toHaveBeenCalledWith('Check passed with 1 warning.')
  })

  it('uses singular and plural count labels when one error fails', async () => {
    const invalidPath = path.join(tmpDir, 'invalid.json')
    await fs.writeFile(invalidPath, '{}')

    await runCheck(parseArgs([invalidPath]))

    expect(console.error).toHaveBeenCalledWith(
      '\nCheck failed: 1 error, 0 warnings.'
    )
  })

  it('passes a valid variables export', async () => {
    await runCheck(parseArgs([fixturePath]))
    expect(process.exitCode).toBeUndefined()
  })

  it('fails an export with a dangling alias', async () => {
    const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
    fixture.meta.variables['VariableID:2:201'].valuesByMode['2:0'] = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:404:404',
    }
    const brokenPath = path.join(tmpDir, 'broken.json')
    await fs.writeFile(brokenPath, JSON.stringify(fixture))

    await runCheck(parseArgs([brokenPath]))
    expect(process.exitCode).toBe(1)
  })

  it('validates a built tokens directory including all permutations', async () => {
    const out = path.join(tmpDir, 'built')
    await runBuild(parseArgs([fixturePath, '--out', out]))
    process.exitCode = undefined

    await runCheck(parseArgs([out]))
    expect(process.exitCode).toBeUndefined()
  })

  it('warns only when a built token has no effective type', async () => {
    const dir = path.join(tmpDir, 'effective-types')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({
        version: '2025.10',
        sets: {
          source: { sources: [{ $ref: 'source.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/source' }],
      })
    )
    await fs.writeFile(
      path.join(dir, 'source.tokens.json'),
      JSON.stringify({
        weights: {
          $type: 'fontWeight',
          inherited: { $value: 'semi-bold' },
          target: { $type: 'fontWeight', $value: 600 },
        },
        alias: { $value: '{weights.target}' },
        untyped: { $value: 'plain text' },
      })
    )

    await runCheck(parseArgs([dir]))

    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      'warning: Token "untyped" has no $type (context: default)'
    )
    expect(process.exitCode).toBeUndefined()
  })

  it('uses context-specific inherited and alias types when checking warnings', async () => {
    const dir = path.join(tmpDir, 'context-effective-types')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({
        version: '2025.10',
        modifiers: {
          theme: {
            default: 'light',
            contexts: {
              light: [{ $ref: 'light.tokens.json' }],
              dark: [{ $ref: 'dark.tokens.json' }],
            },
          },
        },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }],
      })
    )
    await fs.writeFile(
      path.join(dir, 'light.tokens.json'),
      JSON.stringify({
        weights: {
          $type: 'fontWeight',
          current: { $value: 400 },
        },
        alias: { $value: '{weights.current}' },
      })
    )
    await fs.writeFile(
      path.join(dir, 'dark.tokens.json'),
      JSON.stringify({
        weights: {
          $type: 'fontWeight',
          current: { $value: 700 },
        },
        alias: { $value: '{weights.current}' },
      })
    )

    await runCheck(parseArgs([dir]))

    expect(console.warn).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('shares one work limit across every built token context', async () => {
    const dir = path.join(tmpDir, 'bounded-contexts')
    const document = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [
        `token-${index}-${'x'.repeat(500)}`,
        { $type: 'string', $value: 'value' },
      ])
    )
    const contexts = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `context-${index}`,
        [{ $ref: 'repeated.tokens.json' }],
      ])
    )
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({
        version: '2025.10',
        modifiers: { theme: { contexts } },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }],
      })
    )
    await fs.writeFile(
      path.join(dir, 'repeated.tokens.json'),
      JSON.stringify(document)
    )

    await expect(runCheck(parseArgs([dir]))).rejects.toThrow(
      'Resolver context validation exceeds the 1,000,000-unit work limit.'
    )
  })
})

describe('primitree export', () => {
  it('fetches the complete Figma response and writes it to the requested file', async () => {
    const response = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
    const out = path.join(tmpDir, 'exports', 'variables.json')
    vi.stubEnv('FIGMA_TOKEN', 'fixture-token')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    await runExport(parseArgs(['--file-key', 'fixture-file', '--out', out]))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/fixture-file/variables/local',
      {
        method: 'GET',
        headers: {
          'X-FIGMA-TOKEN': 'fixture-token',
          'Content-Type': 'application/json',
        },
      }
    )
    await expect(fs.readFile(out, 'utf8')).resolves.toBe(
      `${JSON.stringify(response, null, 2)}\n`
    )
    expect(console.log).toHaveBeenCalledWith(
      `Wrote variables to ${path.resolve(out)}`
    )
    expect(console.log).toHaveBeenCalledWith('Collections: 3, variables: 12')
  })

  it('rejects a missing token before attempting a live export', async () => {
    vi.stubEnv('FIGMA_TOKEN', '')
    vi.stubEnv('FIGMA_PAT', '')

    await expect(
      runExport(parseArgs(['--file-key', 'fixture-file']))
    ).rejects.toThrow('Set FIGMA_TOKEN or FIGMA_PAT')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing file key before attempting a live export', async () => {
    vi.stubEnv('FIGMA_TOKEN', 'fixture-token')
    vi.stubEnv('FIGMA_FILE_KEY', '')

    await expect(runExport(parseArgs([]))).rejects.toThrow(
      'Pass --file-key or set FIGMA_FILE_KEY'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('primitree init', () => {
  it('scaffolds a working tokens repo with sample data', async () => {
    const repo = path.join(tmpDir, 'my-tokens')
    await runInit(parseArgs([repo]))

    const pkg = JSON.parse(await readOut('my-tokens', 'package.json'))
    expect(pkg.devDependencies['@primitree/cli']).toBeDefined()
    expect(pkg.scripts.build).toContain('primitree build')
    expect(pkg.scripts.check).toBe(
      'primitree check variables.json && primitree check tokens'
    )
    expect(pkg.scripts.diff).toBe(
      'primitree diff backup/variables.json variables.json'
    )

    await expect(readOut('my-tokens', 'variables.json')).resolves.toContain(
      'variableCollections'
    )
    await expect(
      readOut('my-tokens', 'tokens', 'tokens.resolver.json')
    ).resolves.toContain('2025.10')
    await expect(
      readOut('my-tokens', '.github', 'workflows', 'design-tokens.yml')
    ).resolves.toContain('Design Tokens')
    await expect(
      readOut('my-tokens', 'backup', 'variables.json')
    ).resolves.toContain('variableCollections')
    await expect(readOut('my-tokens', 'README.md')).resolves.toContain(
      'The GitHub Actions workflow rebuilds and commits the pipeline after a push'
    )
    await expect(readOut('my-tokens', 'README.md')).resolves.toContain(
      'primitree export'
    )
  })

  it('seeds from a provided export and refuses to overwrite', async () => {
    const repo = path.join(tmpDir, 'seeded')
    await runInit(parseArgs([repo, '--from', fixturePath]))
    await expect(readOut('seeded', 'variables.json')).resolves.toContain(
      'Primitives'
    )
    await expect(
      runInit(parseArgs([repo, '--from', fixturePath]))
    ).rejects.toThrow(/refusing to overwrite/i)
  })

  it('reports every owned collision and writes nothing', async () => {
    const repo = path.join(tmpDir, 'occupied')
    await fs.mkdir(path.join(repo, '.github', 'workflows'), { recursive: true })
    await fs.writeFile(path.join(repo, 'package.json'), 'package sentinel')
    await fs.writeFile(
      path.join(repo, '.github', 'workflows', 'design-tokens.yml'),
      'workflow sentinel'
    )

    await expect(runInit(parseArgs([repo]))).rejects.toThrow(
      /package\.json[\s\S]*\.github\/workflows\/design-tokens\.yml/
    )
    await expect(readOut('occupied', 'package.json')).resolves.toBe(
      'package sentinel'
    )
    await expect(
      readOut('occupied', '.github', 'workflows', 'design-tokens.yml')
    ).resolves.toBe('workflow sentinel')
    await expect(fs.lstat(path.join(repo, 'variables.json'))).rejects.toThrow()
  })

  it('force replaces owned paths and preserves unrelated files', async () => {
    const repo = path.join(tmpDir, 'forced')
    await fs.mkdir(repo, { recursive: true })
    await fs.writeFile(path.join(repo, 'package.json'), 'old')
    await fs.writeFile(path.join(repo, 'notes.txt'), 'keep me')

    await runInit(parseArgs([repo, '--force']))

    expect(JSON.parse(await readOut('forced', 'package.json')).private).toBe(
      true
    )
    await expect(readOut('forced', 'notes.txt')).resolves.toBe('keep me')
  })

  it('initializes a non-empty directory when no owned path collides', async () => {
    const repo = path.join(tmpDir, 'notes-only')
    await fs.mkdir(repo, { recursive: true })
    await fs.writeFile(path.join(repo, 'notes.txt'), 'keep me')

    await runInit(parseArgs([repo]))

    await expect(readOut('notes-only', 'variables.json')).resolves.toContain(
      'variableCollections'
    )
    await expect(readOut('notes-only', 'notes.txt')).resolves.toBe('keep me')
  })

  it('rejects non-directory ancestors even with force before writing', async () => {
    const repo = path.join(tmpDir, 'file-ancestor')
    await fs.mkdir(repo, { recursive: true })
    await fs.writeFile(path.join(repo, 'tokens'), 'token sentinel')
    await fs.writeFile(path.join(repo, 'package.json'), 'package sentinel')

    await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
      /tokens[\s\S]*not a directory[\s\S]*package\.json/i
    )
    await expect(readOut('file-ancestor', 'tokens')).resolves.toBe(
      'token sentinel'
    )
    await expect(readOut('file-ancestor', 'package.json')).resolves.toBe(
      'package sentinel'
    )
    await expect(fs.lstat(path.join(repo, 'variables.json'))).rejects.toThrow()
  })

  it.skipIf(process.platform === 'win32')(
    'rejects symlink ancestors even with force without writing through them',
    async () => {
      const repo = path.join(tmpDir, 'linked-ancestor')
      const outside = path.join(tmpDir, 'outside-tokens')
      await fs.mkdir(repo, { recursive: true })
      await fs.mkdir(outside, { recursive: true })
      await fs.symlink(outside, path.join(repo, 'tokens'), 'dir')

      await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
        /tokens[\s\S]*symbolic link/i
      )
      expect((await fs.lstat(path.join(repo, 'tokens'))).isSymbolicLink()).toBe(
        true
      )
      await expect(fs.readdir(outside)).resolves.toEqual([])
      await expect(
        fs.lstat(path.join(repo, 'variables.json'))
      ).rejects.toThrow()
    }
  )

  it.skipIf(process.platform === 'win32')(
    'force replaces an owned leaf symlink without touching its target',
    async () => {
      const repo = path.join(tmpDir, 'linked-leaf')
      const outside = path.join(tmpDir, 'outside-readme.md')
      await fs.mkdir(repo, { recursive: true })
      await fs.writeFile(outside, 'outside sentinel')
      await fs.symlink(outside, path.join(repo, 'README.md'))

      await runInit(parseArgs([repo, '--force']))

      expect(
        (await fs.lstat(path.join(repo, 'README.md'))).isSymbolicLink()
      ).toBe(false)
      await expect(readOut('linked-leaf', 'README.md')).resolves.toContain(
        '# linked-leaf'
      )
      await expect(fs.readFile(outside, 'utf8')).resolves.toBe(
        'outside sentinel'
      )
    }
  )

  it('rejects owned leaf directories even with force before writing', async () => {
    const repo = path.join(tmpDir, 'directory-leaf')
    await fs.mkdir(path.join(repo, 'README.md'), { recursive: true })
    await fs.writeFile(
      path.join(repo, 'README.md', 'notes.txt'),
      'directory sentinel'
    )

    await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
      /README\.md[\s\S]*directory/i
    )
    await expect(
      readOut('directory-leaf', 'README.md', 'notes.txt')
    ).resolves.toBe('directory sentinel')
    await expect(fs.lstat(path.join(repo, 'variables.json'))).rejects.toThrow()
  })

  it('rejects a non-directory target even with force', async () => {
    const repo = path.join(tmpDir, 'target-file')
    await fs.writeFile(repo, 'target sentinel')

    await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
      /target-file[\s\S]*not a directory/i
    )
    await expect(fs.readFile(repo, 'utf8')).resolves.toBe('target sentinel')
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink target even with force without writing through it',
    async () => {
      const outside = path.join(tmpDir, 'outside-repo')
      const repo = path.join(tmpDir, 'linked-repo')
      await fs.mkdir(outside, { recursive: true })
      await fs.symlink(outside, repo, 'dir')

      await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
        /linked-repo[\s\S]*symbolic link/i
      )
      expect((await fs.lstat(repo)).isSymbolicLink()).toBe(true)
      await expect(fs.readdir(outside)).resolves.toEqual([])
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a fresh destination beneath a symlinked parent',
    async () => {
      const outside = path.join(tmpDir, 'outside-fresh-parent')
      const linkedParent = path.join(tmpDir, 'linked-fresh-parent')
      const repo = path.join(linkedParent, 'fresh-repo')
      await fs.mkdir(outside, { recursive: true })
      await fs.writeFile(path.join(outside, 'sentinel.txt'), 'outside sentinel')
      await fs.symlink(outside, linkedParent, 'dir')

      await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
        /Unsafe[\s\S]*linked-fresh-parent[\s\S]*destination parent is a symbolic link[\s\S]*--force cannot bypass/i
      )

      expect((await fs.lstat(linkedParent)).isSymbolicLink()).toBe(true)
      await expect(
        fs.readFile(path.join(outside, 'sentinel.txt'), 'utf8')
      ).resolves.toBe('outside sentinel')
      await expect(fs.lstat(path.join(outside, 'fresh-repo'))).rejects.toThrow()
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects an existing destination beneath a symlinked parent',
    async () => {
      const outside = path.join(tmpDir, 'outside-existing-parent')
      const existingRepo = path.join(outside, 'existing-repo')
      const linkedParent = path.join(tmpDir, 'linked-existing-parent')
      const repo = path.join(linkedParent, 'existing-repo')
      await fs.mkdir(existingRepo, { recursive: true })
      await fs.writeFile(
        path.join(existingRepo, 'package.json'),
        'package sentinel'
      )
      await fs.writeFile(path.join(existingRepo, 'notes.txt'), 'notes sentinel')
      await fs.symlink(outside, linkedParent, 'dir')

      await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
        /Unsafe[\s\S]*linked-existing-parent[\s\S]*destination parent is a symbolic link[\s\S]*--force cannot bypass/i
      )

      expect((await fs.lstat(linkedParent)).isSymbolicLink()).toBe(true)
      await expect(
        fs.readFile(path.join(existingRepo, 'package.json'), 'utf8')
      ).resolves.toBe('package sentinel')
      await expect(
        fs.readFile(path.join(existingRepo, 'notes.txt'), 'utf8')
      ).resolves.toBe('notes sentinel')
      await expect(
        fs.lstat(path.join(existingRepo, 'variables.json'))
      ).rejects.toThrow()
      await expect(fs.readdir(existingRepo)).resolves.toEqual([
        'notes.txt',
        'package.json',
      ])
    }
  )

  it('rejects a destination beneath a non-directory parent component', async () => {
    const parentFile = path.join(tmpDir, 'file-parent')
    const repo = path.join(parentFile, 'child-repo')
    await fs.writeFile(parentFile, 'parent sentinel')

    await expect(runInit(parseArgs([repo, '--force']))).rejects.toThrow(
      /Unsafe[\s\S]*file-parent[\s\S]*destination parent is not a directory[\s\S]*--force cannot bypass/i
    )

    await expect(fs.readFile(parentFile, 'utf8')).resolves.toBe(
      'parent sentinel'
    )
    expect((await fs.lstat(parentFile)).isFile()).toBe(true)
  })
})
