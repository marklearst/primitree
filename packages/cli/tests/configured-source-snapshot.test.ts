import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    path.join(os.tmpdir(), 'primitree-source-snapshot-')
  )
  temporaryDirectories.push(directory)
  return directory
}

async function writeConfig(directory: string, withOutputs = false) {
  const configPath = path.join(directory, 'primitree.config.ts')
  const source = {
    type: 'dtcg',
    file: './tokens.json',
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

describe('configured source snapshots', () => {
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
