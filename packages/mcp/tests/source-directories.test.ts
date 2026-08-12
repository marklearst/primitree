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

  it('rejects the selected token directory when it is replaced', async () => {
    const dir = path.join(tmpDir, 'replaced-root-build')
    const original = `${dir}.original`
    const replacement = path.join(tmpDir, 'replaced-root-outside')
    const resolverPath = path.join(dir, 'tokens.resolver.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.mkdir(replacement, { recursive: true })
    await fs.writeFile(resolverPath, JSON.stringify({ version: '2025.10' }))
    await fs.writeFile(path.join(dir, 'inside.tokens.json'), '{}')
    await fs.writeFile(
      path.join(replacement, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(replacement, 'outside.tokens.json'), '{}')
    const lstat = fs.lstat.bind(fs)
    let swapped = false
    const inspectResolver = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === resolverPath && !swapped) {
          await fs.rename(dir, original)
          await fs.rename(replacement, dir)
          swapped = true
        }
        return stats
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      inspectResolver.mockRestore()
    }

    expect(swapped).toBe(true)
  })

  it('rejects the selected token directory when it changes before return', async () => {
    const dir = path.join(tmpDir, 'return-root-build')
    const original = `${dir}.original`
    const replacement = path.join(tmpDir, 'return-root-replacement')
    const tokenPath = path.join(dir, 'source.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.mkdir(replacement, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath) {
          const close = handle.close.bind(handle)
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            await close()
            await fs.rename(dir, original)
            await fs.rename(replacement, dir)
            swapped = true
          })
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      openFile.mockRestore()
      if (swapped) {
        await fs.rename(dir, replacement)
        await fs.rename(original, dir)
      }
    }

    expect(swapped).toBe(true)
  })
  it('rejects a symbolic link used as the built tokens directory', async () => {
    const parent = path.join(tmpDir, 'linked-directory-build')
    const target = path.join(tmpDir, 'linked-directory-target')
    await fs.mkdir(parent, { recursive: true })
    await fs.mkdir(target, { recursive: true })
    await fs.writeFile(
      path.join(target, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(target, 'source.tokens.json'), '{}')
    await fs.symlink(target, path.join(parent, 'tokens'))

    await expect(loadTokenSource(parent)).rejects.toThrow(
      `Token source cannot use a symbolic link: ${path.join(parent, 'tokens')}`
    )
  })

  it('rejects a nested directory swapped outside the source before it opens', async () => {
    const dir = path.join(tmpDir, 'swapped-directory-build')
    const nested = path.join(dir, 'themes')
    const outside = path.join(tmpDir, 'swapped-directory-outside')
    await fs.mkdir(nested, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(nested, 'dark.tokens.json'), '{}')
    await fs.writeFile(path.join(outside, 'dark.tokens.json'), '{}')
    const openDirectory = fs.opendir.bind(fs)
    let swapped = false
    const readDirectory = vi
      .spyOn(fs, 'opendir')
      .mockImplementation(async (target, options) => {
        if (String(target) === nested && !swapped) {
          await fs.rename(nested, `${nested}.original`)
          await fs.symlink(outside, nested, 'dir')
          swapped = true
        }
        return openDirectory(target, options)
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        /Token source (?:directory changed while reading|cannot use a symbolic link): themes/
      )
    } finally {
      readDirectory.mockRestore()
    }

    expect(swapped).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'rejects an empty replacement directory handle after the source is restored',
    async () => {
      const dir = path.join(tmpDir, 'restored-root-build')
      const original = `${dir}.original`
      const replacement = `${dir}.replacement`
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'tokens.resolver.json'),
        JSON.stringify({ version: '2025.10' })
      )
      await fs.writeFile(path.join(dir, 'source.tokens.json'), '{}')
      const openDirectory = fs.opendir.bind(fs)
      let swapped = false
      const readDirectory = vi
        .spyOn(fs, 'opendir')
        .mockImplementation(async (target, options) => {
          if (String(target) === dir && !swapped) {
            await fs.rename(dir, original)
            await fs.mkdir(dir)
            const handle = await openDirectory(dir, options)
            await fs.rename(dir, replacement)
            await fs.rename(original, dir)
            swapped = true
            return handle
          }
          return openDirectory(target, options)
        })

      try {
        await expect(loadTokenSource(dir)).rejects.toThrow(
          'Token source directory changed while reading: .'
        )
      } finally {
        readDirectory.mockRestore()
      }

      expect(swapped).toBe(true)
    }
  )

  it('rejects a nested directory replaced after its parent inspection', async () => {
    const dir = path.join(tmpDir, 'nested-entry-identity-build')
    const nested = path.join(dir, 'themes')
    const original = `${nested}.original`
    const replacement = path.join(tmpDir, 'nested-entry-identity-replacement')
    await fs.mkdir(nested, { recursive: true })
    await fs.mkdir(replacement, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(nested, 'inside.tokens.json'), '{}')
    await fs.writeFile(path.join(replacement, 'outside.tokens.json'), '{}')
    const lstat = fs.lstat.bind(fs)
    let swapped = false
    const inspectDirectory = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === nested && !swapped) {
          await fs.rename(nested, original)
          await fs.rename(replacement, nested)
          swapped = true
        }
        return stats
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: themes'
      )
    } finally {
      inspectDirectory.mockRestore()
      if (swapped) {
        await fs.rename(nested, replacement)
        await fs.rename(original, nested)
      }
    }

    expect(swapped).toBe(true)
  })

  it('rejects a nested directory replaced before scan exit', async () => {
    const dir = path.join(tmpDir, 'nested-exit-identity-build')
    const nested = path.join(dir, 'themes')
    const original = `${nested}.original`
    const replacement = path.join(tmpDir, 'nested-exit-identity-replacement')
    const ignoredPath = path.join(nested, 'ignored.txt')
    await fs.mkdir(nested, { recursive: true })
    await fs.mkdir(replacement, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(ignoredPath, 'inside')
    const lstat = fs.lstat.bind(fs)
    let swapped = false
    const inspectEntry = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === ignoredPath && !swapped) {
          await fs.rename(nested, original)
          await fs.rename(replacement, nested)
          swapped = true
        }
        return stats
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: themes'
      )
    } finally {
      inspectEntry.mockRestore()
      if (swapped) {
        await fs.rename(nested, replacement)
        await fs.rename(original, nested)
      }
    }

    expect(swapped).toBe(true)
  })

  it('rejects a token file added while processing directory entries', async () => {
    const dir = path.join(tmpDir, 'added-entry-build')
    const ignoredPath = path.join(dir, 'ignored.txt')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(ignoredPath, 'ignored')
    const lstat = fs.lstat.bind(fs)
    let added = false
    const inspectEntry = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === ignoredPath && !added) {
          await fs.writeFile(path.join(dir, 'late.tokens.json'), '{}')
          added = true
        }
        return stats
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      inspectEntry.mockRestore()
    }

    expect(added).toBe(true)
  })

  it('rejects a token file added while reading another token file', async () => {
    const dir = path.join(tmpDir, 'added-during-read-build')
    const tokenPath = path.join(dir, 'source.tokens.json')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(tokenPath, '{}')
    const open = fs.open.bind(fs)
    let added = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath && !added) {
          await fs.writeFile(path.join(dir, 'late.tokens.json'), '{}')
          added = true
        }
        return handle
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(added).toBe(true)
  })

  it('preserves directory guard and close failures', async () => {
    const dir = path.join(tmpDir, 'directory-close-failure-build')
    const nested = path.join(dir, 'themes')
    const original = `${nested}.original`
    const outside = path.join(tmpDir, 'directory-close-failure-outside')
    await fs.mkdir(nested, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(nested, 'dark.tokens.json'), '{}')
    await fs.writeFile(path.join(outside, 'dark.tokens.json'), '{}')
    const openDirectory = fs.opendir.bind(fs)
    let closeCalls = 0
    const readDirectory = vi
      .spyOn(fs, 'opendir')
      .mockImplementation(async (target, options) => {
        const handle = await openDirectory(target, options)
        if (String(target) === nested) {
          const close = handle.close.bind(handle)
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            closeCalls += 1
            await close()
            throw new Error('Injected token directory close failure.')
          })
          await fs.rename(nested, original)
          await fs.symlink(outside, nested, 'dir')
        }
        return handle
      })

    let failure: unknown
    try {
      failure = await loadTokenSource(dir).catch(error => error)
    } finally {
      readDirectory.mockRestore()
      await fs.unlink(nested).catch(() => undefined)
      await fs.rename(original, nested).catch(() => undefined)
    }

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected token source loading to fail.')
    }
    expect(failure.message).toBe(
      'Token source cannot use a symbolic link: themes\n' +
        'Could not close token source directory: themes'
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both token directory failures.')
    }
    expect(
      failure.cause.errors.map(error =>
        error instanceof Error ? error.message : String(error)
      )
    ).toEqual([
      'Token source cannot use a symbolic link: themes',
      'Injected token directory close failure.',
    ])
    expect(closeCalls).toBe(1)
  })
  it('closes each token directory handle once', async () => {
    const dir = path.join(tmpDir, 'closed-directory-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    let scanCloseCalls = 0
    let verificationCloseCalls = 0
    const scanDirectoryHandle = {
      async read() {
        return null
      },
      async close() {
        scanCloseCalls += 1
      },
    }
    const verificationDirectoryHandle = {
      async read() {
        return null
      },
      async close() {
        verificationCloseCalls += 1
      },
    }
    const openDirectory = vi
      .spyOn(fs, 'opendir')
      .mockResolvedValueOnce(scanDirectoryHandle as never)
      .mockResolvedValueOnce(verificationDirectoryHandle as never)

    try {
      await expect(loadTokenSource(dir)).resolves.toMatchObject({ files: {} })
      expect(openDirectory).toHaveBeenCalledTimes(2)
    } finally {
      openDirectory.mockRestore()
    }

    expect(scanCloseCalls).toBe(1)
    expect(verificationCloseCalls).toBe(1)
  })

  it('reports a directory close failure after a successful scan', async () => {
    const dir = path.join(tmpDir, 'directory-close-only-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    const closeFailure = new Error('Injected token directory close failure.')
    let closeCalls = 0
    const directoryHandle = {
      async read() {
        return null
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
    expect(failure.message).toBe('Could not close token source directory: .')
    expect(failure.cause).toBe(closeFailure)
    expect(closeCalls).toBe(1)
  })
})
