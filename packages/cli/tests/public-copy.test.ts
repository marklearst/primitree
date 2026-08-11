import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseArgs } from '../src/args'
import { buildHelp } from '../src/commands/build'
import { checkHelp } from '../src/commands/check'
import { diffHelp } from '../src/commands/diff'
import { exportHelp } from '../src/commands/export'
import { initHelp, runInit } from '../src/commands/init'
import { inspectHelp } from '../src/commands/inspect'

const cliManifest = JSON.parse(
  await fs.readFile(path.join(import.meta.dirname, '../package.json'), 'utf8')
)
const hooksManifest = JSON.parse(
  await fs.readFile(
    path.join(import.meta.dirname, '../../hooks/package.json'),
    'utf8'
  )
)

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  )
})

describe('public CLI copy', () => {
  it('describes commands in factual language', () => {
    const cliPath = path.join(import.meta.dirname, '../dist/index.js')
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf8',
    })
    const copy = [
      result.stdout,
      buildHelp,
      checkHelp,
      diffHelp,
      exportHelp,
      initHelp,
      inspectHelp,
    ].join('\n')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(copy).toContain(
      'primitree: check and build design tokens from DTCG or Figma JSON'
    )
    expect(copy).toContain(
      'build    Check a configured DTCG source or convert a Figma variables export'
    )
    expect(copy).toContain(
      'DTCG 2025.10 tokens plus the documented Primitree boolean extension'
    )
    for (const command of [
      'init',
      'export',
      'build',
      'check',
      'diff',
      'inspect',
    ]) {
      expect(copy).toContain(`primitree ${command}`)
    }
    expect(exportHelp).toMatch(/a supported variables\s+plugin/u)
    expect(copy).not.toContain('TokensBrücke')
    expect(copy).not.toMatch(/[—]/)
    expect(copy).not.toMatch(/\b(?:production|full|automatically)\b/i)
  })

  it('writes a concise scaffold README', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'primitree-cli-copy-')
    )
    temporaryDirectories.push(directory)
    const repository = path.join(directory, 'tokens')

    await runInit(parseArgs([repository]))

    const readme = await fs.readFile(path.join(repository, 'README.md'), 'utf8')
    expect(readme).toContain(
      'The generated token files use DTCG 2025.10 plus a documented boolean extension.'
    )
    expect(readme).toContain(
      'The GitHub Actions workflow rebuilds and commits the pipeline after a push'
    )
    expect(readme).toContain('a supported variables plugin')
    expect(readme).not.toContain('TokensBrücke')
    expect(readme).not.toMatch(/[—]/)
    expect(readme).not.toMatch(/\bautomatically\b/i)
  })

  it('exposes the Primitree CLI without a hooks export command', () => {
    expect(cliManifest.bin).toEqual({ primitree: './dist/index.js' })
    expect(hooksManifest.bin).toBeUndefined()
    expect(hooksManifest.files).not.toContain('scripts/export-variables.mjs')
  })
})
