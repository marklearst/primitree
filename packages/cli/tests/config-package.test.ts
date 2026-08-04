import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDirectory = path.join(import.meta.dirname, '..')
const manifest = JSON.parse(
  await fs.readFile(path.join(packageDirectory, 'package.json'), 'utf8')
)

describe('@primitree/cli/config package contract', () => {
  it('ships the config helper and its TypeScript declarations', async () => {
    expect(manifest.exports['./config']).toEqual({
      types: './dist/config.d.ts',
      import: './dist/config.js',
      default: './dist/config.js',
    })

    await expect(
      fs.stat(path.join(packageDirectory, 'dist/config.js'))
    ).resolves.toBeDefined()
    await expect(
      fs.stat(path.join(packageDirectory, 'dist/config.d.ts'))
    ).resolves.toBeDefined()

    const configModule = await import(
      pathToFileURL(path.join(packageDirectory, 'dist/config.js')).href
    )
    expect(configModule).toHaveProperty('defineConfig')
  })
})
