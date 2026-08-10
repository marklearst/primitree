import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildConfiguredSourceGraph,
  loadConfiguredSource,
  loadConfiguredSourceGraph,
} from '../src/config/source'

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
    path.join(os.tmpdir(), 'primitree-source-snapshot-')
  )
  temporaryDirectories.push(directory)
  return directory
}

async function writeConfig(
  directory: string,
  withOutputs = false,
  sourceFile = './tokens.json'
) {
  const configPath = path.join(directory, 'primitree.config.ts')
  const source = {
    type: 'dtcg',
    file: sourceFile,
    architecture: {
      layers: [{ id: 'primitive', roots: ['color'], values: 'literal' }],
    },
    ...(withOutputs ? { outputs: { directory: './generated' } } : {}),
  }
  await fs.writeFile(
    configPath,
    `export default ${JSON.stringify({ schemaVersion: 1, sources: { brand: source } })}\n`,
    'utf8'
  )
  return configPath
}

function snapshotFixture(early: string, late: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      color: {
        early: { $type: 'string', $value: early },
        padding: { $type: 'string', $value: 'x'.repeat(70 * 1024) },
        late: { $type: 'string', $value: late },
      },
    })
  )
}

async function overwriteFile(
  handle: Awaited<ReturnType<typeof fs.open>>,
  contents: Buffer
): Promise<void> {
  let offset = 0
  while (offset < contents.length) {
    const { bytesWritten } = await handle.write(
      contents,
      offset,
      contents.length - offset,
      offset
    )
    if (bytesWritten === 0) {
      throw new Error('Test rewrite made no progress.')
    }
    offset += bytesWritten
  }
}

async function markSnapshotChanged(filePath: string): Promise<void> {
  const markerTime = new Date('2000-01-01T00:00:00.000Z')
  await fs.utimes(filePath, markerTime, markerTime)
}

function absolutePathComponentCount(filePath: string): number {
  const root = path.parse(filePath).root
  return filePath
    .slice(root.length)
    .split(path.sep)
    .filter(segment => segment.length > 0).length
}

describe('configured source snapshots', () => {
  it.skipIf(process.platform === 'win32').each([
    ['output', './late/tokens.json', 'generated', true],
    ['lock', './late', '.generated.primitree-lock', false],
    ['stage', './late/tokens.json', '.generated.primitree-stage-held', true],
    ['backup', './late/tokens.json', '.generated.primitree-backup-held', true],
    [
      'backup with a high Unicode suffix',
      './late/tokens.json',
      '.generated.primitree-backup-\udbff\udffdx',
      true,
    ],
    ['cleanup', './late/tokens.json', '.generated.primitree-clean-held', true],
  ])(
    'rejects a missing source that later links into its output %s path before open',
    async (_name, sourceFile, targetRelative, targetIsDirectory) => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, true, sourceFile)
      const configured = await loadConfiguredSource({ configPath })
      const target = path.join(directory, targetRelative)
      if (targetIsDirectory) {
        await fs.mkdir(target)
        await fs.writeFile(
          path.join(target, 'tokens.json'),
          snapshotFixture('outside-1', 'outside-2')
        )
      } else {
        await fs.writeFile(target, snapshotFixture('outside-1', 'outside-2'))
      }
      await fs.symlink(`./${targetRelative}`, path.join(directory, 'late'))
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) === path.resolve(directory, sourceFile)) {
          sourceOpenCalls += 1
        }
        return open(target, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'does not read a source whose ancestor is swapped into its output during open',
    async () => {
      const directory = await temporaryDirectory()
      await fs.mkdir(path.join(directory, 'late'))
      await fs.writeFile(
        path.join(directory, 'late', 'tokens.json'),
        snapshotFixture('inside-1', 'inside-2')
      )
      const configPath = await writeConfig(
        directory,
        true,
        './late/tokens.json'
      )
      const configured = await loadConfiguredSource({ configPath })
      const generated = path.join(directory, 'generated')
      await fs.mkdir(generated)
      await fs.writeFile(
        path.join(generated, 'tokens.json'),
        snapshotFixture('outside-1', 'outside-2')
      )
      const held = path.join(directory, 'late-held')
      const sourcePath = path.join(directory, 'late', 'tokens.json')
      const open = fs.open.bind(fs)
      let readCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === sourcePath) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
            readCalls += 1
            return read(...args)
          })
          await fs.rename(path.join(directory, 'late'), held)
          await fs.symlink('./generated', path.join(directory, 'late'))
        }
        return handle
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(readCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'does not read after an ancestor ABA makes open and the post-open leaf probe see the output',
    async () => {
      const directory = await temporaryDirectory()
      const late = path.join(directory, 'late')
      const held = path.join(directory, 'late-held')
      const sourcePath = path.join(late, 'tokens.json')
      const generated = path.join(directory, 'generated')
      const outputPath = path.join(generated, 'tokens.json')
      await fs.mkdir(generated)
      await fs.writeFile(
        outputPath,
        JSON.stringify({
          color: { output: { $type: 'string', $value: 'outside' } },
        }),
        'utf8'
      )
      const configPath = await writeConfig(
        directory,
        true,
        './late/tokens.json'
      )
      const configured = await loadConfiguredSource({ configPath })
      await fs.mkdir(late)
      await fs.writeFile(
        sourcePath,
        JSON.stringify({
          color: { source: { $type: 'string', $value: 'inside' } },
        }),
        'utf8'
      )
      const open = fs.open.bind(fs)
      let outputWasOpened = false
      let readCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) !== sourcePath) {
          return open(target, flags, mode)
        }
        await fs.rename(late, held)
        await fs.symlink('./generated', late)
        let handle: Awaited<ReturnType<typeof fs.open>>
        try {
          handle = await open(target, flags, mode)
          outputWasOpened = true
        } finally {
          await fs.rm(late)
          await fs.rename(held, late)
        }
        const read = handle.read.bind(handle)
        vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
          readCalls += 1
          return read(...args)
        })
        return handle
      })
      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(outputWasOpened).toBe(true)
      expect(readCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink-expanded source path over the configured path bound before open',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, false, './linked.json')
      const configured = await loadConfiguredSource({ configPath })
      const prefixBytes = Buffer.byteLength(`${directory}${path.sep}`, 'utf8')
      let remaining = 1024 - prefixBytes
      const segments: string[] = []
      while (remaining > 200) {
        const segmentBytes = Math.min(200, remaining - 2)
        segments.push('a'.repeat(segmentBytes))
        remaining -= segmentBytes + 1
      }
      segments.push('a'.repeat(remaining))
      expect(
        Buffer.byteLength(path.resolve(directory, segments.join('/')), 'utf8')
      ).toBe(1024)
      await fs.symlink(segments.join('/'), path.join(directory, 'linked.json'))
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) === path.join(directory, 'linked.json')) {
          sourceOpenCalls += 1
        }
        return open(target, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a no-output symlink-expanded source path with 65 absolute components before open',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, false, './linked.json')
      const configured = await loadConfiguredSource({ configPath })
      const comparisonDirectory = await fs.realpath(directory)
      const remaining = 65 - absolutePathComponentCount(comparisonDirectory)
      expect(remaining).toBeGreaterThan(0)
      const target = Array.from({ length: remaining }, () => 'a').join('/')
      expect(
        absolutePathComponentCount(path.resolve(comparisonDirectory, target))
      ).toBe(65)
      await fs.symlink(target, path.join(directory, 'linked.json'))
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
        if (String(file) === path.join(directory, 'linked.json')) {
          sourceOpenCalls += 1
        }
        return open(file, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a no-output symlink-expanded source component over 255 UTF-8 bytes before open',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, false, './linked.json')
      const configured = await loadConfiguredSource({ configPath })
      await fs.symlink('a'.repeat(256), path.join(directory, 'linked.json'))
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
        if (String(file) === path.join(directory, 'linked.json')) {
          sourceOpenCalls += 1
        }
        return open(file, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        'The file for source "brand" changed before reading.'
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a missing output that becomes a symlink to the source target before open',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, true)
      const tokenPath = path.join(directory, 'tokens.json')
      await fs.writeFile(tokenPath, snapshotFixture('inside-1', 'inside-2'))
      const configured = await loadConfiguredSource({ configPath })
      await fs.symlink('./tokens.json', path.join(directory, 'generated'))
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) === tokenPath) {
          sourceOpenCalls += 1
        }
        return open(target, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        `Build output path cannot use a symbolic link: ${path.join(directory, 'generated')}`
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects missing output and source ancestors that later link to the same outside root',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = path.join(directory, 'primitree.config.ts')
      await fs.writeFile(
        configPath,
        `export default ${JSON.stringify({
          schemaVersion: 1,
          sources: {
            brand: {
              type: 'dtcg',
              file: './late/tokens.json',
              architecture: {
                layers: [
                  { id: 'primitive', roots: ['color'], values: 'literal' },
                ],
              },
              outputs: { directory: './generated/nested' },
            },
          },
        })}\n`,
        'utf8'
      )
      const configured = await loadConfiguredSource({ configPath })
      const outside = path.join(directory, 'outside')
      await fs.mkdir(path.join(outside, 'nested'), { recursive: true })
      await fs.writeFile(
        path.join(outside, 'tokens.json'),
        snapshotFixture('outside-1', 'outside-2')
      )
      await fs.symlink('./outside', path.join(directory, 'generated'))
      await fs.symlink('./outside', path.join(directory, 'late'))
      const sourcePath = path.join(directory, 'late', 'tokens.json')
      const open = fs.open.bind(fs)
      let sourceOpenCalls = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        if (String(target) === sourcePath) {
          sourceOpenCalls += 1
        }
        return open(target, flags, mode)
      })

      await expect(buildConfiguredSourceGraph(configured)).rejects.toThrow(
        `Build output path cannot use a symbolic link: ${path.join(directory, 'generated')}`
      )

      expect(sourceOpenCalls).toBe(0)
    }
  )

  it('loads an ordinary source beside its configured output', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, true)
    await fs.writeFile(
      path.join(directory, 'tokens.json'),
      JSON.stringify({
        color: { value: { $type: 'string', $value: 'red' } },
      }),
      'utf8'
    )

    const result = await loadConfiguredSourceGraph({ configPath })

    expect(result.sourceName).toBe('brand')
  })

  it('rejects a same-inode rewrite that creates a hybrid read', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory)
    const tokenPath = path.join(directory, 'tokens.json')
    const original = snapshotFixture('before-1', 'before-2')
    const replacement = snapshotFixture('after--1', 'after--2')
    expect(replacement).toHaveLength(original.length)
    await fs.writeFile(tokenPath, original)
    const before = await fs.stat(tokenPath, { bigint: true })
    const open = fs.open.bind(fs)
    let changed = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const read = handle.read.bind(handle)
        vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
          const result = await read(...args)
          if (!changed && result.bytesRead > 0) {
            const writer = await open(tokenPath, 'r+')
            try {
              await overwriteFile(writer, replacement)
            } finally {
              await writer.close()
            }
            await markSnapshotChanged(tokenPath)
            changed = true
          }
          return result
        })
      }
      return handle
    })

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      'The file for source "brand" changed while reading.'
    )

    const after = await fs.stat(tokenPath, { bigint: true })
    expect(changed).toBe(true)
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBe(before.size)
    expect(after.mtimeNs).not.toBe(before.mtimeNs)
  })

  it.skipIf(process.platform === 'win32')(
    'rejects the configured path replaced while its prior file is read',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory)
      const tokenPath = path.join(directory, 'tokens.json')
      const originalPath = path.join(directory, 'tokens.original.json')
      const original = snapshotFixture('before-1', 'before-2')
      const replacement = snapshotFixture('after--1', 'after--2')
      await fs.writeFile(tokenPath, original)
      const open = fs.open.bind(fs)
      let replaced = false
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const stat = handle.stat.bind(handle)
          let statCalls = 0
          vi.spyOn(handle, 'stat').mockImplementation(async (...args) => {
            const result = await stat(...args)
            statCalls += 1
            if (!replaced && statCalls === 2) {
              await fs.rename(tokenPath, originalPath)
              await fs.writeFile(tokenPath, replacement)
              replaced = true
            }
            return result
          })
        }
        return handle
      })

      await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
        'The file for source "brand" changed while reading.'
      )

      expect(replaced).toBe(true)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects an allowed source symlink retargeted while its prior file is read',
    async () => {
      const directory = await temporaryDirectory()
      const configPath = await writeConfig(directory, true)
      const tokenPath = path.join(directory, 'tokens.json')
      const originalPath = path.join(directory, 'original.json')
      const replacementPath = path.join(directory, 'replacement.json')
      await fs.writeFile(originalPath, snapshotFixture('before-1', 'before-2'))
      await fs.writeFile(
        replacementPath,
        snapshotFixture('after--1', 'after--2')
      )
      await fs.symlink('./original.json', tokenPath)
      const open = fs.open.bind(fs)
      let retargeted = false
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
            const result = await read(...args)
            if (!retargeted && result.bytesRead > 0) {
              await fs.unlink(tokenPath)
              await fs.symlink('./replacement.json', tokenPath)
              retargeted = true
            }
            return result
          })
        }
        return handle
      })

      await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
        'The file for source "brand" changed while reading.'
      )

      expect(retargeted).toBe(true)
    }
  )

  it('rejects a same-length rewrite after scanning and before open', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory, true)
    const tokenPath = path.join(directory, 'tokens.json')
    const original = snapshotFixture('before-1', 'before-2')
    const replacement = snapshotFixture('after--1', 'after--2')
    expect(replacement).toHaveLength(original.length)
    await fs.writeFile(tokenPath, original)
    const before = await fs.stat(tokenPath, { bigint: true })
    const open = fs.open.bind(fs)
    let changed = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target) === tokenPath && !changed) {
        await fs.writeFile(tokenPath, replacement)
        await markSnapshotChanged(tokenPath)
        changed = true
      }
      return open(target, flags, mode)
    })

    await expect(loadConfiguredSourceGraph({ configPath })).rejects.toThrow(
      'The file for source "brand" changed while reading.'
    )

    const after = await fs.stat(tokenPath, { bigint: true })
    expect(changed).toBe(true)
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBe(before.size)
    expect(after.mtimeNs).not.toBe(before.mtimeNs)
  })

  it('keeps a snapshot error when closing also fails', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory)
    const tokenPath = path.join(directory, 'tokens.json')
    const original = snapshotFixture('before-1', 'before-2')
    const replacement = snapshotFixture('after--1', 'after--2')
    await fs.writeFile(tokenPath, original)
    const closeFailure = new Error('Injected source close failure.')
    const open = fs.open.bind(fs)
    let changed = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const read = handle.read.bind(handle)
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
          const result = await read(...args)
          if (!changed && result.bytesRead > 0) {
            const writer = await open(tokenPath, 'r+')
            try {
              await overwriteFile(writer, replacement)
            } finally {
              await writer.close()
            }
            await markSnapshotChanged(tokenPath)
            changed = true
          }
          return result
        })
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
      `The file for source "brand" changed while reading.\nCould not close file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected source failures to be combined.')
    }
    expect(failure.cause.errors[0]).toMatchObject({
      message: 'The file for source "brand" changed while reading.',
    })
    expect(failure.cause.errors[1]).toBe(closeFailure)
  })

  it('keeps invalid JSON when closing the source also fails', async () => {
    const directory = await temporaryDirectory()
    const configPath = await writeConfig(directory)
    const tokenPath = path.join(directory, 'tokens.json')
    await fs.writeFile(tokenPath, '{')
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
      `File is not valid JSON: ${tokenPath}\nCould not close file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected source failures to be combined.')
    }
    expect(failure.cause.errors[0]).toMatchObject({
      message: `File is not valid JSON: ${tokenPath}`,
    })
    expect(failure.cause.errors[1]).toBe(closeFailure)
  })
})
