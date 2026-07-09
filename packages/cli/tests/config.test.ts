import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defineConfig } from '../src/config'
import { loadPrimitreeConfig } from '../src/config/load'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'primitree-config-')
  )
  temporaryDirectories.push(directory)
  return directory
}

async function writeConfig(
  directory: string,
  config: unknown,
  fileName = 'primitree.config.ts'
): Promise<string> {
  const configPath = path.join(directory, fileName)
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(
    configPath,
    `export default ${JSON.stringify(config, null, 2)}\n`,
    'utf8'
  )
  return configPath
}

const source = {
  type: 'dtcg',
  file: './tokens.json',
  architecture: {
    layers: [
      {
        id: 'primitive',
        roots: ['color'],
        values: 'literal',
      },
      {
        id: 'semantic',
        roots: ['semantic'],
        values: 'reference',
        references: ['primitive'],
      },
    ],
  },
  ownership: { default: ['design-systems'] },
} as const

describe('defineConfig', () => {
  it('returns the typed config object unchanged', () => {
    const config = { schemaVersion: 1, sources: { brand: source } } as const

    expect(defineConfig(config)).toBe(config)
  })

  it('checks unknown fields in config literals', () => {
    const compileOnly = () =>
      defineConfig({
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            // @ts-expect-error credentials are not part of a local DTCG source
            token: 'secret',
          },
        },
      })

    expect(compileOnly).toBeTypeOf('function')
  })
})

describe('loadPrimitreeConfig', () => {
  it('loads the exact default file and resolves source paths from it', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })

    const loaded = await loadPrimitreeConfig({ cwd: directory })
    const brand = loaded.sources.brand

    expect(loaded.configPath).toBe(configPath)
    expect(brand).toBeDefined()
    expect(brand!.file).toBe(path.join(directory, 'tokens.json'))
    expect(brand!.architecture.layers[0]?.references).toEqual([])
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(brand)).toBe(true)
  })

  it('does not search a parent directory', async () => {
    const directory = await temporaryDirectory()
    const nested = path.join(directory, 'packages', 'tokens')
    await fs.mkdir(nested, { recursive: true })
    await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })

    await expect(loadPrimitreeConfig({ cwd: nested })).rejects.toThrow(
      'primitree.config.ts'
    )
  })

  it.each([
    ['unknown root field', { schemaVersion: 1, sources: {}, extra: true }],
    [
      'unknown source field',
      {
        schemaVersion: 1,
        sources: { brand: { ...source, url: 'https://example.com' } },
      },
    ],
    [
      'five layers',
      {
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            architecture: {
              layers: Array.from({ length: 5 }, (_, index) => ({
                id: `layer-${index}`,
                roots: [`root-${index}`],
                values: 'either',
              })),
            },
          },
        },
      },
    ],
    [
      'duplicate roots',
      {
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            architecture: {
              layers: [
                { id: 'first', roots: ['color'], values: 'literal' },
                { id: 'second', roots: ['color'], values: 'reference' },
              ],
            },
          },
        },
      },
    ],
  ])('rejects $name', async (_name, config) => {
    const directory = await temporaryDirectory()
    await writeConfig(directory, config)

    await expect(loadPrimitreeConfig({ cwd: directory })).rejects.toThrow()
  })
})
