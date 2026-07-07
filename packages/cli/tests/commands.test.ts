import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from '../src/args'
import { runBuild } from '../src/commands/build'
import { runDiff } from '../src/commands/diff'
import { runCheck } from '../src/commands/check'
import { runInit } from '../src/commands/init'

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'figma-vars-cli-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function readOut(...segments: string[]): Promise<string> {
  return fs.readFile(path.join(tmpDir, ...segments), 'utf8')
}

describe('figma-vars build', () => {
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

    await expect(
      readOut('design-tokens', 'design-tokens.workflow.yml')
    ).resolves.toContain('npx @figma-vars/cli build')
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

describe('figma-vars diff', () => {
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
    expect(markdown).toContain('**Breaking changes detected.**')
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

describe('figma-vars check', () => {
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
})

describe('figma-vars init', () => {
  it('scaffolds a working tokens repo with sample data', async () => {
    const repo = path.join(tmpDir, 'my-tokens')
    await runInit(parseArgs([repo]))

    const pkg = JSON.parse(await readOut('my-tokens', 'package.json'))
    expect(pkg.devDependencies['@figma-vars/cli']).toBeDefined()
    expect(pkg.scripts.build).toContain('figma-vars build')

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
})
