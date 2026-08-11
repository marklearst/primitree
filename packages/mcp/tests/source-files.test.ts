import { spawnSync } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadTokenSource } from '../src/source'

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')

describe('loadTokenSource', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-mcp-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects a symbolic link used as a variables JSON source', async () => {
    const linkedFile = path.join(tmpDir, 'linked-variables.json')
    await fs.symlink(fixturePath, linkedFile)

    await expect(loadTokenSource(linkedFile)).rejects.toThrow(
      `Token source cannot use a symbolic link: ${linkedFile}`
    )
  })

  it('propagates a direct source inspection failure', async () => {
    const source = path.join(tmpDir, 'unreadable-variables.json')
    const failure = Object.assign(
      new Error('Injected source inspection failure.'),
      {
        code: 'EACCES',
      }
    )
    const lstat = fs.lstat.bind(fs)
    const inspectSource = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === source) {
          throw failure
        }
        return lstat(target, options)
      })

    let caught: unknown
    try {
      caught = await loadTokenSource(source).catch(error => error)
    } finally {
      inspectSource.mockRestore()
    }

    expect(caught).toBe(failure)
  })

  it('rejects a direct file replaced only while it opens', async () => {
    const source = path.join(tmpDir, 'swapped-variables.json')
    const replacement = path.join(tmpDir, 'replacement-variables.json')
    const original = `${source}.original`
    await fs.copyFile(fixturePath, source)
    await fs.copyFile(fixturePath, replacement)
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === source && !swapped) {
          await fs.rename(source, original)
          await fs.rename(replacement, source)
          const handle = await open(target, flags, mode)
          await fs.rename(source, replacement)
          await fs.rename(original, source)
          swapped = true
          return handle
        }
        return open(target, flags, mode)
      })

    try {
      await expect(loadTokenSource(source)).rejects.toThrow(
        'Token source file changed while reading: swapped-variables.json'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(swapped).toBe(true)
  })
  it('propagates a Resolver discovery failure', async () => {
    const dir = path.join(tmpDir, 'unreadable-resolver-build')
    const resolverPath = path.join(dir, 'tokens.resolver.json')
    const failure = Object.assign(
      new Error('Injected Resolver inspection failure.'),
      { code: 'EACCES' }
    )
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(resolverPath, JSON.stringify({ version: '2025.10' }))
    const lstat = fs.lstat.bind(fs)
    const stat = fs.stat.bind(fs)
    const inspectPath = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === resolverPath) {
          throw failure
        }
        return lstat(target, options)
      })
    const inspectResolver = vi
      .spyOn(fs, 'stat')
      .mockImplementation(async (target, options) => {
        if (String(target) === resolverPath) {
          throw failure
        }
        return stat(target, options)
      })

    let caught: unknown
    try {
      caught = await loadTokenSource(dir).catch(error => error)
    } finally {
      inspectResolver.mockRestore()
      inspectPath.mockRestore()
    }

    expect(caught).toBe(failure)
  })

  it('rejects a dangling Resolver symbolic link', async () => {
    const dir = path.join(tmpDir, 'dangling-resolver-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.symlink(
      path.join(tmpDir, 'missing-resolver.json'),
      path.join(dir, 'tokens.resolver.json')
    )

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source cannot contain a symbolic link: tokens.resolver.json'
    )
  })

  it('rejects a Resolver replaced only while it opens', async () => {
    const dir = path.join(tmpDir, 'swapped-resolver-build')
    const resolverPath = path.join(dir, 'tokens.resolver.json')
    const replacement = path.join(tmpDir, 'replacement-resolver.json')
    const original = `${resolverPath}.original`
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(resolverPath, JSON.stringify({ version: '2025.10' }))
    await fs.writeFile(
      replacement,
      JSON.stringify({ version: '2025.10', sets: {} })
    )
    await fs.writeFile(path.join(dir, 'source.tokens.json'), '{}')
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === resolverPath && !swapped) {
          await fs.rename(resolverPath, original)
          await fs.rename(replacement, resolverPath)
          const handle = await open(target, flags, mode)
          await fs.rename(resolverPath, replacement)
          await fs.rename(original, resolverPath)
          swapped = true
          return handle
        }
        return open(target, flags, mode)
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source file changed while reading: tokens.resolver.json'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(swapped).toBe(true)
  })
  it('reports the path of invalid nested token JSON', async () => {
    const dir = path.join(tmpDir, 'invalid-token-json-build')
    await fs.mkdir(path.join(dir, 'themes'), { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(dir, 'themes/dark.tokens.json'), '{')

    const failure = await loadTokenSource(dir).catch(error => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected invalid token JSON to fail.')
    }
    expect(failure.message).toBe(
      'Token source JSON is invalid: themes/dark.tokens.json'
    )
    expect(failure.cause).toBeInstanceOf(SyntaxError)
  })

  it('reports the path of invalid Resolver JSON', async () => {
    const dir = path.join(tmpDir, 'invalid-resolver-json-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'tokens.resolver.json'), '{')
    await fs.writeFile(path.join(dir, 'source.tokens.json'), '{}')

    const failure = await loadTokenSource(dir).catch(error => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected invalid Resolver JSON to fail.')
    }
    expect(failure.message).toBe(
      'Token source JSON is invalid: tokens.resolver.json'
    )
    expect(failure.cause).toBeInstanceOf(SyntaxError)
  })

  it('preserves invalid JSON and close failures', async () => {
    const dir = path.join(tmpDir, 'invalid-json-close-build')
    const tokenPath = path.join(dir, 'invalid.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{')
    const closeFailure = new Error('Injected invalid JSON close failure.')
    const open = fs.open.bind(fs)
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
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

    let failure: unknown
    try {
      failure = await loadTokenSource(dir).catch(error => error)
    } finally {
      openFile.mockRestore()
    }

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected invalid token JSON to fail.')
    }
    expect(failure.message).toBe(
      'Token source JSON is invalid: invalid.tokens.json\n' +
        'Could not close token source JSON file: invalid.tokens.json'
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both invalid JSON and close failures.')
    }
    expect(failure.cause.errors).toHaveLength(2)
    const [invalidJsonFailure, reportedCloseFailure] = failure.cause.errors
    expect(invalidJsonFailure).toBeInstanceOf(Error)
    expect((invalidJsonFailure as Error).message).toBe(
      'Token source JSON is invalid: invalid.tokens.json'
    )
    expect((invalidJsonFailure as Error).cause).toBeInstanceOf(SyntaxError)
    expect(reportedCloseFailure).toBe(closeFailure)
    expect((reportedCloseFailure as Error).message).toBe(
      'Injected invalid JSON close failure.'
    )
  })
  it('rejects symbolic links while scanning built token files', async () => {
    const dir = path.join(tmpDir, 'linked-build')
    const outside = path.join(tmpDir, 'outside.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(outside, '{}')
    await fs.symlink(outside, path.join(dir, 'linked.tokens.json'))

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source cannot contain a symbolic link: linked.tokens.json'
    )
  })

  it('rejects a token file swapped to a symbolic link before it opens', async () => {
    const dir = path.join(tmpDir, 'swapped-link-build')
    const tokenPath = path.join(dir, 'source.tokens.json')
    const outside = path.join(tmpDir, 'swapped-link-outside.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    await fs.writeFile(outside, JSON.stringify({ outside: true }))
    const noFollowFlag = Reflect.get(fsConstants, 'O_NOFOLLOW')
    const hasNoFollowFlag =
      typeof noFollowFlag === 'number' && noFollowFlag !== 0
    const open = fs.open.bind(fs)
    let swapped = false
    let usedNoFollowOpen = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === tokenPath) {
          usedNoFollowOpen =
            hasNoFollowFlag &&
            typeof flags === 'number' &&
            (flags & noFollowFlag) === noFollowFlag
          if (!swapped) {
            await fs.rename(tokenPath, `${tokenPath}.original`)
            await fs.symlink(outside, tokenPath)
            swapped = true
          }
        }
        return open(target, flags, mode)
      })

    let failure: unknown
    try {
      failure = await loadTokenSource(dir).catch(error => error)
    } finally {
      openFile.mockRestore()
    }

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected a swapped token file to fail.')
    }
    expect(swapped).toBe(true)
    if (hasNoFollowFlag) {
      expect(failure.message).toMatch(/symbolic link/i)
      expect(usedNoFollowOpen).toBe(true)
    } else {
      expect(failure.message).toBe(
        'Token source file changed while reading: source.tokens.json'
      )
      expect(usedNoFollowOpen).toBe(false)
    }
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a token file swapped to a FIFO before it opens',
    async () => {
      const dir = path.join(tmpDir, 'swapped-fifo-build')
      const tokenPath = path.join(dir, 'source.tokens.json')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'tokens.resolver.json'),
        JSON.stringify({ version: '2025.10' })
      )
      await fs.writeFile(tokenPath, '{}')
      const open = fs.open.bind(fs)
      let swapped = false
      let usedNonblockingOpen = false
      const openFile = vi
        .spyOn(fs, 'open')
        .mockImplementation(async (target, flags, mode) => {
          if (String(target) === tokenPath) {
            usedNonblockingOpen =
              typeof flags === 'number' &&
              (flags & fsConstants.O_NONBLOCK) === fsConstants.O_NONBLOCK
            if (!usedNonblockingOpen) {
              throw new Error('Test prevented a blocking FIFO open.')
            }
            if (!swapped) {
              await fs.rename(tokenPath, `${tokenPath}.original`)
              const created = spawnSync('mkfifo', [tokenPath], {
                encoding: 'utf8',
              })
              expect(created.status).toBe(0)
              expect(created.stderr).toBe('')
              swapped = true
            }
          }
          return open(target, flags, mode)
        })

      try {
        await expect(loadTokenSource(dir)).rejects.toThrow(
          'Token source JSON path is not a regular file: source.tokens.json'
        )
      } finally {
        openFile.mockRestore()
      }

      expect(swapped).toBe(true)
      expect(usedNonblockingOpen).toBe(true)
    }
  )
  it('rejects an outside token handle after its directory is restored', async () => {
    const dir = path.join(tmpDir, 'restored-directory-build')
    const nested = path.join(dir, 'themes')
    const original = `${nested}.original`
    const tokenPath = path.join(nested, 'dark.tokens.json')
    const outside = path.join(tmpDir, 'restored-directory-outside')
    await fs.mkdir(nested, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    await fs.writeFile(
      path.join(outside, 'dark.tokens.json'),
      JSON.stringify({ outside: { $type: 'boolean', $value: true } })
    )
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === tokenPath && !swapped) {
          await fs.rename(nested, original)
          await fs.symlink(outside, nested, 'dir')
          const handle = await open(target, flags, mode)
          await fs.unlink(nested)
          await fs.rename(original, nested)
          swapped = true
          return handle
        }
        return open(target, flags, mode)
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source file changed while reading: themes/dark.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(swapped).toBe(true)
  })
  it.skipIf(process.platform === 'win32')(
    'rejects special nodes while scanning built token files',
    async () => {
      const dir = path.join(tmpDir, 'special-node-build')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'tokens.resolver.json'),
        JSON.stringify({ version: '2025.10' })
      )
      const specialPath = path.join(dir, 'stream.tokens.json')
      const created = spawnSync('mkfifo', [specialPath], { encoding: 'utf8' })
      expect(created.status).toBe(0)
      expect(created.stderr).toBe('')

      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source path is not a regular file or directory: stream.tokens.json'
      )
    }
  )

  it.skipIf(process.platform === 'win32')(
    'rejects a special node used as the top-level source',
    async () => {
      const source = path.join(tmpDir, 'top-level-stream.json')
      const created = spawnSync('mkfifo', [source], { encoding: 'utf8' })
      expect(created.status).toBe(0)
      expect(created.stderr).toBe('')

      await expect(loadTokenSource(source)).rejects.toThrow(
        `Token source path is not a regular file or directory: ${source}`
      )
    }
  )
  it('bounds bytes read when an opened token file grows after stat', async () => {
    const dir = path.join(tmpDir, 'growing-file-build')
    const tokenPath = path.join(dir, 'growing.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    const open = fs.open.bind(fs)
    let openedHandle: Awaited<ReturnType<typeof fs.open>> | undefined
    let grew = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          openedHandle = handle
          const stat = handle.stat.bind(handle)
          vi.spyOn(handle, 'stat').mockImplementation(async () => {
            const stats = await stat({ bigint: true })
            if (!grew) {
              grew = true
              await fs.truncate(tokenPath, 20 * 1024 * 1024 + 1)
            }
            return stats
          })
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source JSON file exceeds the 20 MiB limit: growing.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(grew).toBe(true)
    if (openedHandle === undefined) {
      throw new Error('The growing token file was not opened.')
    }
    await expect(openedHandle.stat()).rejects.toMatchObject({ code: 'EBADF' })
  })

  it('rejects a token file changed through the same inode while reading', async () => {
    const dir = path.join(tmpDir, 'changed-file-build')
    const tokenPath = path.join(dir, 'changed.tokens.json')
    const originalMarker = 'before!!'
    const changedMarker = 'after!!!'
    const raw = JSON.stringify({
      padding: {
        $type: 'string',
        $value: 'a'.repeat(70 * 1024),
      },
      changed: { $type: 'string', $value: originalMarker },
    })
    const markerOffset = raw.indexOf(originalMarker)
    expect(markerOffset).toBeGreaterThan(64 * 1024)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, raw)
    const before = await fs.stat(tokenPath, { bigint: true })
    const open = fs.open.bind(fs)
    let changed = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
            const result = await read(...args)
            if (!changed && result.bytesRead > 0) {
              const writer = await open(tokenPath, 'r+')
              try {
                await writer.write(changedMarker, markerOffset, 'utf8')
              } finally {
                await writer.close()
              }
              changed = true
            }
            return result
          })
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source file changed while reading: changed.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    const after = await fs.stat(tokenPath, { bigint: true })
    expect(changed).toBe(true)
    expect(after.dev).toBe(before.dev)
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBe(before.size)
  })

  it('rejects an earlier token file changed while a later file is read', async () => {
    const dir = path.join(tmpDir, 'changed-earlier-file-build')
    const firstPath = path.join(dir, 'a.tokens.json')
    const secondPath = path.join(dir, 'b.tokens.json')
    const originalMarker = 'before!!'
    const changedMarker = 'after!!!'
    const firstRaw = JSON.stringify({
      changed: { $type: 'string', $value: originalMarker },
    })
    const markerOffset = firstRaw.indexOf(originalMarker)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(firstPath, firstRaw)
    await fs.writeFile(
      secondPath,
      JSON.stringify({ later: { $type: 'boolean', $value: true } })
    )
    const before = await fs.stat(firstPath, { bigint: true })
    const open = fs.open.bind(fs)
    let changed = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === secondPath) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
            const result = await read(...args)
            if (!changed && result.bytesRead > 0) {
              const writer = await open(firstPath, 'r+')
              try {
                await writer.write(changedMarker, markerOffset, 'utf8')
              } finally {
                await writer.close()
              }
              changed = true
            }
            return result
          })
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source file changed while reading: a.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    const after = await fs.stat(firstPath, { bigint: true })
    expect(changed).toBe(true)
    expect(after.dev).toBe(before.dev)
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBe(before.size)
  })

  it('rejects a same-length token file change before the handle opens', async () => {
    const dir = path.join(tmpDir, 'changed-before-open-build')
    const tokenPath = path.join(dir, 'changed.tokens.json')
    const original = JSON.stringify({
      changed: { $type: 'string', $value: 'before!!' },
    })
    const replacement = JSON.stringify({
      changed: { $type: 'string', $value: 'after!!!' },
    })
    expect(replacement).toHaveLength(original.length)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, original)
    const before = await fs.stat(tokenPath, { bigint: true })
    const open = fs.open.bind(fs)
    let changed = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === tokenPath && !changed) {
          await fs.writeFile(tokenPath, replacement)
          changed = true
        }
        return open(target, flags, mode)
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source file changed while reading: changed.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    const after = await fs.stat(tokenPath, { bigint: true })
    expect(changed).toBe(true)
    expect(after.dev).toBe(before.dev)
    expect(after.ino).toBe(before.ino)
    expect(after.size).toBe(before.size)
  })

  it('accepts an unchanged file with an inode above the safe integer range', async () => {
    const dir = path.join(tmpDir, 'large-inode-build')
    const tokenPath = path.join(dir, 'large-inode.tokens.json')
    const largeInode = 9_007_199_254_740_993n
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(
      tokenPath,
      JSON.stringify({ value: { $type: 'boolean', $value: true } })
    )
    const lstat = fs.lstat.bind(fs)
    const inspectFile = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === tokenPath) {
          Object.defineProperty(stats, 'ino', {
            value:
              typeof stats.ino === 'bigint' ? largeInode : Number(largeInode),
          })
        }
        return stats
      })
    const open = fs.open.bind(fs)
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const stat = handle.stat.bind(handle)
          vi.spyOn(handle, 'stat').mockImplementation(async () => {
            const stats = await stat({ bigint: true })
            Object.defineProperty(stats, 'ino', { value: largeInode })
            return stats
          })
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).resolves.toMatchObject({
        files: {
          'large-inode.tokens.json': {
            value: { $type: 'boolean', $value: true },
          },
        },
      })
    } finally {
      openFile.mockRestore()
      inspectFile.mockRestore()
    }
  })

  it('rejects invalid UTF-8 in a token file', async () => {
    const dir = path.join(tmpDir, 'invalid-utf8-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(
      path.join(dir, 'invalid.tokens.json'),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
    )

    await expect(loadTokenSource(dir)).rejects.toThrow(
      'Token source JSON is invalid UTF-8: invalid.tokens.json'
    )
  })

  it('preserves a size failure when closing the token file also fails', async () => {
    const dir = path.join(tmpDir, 'close-failure-build')
    const tokenPath = path.join(dir, 'large.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    const closeFailure = new Error('Injected token source close failure.')
    const open = fs.open.bind(fs)
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const stat = handle.stat.bind(handle)
          vi.spyOn(handle, 'stat').mockImplementation(async () => {
            const stats = await stat({ bigint: true })
            await fs.truncate(tokenPath, 20 * 1024 * 1024 + 1)
            return stats
          })
          const close = handle.close.bind(handle)
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            await close()
            throw closeFailure
          })
        }
        return handle
      })

    let failure: unknown
    try {
      failure = await loadTokenSource(dir).catch(error => error)
    } finally {
      openFile.mockRestore()
    }

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected token source loading to fail.')
    }
    expect(failure.message).toBe(
      'Token source JSON file exceeds the 20 MiB limit: large.tokens.json\n' +
        'Could not close token source JSON file: large.tokens.json'
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both token size and close failures.')
    }
    expect(failure.cause.errors).toHaveLength(2)
    const [sizeFailure, reportedCloseFailure] = failure.cause.errors
    expect(sizeFailure).toBeInstanceOf(Error)
    expect((sizeFailure as Error).message).toBe(
      'Token source JSON file exceeds the 20 MiB limit: large.tokens.json'
    )
    expect(reportedCloseFailure).toBe(closeFailure)
    expect((reportedCloseFailure as Error).message).toBe(
      'Injected token source close failure.'
    )
  })
})
