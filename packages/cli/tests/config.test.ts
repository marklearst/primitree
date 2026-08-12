import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineConfig } from '../src/config'
import { loadPrimitreeConfig } from '../src/config/load'
import { loadConfiguredSourceGraph } from '../src/config/source'

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

const parseableJsonWithInvalidUtf8 = Buffer.concat([
  Buffer.from('{"color":"'),
  Buffer.from([0xc3, 0x28]),
  Buffer.from('"}'),
])

describe('loadConfiguredSourceGraph', () => {
  it('reads source metadata and contents from one opened file', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    const original = {
      color: { base: { $type: 'number', $value: 1 } },
      semantic: {
        action: { $type: 'number', $value: '{color.base}' },
      },
    }
    const replacement = {
      color: { base: { $type: 'number', $value: 2 } },
      semantic: {
        action: { $type: 'number', $value: '{color.base}' },
      },
    }
    await fs.writeFile(tokenPath, JSON.stringify(original), 'utf8')
    const stat = fs.stat.bind(fs)
    const open = fs.open.bind(fs)
    let replaced = false
    let sourceStatCalls = 0
    const replacePath = async () => {
      if (replaced) {
        return
      }
      replaced = true
      await fs.rename(tokenPath, `${tokenPath}.original`)
      await fs.writeFile(tokenPath, JSON.stringify(replacement), 'utf8')
    }
    vi.spyOn(fs, 'stat').mockImplementation(async target => {
      const stats = await stat(target)
      if (String(target) === tokenPath) {
        sourceStatCalls += 1
        if (!replaced) {
          await replacePath()
        }
      }
      return stats
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (!replaced && String(target) === tokenPath) {
        await replacePath()
      }
      return handle
    })

    const loaded = await loadConfiguredSourceGraph({ configPath })

    expect(replaced).toBe(true)
    expect(sourceStatCalls).toBe(0)
    expect(loaded.document).toEqual(original)
  })

  it.skipIf(process.platform === 'win32')(
    'opens a FIFO without waiting for a writer',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: { brand: source },
      })
      const tokenPath = path.join(directory, 'tokens.json')
      execFileSync('mkfifo', [tokenPath])
      const open = fs.open.bind(fs)
      let usedNonblockingOpen = false
      let closeCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) !== tokenPath) {
          return open(target, flags, mode)
        }
        usedNonblockingOpen =
          typeof flags === 'number' &&
          (flags & fsConstants.O_NONBLOCK) === fsConstants.O_NONBLOCK
        if (!usedNonblockingOpen) {
          throw new Error('The FIFO open would wait for a writer.')
        }
        const handle = await open(target, flags, mode)
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closeCalls += 1
          await close()
        })
        return handle
      })

      await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
        'Could not read the file for source "brand".'
      )
      expect(usedNonblockingOpen).toBe(true)
      expect(closeCalls).toBe(1)
    }
  )

  it('stops when the opened source grows beyond 10 MiB', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(
      tokenPath,
      JSON.stringify({ color: { base: { $type: 'number', $value: 1 } } }),
      'utf8'
    )
    const open = fs.open.bind(fs)
    let openedHandle: Awaited<ReturnType<typeof fs.open>> | undefined
    let grew = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        openedHandle = handle
        const stat = handle.stat.bind(handle)
        vi.spyOn(handle, 'stat').mockImplementation(async () => {
          const stats = await stat()
          if (!grew) {
            grew = true
            await fs.truncate(tokenPath, 10 * 1024 * 1024 + 1)
          }
          return stats
        })
      }
      return handle
    })

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      'The file for source "brand" exceeds the 10 MiB file limit.'
    )

    expect(grew).toBe(true)
    const closedHandle = openedHandle
    if (closedHandle === undefined) {
      throw new Error('The source file was not opened.')
    }
    await expect(closedHandle.stat()).rejects.toMatchObject({ code: 'EBADF' })
  })

  it('keeps the source error when closing the file also fails', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, '{}', 'utf8')
    await fs.truncate(tokenPath, 10 * 1024 * 1024 + 1)
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close()
          throw new Error('Injected source close failure.')
        })
      }
      return handle
    })

    const failure = await loadConfiguredSourceGraph({ configPath }).catch(
      error => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected source loading to fail.')
    }
    expect(failure.message).toBe(
      `The file for source "brand" exceeds the 10 MiB file limit.\nCould not close file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
  })

  it('names the source file when closing it fails', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(
      tokenPath,
      JSON.stringify({ color: { base: { $type: 'number', $value: 1 } } }),
      'utf8'
    )
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close()
          throw new Error('Injected source close failure.')
        })
      }
      return handle
    })

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      `Could not close file: ${tokenPath}`
    )
  })

  it('keeps source file read errors', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, '{}', 'utf8')
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target) === tokenPath) {
        throw new Error('Injected source read failure.')
      }
      return open(target, flags, mode)
    })

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      `Could not read file: ${tokenPath}`
    )
  })

  it('reports invalid source JSON separately from read errors', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, '{', 'utf8')

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      `File is not valid JSON: ${tokenPath}`
    )
  })

  it('rejects invalid UTF-8 before parsing source JSON', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, parseableJsonWithInvalidUtf8)

    const failure = await loadConfiguredSourceGraph({ configPath }).catch(
      error => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected source loading to fail.')
    }
    expect(failure.message).toBe(`File is not valid UTF-8: ${tokenPath}`)
    expect(failure.cause).toBeInstanceOf(TypeError)
  })

  it('keeps an invalid UTF-8 error when closing the source also fails', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: { brand: source },
    })
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, parseableJsonWithInvalidUtf8)
    const closeFailure = new Error('Injected source close failure.')
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close()
          throw closeFailure
        })
      }
      return handle
    })

    const failure = await loadConfiguredSourceGraph({ configPath }).catch(
      error => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected source loading to fail.')
    }
    expect(failure.message).toBe(
      `File is not valid UTF-8: ${tokenPath}\nCould not close file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected source failures to be combined.')
    }
    const [decodeFailure, combinedCloseFailure] = failure.cause.errors
    expect(decodeFailure).toBeInstanceOf(Error)
    expect((decodeFailure as Error).cause).toBeInstanceOf(TypeError)
    expect(combinedCloseFailure).toBe(closeFailure)
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

  it.each([
    ['ASCII', 'a'.repeat(201)],
    ['multilingual', '界'.repeat(67)],
  ])(
    'rejects an output directory name over 200 UTF-8 bytes (%s)',
    async (_name, outputName) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            outputs: { directory: `./build/${outputName}` },
          },
        },
      })

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
        'Source "brand" output directory name is 201 UTF-8 bytes; use at most 200 UTF-8 bytes so Primitree can create its lock, staging, and backup paths.'
      )
    }
  )

  it.each([
    ['ASCII', 'a'.repeat(200)],
    ['multilingual', `${'界'.repeat(66)}aa`],
  ])(
    'accepts an output directory name with exactly 200 UTF-8 bytes (%s)',
    async (_name, outputName) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: {
          brand: {
            ...source,
            outputs: { directory: `./build/${outputName}` },
          },
        },
      })

      const loaded = await loadPrimitreeConfig({ configPath })

      expect(loaded.sources.brand?.outputs?.directory).toBe(
        path.join(directory, 'build', outputName)
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

  it.each([
    [
      'a source declared before the output',
      {
        tokens: {
          ...source,
          file: './generated/tokens.json',
        },
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
      },
      'Source "builder" output directory "generated" cannot contain source "tokens" token file "generated/tokens.json".',
    ],
    [
      'a source declared after the output',
      {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: {
          ...source,
          file: './generated/tokens.json',
        },
      },
      'Source "builder" output directory "generated" cannot contain source "tokens" token file "generated/tokens.json".',
    ],
    [
      'another source at the same path',
      {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: {
          ...source,
          file: './generated',
        },
      },
      'Source "builder" output directory "generated" cannot contain source "tokens" token file "generated".',
    ],
    [
      'another source through portable case comparison',
      {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './Generated' },
        },
        tokens: {
          ...source,
          file: './generated/tokens.json',
        },
      },
      'Source "builder" output directory "Generated" cannot contain source "tokens" token file "generated/tokens.json".',
    ],
    [
      'another source through portable Unicode comparison',
      {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './GÉNÉRÉ' },
        },
        tokens: {
          ...source,
          file: './généré/tokens.json',
        },
      },
      'Source "builder" output directory "GÉNÉRÉ" cannot contain source "tokens" token file "généré/tokens.json".',
    ],
    [
      'an output below another source file',
      {
        tokens: {
          ...source,
          file: './tokens',
        },
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './tokens/generated' },
        },
        distractor: {
          ...source,
          file: './tokens/0.tokens.json',
        },
      },
      'Source "tokens" token file path "tokens" cannot contain source "builder" output directory "tokens/generated".',
    ],
  ])(
    'rejects an output directory that conflicts with %s',
    async (_name, sources, message) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources,
      })

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(message)
    }
  )

  it('allows output and source paths with matching name prefixes', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: {
          ...source,
          file: './generated-copy/tokens.json',
        },
      },
    })

    const loaded = await loadPrimitreeConfig({ configPath })

    expect(loaded.sources.builder?.outputs?.directory).toBe(
      path.join(directory, 'generated')
    )
    expect(loaded.sources.tokens?.file).toBe(
      path.join(directory, 'generated-copy', 'tokens.json')
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

  it('rejects a source reached through a directory link into an output', async () => {
    const directory = await temporaryDirectory()
    const generated = path.join(directory, 'generated')
    await fs.mkdir(generated)
    await fs.writeFile(path.join(generated, 'tokens.json'), '{}', 'utf8')
    await fs.symlink(generated, path.join(directory, 'linked-target'))
    await fs.symlink('./linked-target', path.join(directory, 'linked'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: { ...source, file: './linked/tokens.json' },
      },
    })
    const writeFile = vi.spyOn(fs, 'writeFile')

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "tokens" token file "linked/tokens.json" resolves inside source "builder" output directory "generated".'
    )
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects a source file link that targets an output', async () => {
    const directory = await temporaryDirectory()
    const generated = path.join(directory, 'generated')
    await fs.mkdir(generated)
    const target = path.join(generated, 'tokens.json')
    await fs.writeFile(target, '{}', 'utf8')
    await fs.symlink(target, path.join(directory, 'linked.tokens.json'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: { ...source, file: './linked.tokens.json' },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "tokens" token file "linked.tokens.json" resolves inside source "builder" output directory "generated".'
    )
  })

  it('rejects a source link into an output before the target exists', async () => {
    const directory = await temporaryDirectory()
    await fs.symlink('./generated', path.join(directory, 'linked'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: { ...source, file: './linked/tokens.json' },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "tokens" token file "linked/tokens.json" resolves inside source "builder" output directory "generated".'
    )
  })

  it('allows a source link that does not target an output', async () => {
    const directory = await temporaryDirectory()
    const actual = path.join(directory, 'actual')
    await fs.mkdir(actual)
    await fs.writeFile(path.join(actual, 'tokens.json'), '{}', 'utf8')
    await fs.symlink(actual, path.join(directory, 'linked'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: { ...source, file: './linked/tokens.json' },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()
  })

  it('rejects a source path with a symbolic link cycle', async () => {
    const directory = await temporaryDirectory()
    await fs.symlink('./second', path.join(directory, 'first'))
    await fs.symlink('./first', path.join(directory, 'second'))
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        builder: {
          ...source,
          file: './builder.tokens.json',
          outputs: { directory: './generated' },
        },
        tokens: { ...source, file: './first/tokens.json' },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "tokens" token file uses too many symbolic links.'
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

  it.each([
    ['lock path', './generated', './.generated.primitree-lock'],
    [
      'path below the lock path',
      './generated',
      './.generated.primitree-lock/nested',
    ],
    ['staging path', './generated', './.generated.primitree-stage-owned'],
    ['backup path', './generated', './.generated.primitree-backup-owned'],
    ['portable case match', './Generated', './.generated.primitree-lock'],
    [
      'portable Unicode match',
      './ge\u0301ne\u0301re\u0301',
      './.généré.primitree-lock',
    ],
    [
      'reserved path declared first',
      './.generated.primitree-stage-owned',
      './generated',
    ],
  ])(
    'rejects an output directory that uses another output %s',
    async (_name, primaryDirectory, secondaryDirectory) => {
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

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
        'uses a path reserved for source'
      )
    }
  )

  it('finds a reserved lock path after a near-prefix output', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources: {
        primary: {
          ...source,
          outputs: { directory: './generated' },
        },
        distractor: {
          ...source,
          outputs: { directory: './.generated.primitree-lock-copy' },
        },
        secondary: {
          ...source,
          outputs: { directory: './.generated.primitree-lock/nested' },
        },
      },
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Source "secondary" output directory ".generated.primitree-lock/nested" uses a path reserved for source "primary" output directory "generated".'
    )
  })

  it.each([
    ['./generated', './.generated.primitree-lock-copy'],
    ['./generated', './.generated.primitree-stage'],
    ['./generated', './.generated.primitree-backup'],
    ['./generated', './.generated-copy.primitree-lock'],
  ])(
    'allows output directories near reserved path names',
    async (primaryDirectory, secondaryDirectory) => {
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

      await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()
    }
  )

  it.each([
    ['lock path', './generated', './.generated.primitree-lock', false],
    [
      'path below the lock path',
      './generated',
      './.generated.primitree-lock/tokens.json',
      false,
    ],
    [
      'staging path',
      './generated',
      './.generated.primitree-stage-owned',
      false,
    ],
    [
      'backup path',
      './generated',
      './.generated.primitree-backup-owned',
      false,
    ],
    [
      'portable case match',
      './Generated',
      './.generated.primitree-lock',
      false,
    ],
    [
      'portable Unicode match',
      './ge\u0301ne\u0301re\u0301',
      './.généré.primitree-lock',
      false,
    ],
    [
      'source declared first',
      './generated',
      './.generated.primitree-backup-owned',
      true,
    ],
  ])(
    'rejects a token file that uses an output %s',
    async (_name, outputDirectory, sourceFile, sourceFirst) => {
      const directory = await temporaryDirectory()
      const builder = {
        ...source,
        file: './builder.tokens.json',
        outputs: { directory: outputDirectory },
      }
      const tokens = { ...source, file: sourceFile }
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: sourceFirst ? { tokens, builder } : { builder, tokens },
      })

      await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
        `Source "tokens" token file "${sourceFile.slice(2)}" uses a path reserved for source "builder" output directory "${outputDirectory.slice(2)}".`
      )
    }
  )

  it.each([
    ['./generated', './.generated.primitree-lock-copy'],
    ['./generated', './.generated.primitree-stage'],
    ['./generated', './.generated.primitree-backup'],
    ['./generated', './.generated-copy.primitree-lock'],
  ])(
    'allows token files near reserved path names',
    async (outputDirectory, sourceFile) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, {
        schemaVersion: 1,
        sources: {
          builder: {
            ...source,
            file: './builder.tokens.json',
            outputs: { directory: outputDirectory },
          },
          tokens: { ...source, file: sourceFile },
        },
      })

      await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()
    }
  )

  it('loads many non-overlapping output directories', async () => {
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
    await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()
  })

  it('limits source path reads while checking output conflicts', async () => {
    const directory = await temporaryDirectory()
    const sourceCount = 64
    const sources = Object.fromEntries(
      Array.from({ length: sourceCount }, (_, index) => [
        `source-${index}`,
        {
          ...source,
          file: `./source-${index}.tokens.json`,
          outputs: { directory: `./generated/${index}` },
        },
      ])
    )
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources,
    })
    const lstat = fs.lstat.bind(fs)
    let activeSourceReads = 0
    let peakSourceReads = 0
    vi.spyOn(fs, 'lstat').mockImplementation(async target => {
      if (/source-\d+\.tokens\.json$/u.test(String(target))) {
        activeSourceReads += 1
        peakSourceReads = Math.max(peakSourceReads, activeSourceReads)
        await new Promise(resolve => setTimeout(resolve, 20))
        activeSourceReads -= 1
      }
      return lstat(target)
    })

    await expect(loadPrimitreeConfig({ configPath })).resolves.toBeDefined()

    expect(peakSourceReads).toBeLessThanOrEqual(16)
  })

  it('stops source path reads before reporting a path error', async () => {
    const directory = await temporaryDirectory()
    const sourceCount = 64
    const sources = Object.fromEntries(
      Array.from({ length: sourceCount }, (_, index) => [
        `source-${index}`,
        {
          ...source,
          file: `./source-${index}.tokens.json`,
          outputs: { directory: `./generated/${index}` },
        },
      ])
    )
    const configPath = await writeConfig(directory, {
      schemaVersion: 1,
      sources,
    })
    const lstat = fs.lstat.bind(fs)
    let sourceReads = 0
    vi.spyOn(fs, 'lstat').mockImplementation(async target => {
      const targetPath = String(target)
      if (targetPath.endsWith('source-0.tokens.json')) {
        throw new Error('Injected source path failure.')
      }
      if (/source-\d+\.tokens\.json$/u.test(targetPath)) {
        sourceReads += 1
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      return lstat(target)
    })

    await expect(loadPrimitreeConfig({ configPath })).rejects.toThrow(
      'Injected source path failure.'
    )
    const readsWhenRejected = sourceReads
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(sourceReads).toBe(readsWhenRejected)
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
