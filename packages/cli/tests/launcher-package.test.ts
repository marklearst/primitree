import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const launcherDirectory = path.join(import.meta.dirname, '../../primitree')
const manifestPath = path.join(launcherDirectory, 'package.json')
const launcherPath = path.join(launcherDirectory, 'bin/primitree.js')

describe('unscoped Primitree launcher', () => {
  it('forwards the public command to the scoped CLI', async () => {
    expect(existsSync(manifestPath)).toBe(true)
    expect(existsSync(launcherPath)).toBe(true)
    if (!existsSync(manifestPath) || !existsSync(launcherPath)) {
      return
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    expect(manifest.name).toBe('primitree')
    expect(manifest.bin).toEqual({ primitree: './bin/primitree.js' })
    expect(manifest.exports).toBeUndefined()
    expect(manifest.dependencies).toEqual({ '@primitree/cli': 'workspace:*' })

    const help = spawnSync(process.execPath, [launcherPath, '--help'], {
      cwd: launcherDirectory,
      encoding: 'utf8',
    })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('primitree <command> [options]')
    expect(help.stderr).toBe('')

    const unknown = spawnSync(process.execPath, [launcherPath, 'unknown'], {
      cwd: launcherDirectory,
      encoding: 'utf8',
    })
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('Unknown command: unknown')
  })
})
