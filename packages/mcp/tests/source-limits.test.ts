import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadTokenSource } from '../src/source'

describe('loadTokenSource', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-mcp-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('bounds nested token directory depth', async () => {
    const dir = path.join(tmpDir, 'deep-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    const deepDirectory = path.join(
      dir,
      ...Array.from({ length: 65 }, (_, index) => `d${index}`)
    )
    await fs.mkdir(deepDirectory, { recursive: true })
    await fs.writeFile(path.join(deepDirectory, 'deep.tokens.json'), '{}')

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source can contain at most 64 nested directory levels.'
    )
  })

  it('bounds the number of loaded token files', async () => {
    const dir = path.join(tmpDir, 'many-files-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await Promise.all(
      Array.from({ length: 1_001 }, (_, index) =>
        fs.writeFile(
          path.join(dir, `part-${String(index).padStart(4, '0')}.tokens.json`),
          '{}'
        )
      )
    )

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source can contain at most 1,000 token files.'
    )
  })

  it('bounds each loaded token file before parsing JSON', async () => {
    const dir = path.join(tmpDir, 'large-file-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    const largeFile = path.join(dir, 'large.tokens.json')
    await fs.writeFile(largeFile, '{}')
    await fs.truncate(largeFile, 20 * 1024 * 1024 + 1)

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source JSON file exceeds the 20 MiB limit: large.tokens.json'
    )
  })
  it('counts the Resolver in the total token source byte limit', async () => {
    const dir = path.join(tmpDir, 'large-source-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    const mib = 1024 * 1024
    const tokenFileSizes = [
      ...Array.from({ length: 12 }, () => 20 * mib),
      16 * mib,
    ]
    expect(tokenFileSizes.reduce((total, size) => total + size, 0)).toBe(
      256 * mib
    )
    for (const [index, size] of tokenFileSizes.entries()) {
      const file = path.join(dir, `large-${index}.tokens.json`)
      await fs.writeFile(file, '{}')
      await fs.truncate(file, size)
    }

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source JSON files exceed the 256 MiB total limit.'
    )
  })
  it('preserves the entry limit and directory close failures', async () => {
    const dir = path.join(tmpDir, 'many-entries-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    const closeFailure = new Error('Injected token directory close failure.')
    let index = 0
    let closeCalls = 0
    const directoryHandle = {
      async read() {
        if (index > 100_000) {
          return null
        }
        index += 1
        return { name: 'ignored.txt' }
      },
      async close() {
        closeCalls += 1
        throw closeFailure
      },
    }
    const openDirectory = vi
      .spyOn(fs, 'opendir')
      .mockResolvedValue(directoryHandle as never)

    let failure: unknown
    try {
      failure = await loadTokenSource(dir).catch(error => error)
    } finally {
      openDirectory.mockRestore()
    }

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected token source loading to fail.')
    }
    expect(failure.message).toBe(
      'Token source can contain at most 100,000 entries.\n' +
        'Could not close token source directory: .'
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both token directory failures.')
    }
    expect(failure.cause.errors).toEqual([
      expect.objectContaining({
        message: 'Token source can contain at most 100,000 entries.',
      }),
      closeFailure,
    ])
    expect(closeCalls).toBe(1)
  })
})
