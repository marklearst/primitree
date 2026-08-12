import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineConfig } from '../src/config'
import { loadPrimitreeConfig } from '../src/config/load'
import { loadConfiguredSourceGraph } from '../src/config/source'
import * as io from '../src/io'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
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

describe('loadConfiguredSourceGraph', () => {
  it('keeps source file read errors', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, '{}', 'utf8')
    vi.spyOn(io, 'readJsonFile').mockRejectedValue(
      new Error(`Could not read file: ${tokenPath}`)
    )

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      `Could not read file: ${tokenPath}`
    )
  })
})

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
  it('loads source output settings relative to the config file', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        brand: {
          ...source,
          outputs: {
            directory: './generated/tokens',
            formats: ['tailwind', 'dtcg'],
          },
        },
      },
    })

    const loaded = await loadPrimitreeConfig({ configPath })

    expect(loaded.sources.brand?.outputs).toEqual({
      directory: path.join(directory, 'generated', 'tokens'),
      formats: ['dtcg', 'tailwind'],
    })
  })

  it('uses all first-party formats when outputs omit the format list', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        brand: {
          ...source,
          outputs: { directory: './generated' },
        },
      },
    })

    const loaded = await loadPrimitreeConfig({ configPath })

    expect(loaded.sources.brand?.outputs?.formats).toEqual([
      'dtcg',
      'css',
      'typescript',
      'tailwind',
    ])
  })

  it.each([
    [
      'empty format list',
      { directory: './generated', formats: [] },
      'Source "brand" outputs need at least one format.',
    ],
    [
      'duplicate format',
      { directory: './generated', formats: ['dtcg', 'dtcg'] },
      'Source "brand" repeats output format "dtcg".',
    ],
    [
      'unknown format',
      { directory: './generated', formats: ['json'] },
      'Source "brand" has an unsupported output format: json.',
    ],
    [
      'absolute directory',
      { directory: '/tmp/generated' },
      'Source "brand" output directory must stay below the config directory.',
    ],
    [
      'parent traversal',
      { directory: '../generated' },
      'Source "brand" output directory must stay below the config directory.',
    ],
    [
      'config directory',
      { directory: '.' },
      'Source "brand" output directory cannot be the config directory.',
    ],
  ])('rejects output settings with $name', async (_name, outputs, message) => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: { ...source, outputs } },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(message)
  })

  it.each([
    ['./build/CON', 'CON'],
    ['./build/prn.txt', 'prn.txt'],
    ['./build/COM1', 'COM1'],
    ['./build/LPT³.cache', 'LPT³.cache'],
    ['./build/name:stream', 'name:stream'],
    ['./build/name?.json', 'name?.json'],
    ['./build/name*', 'name*'],
    ['./build/control-\u001f', 'control-\u001f'],
    ['./build/control-\u007f', 'control-\u007f'],
    ['./build/cache.', 'cache.'],
    ['./build/cache ', 'cache '],
  ])(
    'rejects Windows-unsafe output directory segment %j',
    async (configuredDirectory, unsafeSegment) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            outputs: { directory: configuredDirectory },
          },
        },
      })

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
        `Source "brand" output directory has an unsafe path segment: ${JSON.stringify(unsafeSegment)}.`
      )
    }
  )

  it('rejects an output directory that contains its source file', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        brand: {
          ...source,
          file: './generated/tokens.json',
          outputs: { directory: './generated' },
        },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "brand" output directory cannot contain its token file.'
    )
  })

  it('rejects a symbolic link in the output directory path', async () => {
    const directory = await temporaryDirectory()
    const outside = await temporaryDirectory()
    await fs.symlink(outside, path.join(directory, 'linked'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        brand: {
          ...source,
          outputs: { directory: './linked/generated' },
        },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "brand" output directory cannot use a symbolic link.'
    )
  })

  it.each([
    [
      'matching',
      './generated',
      './generated',
      'Source "secondary" output directory "generated" overlaps source "primary" output directory "generated".',
    ],
    [
      'nested',
      './generated',
      './generated/secondary',
      'Source "secondary" output directory "generated/secondary" overlaps source "primary" output directory "generated".',
    ],
    [
      'parent',
      './generated/primary',
      './generated',
      'Source "secondary" output directory "generated" overlaps source "primary" output directory "generated/primary".',
    ],
    [
      'case-insensitive',
      './Generated',
      './generated/secondary',
      'Source "secondary" output directory "generated/secondary" overlaps source "primary" output directory "Generated".',
    ],
    [
      'Unicode-normalized',
      './généré',
      './généré/secondary',
      'Source "secondary" output directory "généré/secondary" overlaps source "primary" output directory "généré".',
    ],
    [
      'Unicode-case',
      './ΟΣ',
      './Οσ/secondary',
      'Source "secondary" output directory "Οσ/secondary" overlaps source "primary" output directory "ΟΣ".',
    ],
  ])(
    'rejects %s output directories across sources',
    async (_name, primaryDirectory, secondaryDirectory, message) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: {
          primary: {
            ...source,
            outputs: { directory: primaryDirectory },
          },
          secondary: {
            ...source,
            outputs: { directory: secondaryDirectory },
          },
        },
      })

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(message)
    }
  )

  it('allows output directories with matching name prefixes', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        primary: {
          ...source,
          outputs: { directory: './generated' },
        },
        secondary: {
          ...source,
          outputs: { directory: './generated-copy' },
        },
      },
    })

    const loaded = await loadPrimitreeConfig({ configPath })

    expect(loaded.sources.primary?.outputs?.directory).toBe(
      path.join(directory, 'generated')
    )
    expect(loaded.sources.secondary?.outputs?.directory).toBe(
      path.join(directory, 'generated-copy')
    )
  })

  it('bounds output overlap comparisons as source count grows', async () => {
    const directory = await temporaryDirectory()
    const sourceCount = 64
    const sources = Object.fromEntries(
      Array.from({ length: sourceCount }, (_, index) => [
        `source-${index}`,
        {
          ...source,
          outputs: { directory: `./generated/${index}` },
        },
      ])
    )
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources,
    })
    const relative = path.relative.bind(path)
    const relativeCalls = vi
      .spyOn(path, 'relative')
      .mockImplementation((from, to) => relative(from, to))

    await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()

    expect(relativeCalls.mock.calls.length).toBeLessThan(sourceCount * 10)
  })

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
    expect(brand?.file).toBe(path.join(directory, 'tokens.json'))
    expect(brand?.architecture.layers[0]?.references).toEqual([])
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

  it('names the required shape for a source layer', async () => {
    const directory = await temporaryDirectory()
    await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        brand: {
          ...source,
          architecture: { layers: ['primitive'] },
        },
      },
    })

    await expect(loadPrimitreeConfig({ cwd: directory })).rejects.toThrow(
      'Source "brand" layer 1 must be an object.'
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
