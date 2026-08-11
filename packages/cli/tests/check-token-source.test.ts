import { spawnSync } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../src/args'
import { runCheck } from '../src/commands/check'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-cli-check-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(directory, { recursive: true, force: true })
})

function resolverFor(file: string): unknown {
  return {
    version: '2025.10',
    sets: { source: { sources: [{ $ref: file }] } },
    resolutionOrder: [{ $ref: '#/sets/source' }],
  }
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const target = path.join(directory, ...relativePath.split('/'))
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(value))
}

describe('primitree check built token source loading', () => {
  it('loads nested token files by their Resolver-relative paths', async () => {
    await writeJson(
      'tokens.resolver.json',
      resolverFor('themes/dark.tokens.json')
    )
    await writeJson('themes/dark.tokens.json', {
      theme: { $type: 'string', $value: 'dark' },
    })

    await runCheck(parseArgs([directory]))

    expect(process.exitCode).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith('Check passed.')
  })

  it('prefers a root Resolver over the fallback tokens directory', async () => {
    await writeJson('tokens.resolver.json', resolverFor('root.tokens.json'))
    await writeJson('root.tokens.json', {
      root: { $type: 'string', $value: 'root' },
    })
    await writeJson(
      'tokens/tokens.resolver.json',
      resolverFor('nested.tokens.json')
    )
    await writeJson('tokens/nested.tokens.json', {
      nested: { $value: 'untyped' },
    })

    await runCheck(parseArgs([directory]))

    expect(console.warn).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('rejects invalid UTF-8 before parsing a token file', async () => {
    await writeJson('tokens.resolver.json', resolverFor('invalid.tokens.json'))
    await fs.writeFile(
      path.join(directory, 'invalid.tokens.json'),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
    )

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source JSON is invalid UTF-8: invalid.tokens.json'
    )
  })

  it('rejects invalid UTF-8 before parsing the Resolver', async () => {
    await fs.writeFile(
      path.join(directory, 'tokens.resolver.json'),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
    )
    await writeJson('source.tokens.json', {})

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source JSON is invalid UTF-8: tokens.resolver.json'
    )
  })

  it('rejects a token file above the 20 MiB limit before parsing', async () => {
    await writeJson('tokens.resolver.json', resolverFor('large.tokens.json'))
    const target = path.join(directory, 'large.tokens.json')
    await fs.writeFile(target, '{}')
    await fs.truncate(target, 20 * 1024 * 1024 + 1)

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source JSON file exceeds the 20 MiB limit: large.tokens.json'
    )
  })

  it('counts the Resolver in the 256 MiB aggregate limit', async () => {
    await writeJson('tokens.resolver.json', {
      version: '2025.10',
      resolutionOrder: [],
    })
    const mib = 1024 * 1024
    const sizes = [...Array.from({ length: 12 }, () => 20 * mib), 16 * mib]
    for (const [index, size] of sizes.entries()) {
      const target = path.join(directory, `large-${index}.tokens.json`)
      await fs.writeFile(target, '{}')
      await fs.truncate(target, size)
    }

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source JSON files exceed the 256 MiB total limit.'
    )
  })

  it('rejects symbolic links anywhere in a built token source', async () => {
    const outside = path.join(
      path.dirname(directory),
      `${path.basename(directory)}-outside.json`
    )
    await writeJson('tokens.resolver.json', {
      version: '2025.10',
      resolutionOrder: [],
    })
    await writeJson('source.tokens.json', {})
    await fs.writeFile(outside, '{}')
    await fs.symlink(outside, path.join(directory, 'linked.tokens.json'))

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source cannot contain a symbolic link: linked.tokens.json'
      )
    } finally {
      await fs.rm(outside, { force: true })
    }
  })

  it('does not fall back when a root Resolver is a symbolic link', async () => {
    const nested = path.join(directory, 'tokens')
    const outside = path.join(directory, 'outside-resolver.json')
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(outside, JSON.stringify(resolverFor('root.tokens.json')))
    await fs.symlink(outside, path.join(directory, 'tokens.resolver.json'))
    await fs.writeFile(path.join(directory, 'root.tokens.json'), '{}')
    await fs.writeFile(
      path.join(nested, 'tokens.resolver.json'),
      JSON.stringify(resolverFor('nested.tokens.json'))
    )
    await fs.writeFile(path.join(nested, 'nested.tokens.json'), '{}')

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source cannot contain a symbolic link: tokens.resolver.json'
    )
  })

  it('does not fall back when a root Resolver is not a regular file', async () => {
    const nested = path.join(directory, 'tokens')
    await fs.mkdir(path.join(directory, 'tokens.resolver.json'))
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(
      path.join(nested, 'tokens.resolver.json'),
      JSON.stringify(resolverFor('nested.tokens.json'))
    )
    await fs.writeFile(path.join(nested, 'nested.tokens.json'), '{}')

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source Resolver path is not a regular file: tokens.resolver.json'
    )
  })

  it('rejects a symbolic link used as the fallback tokens directory', async () => {
    const target = path.join(
      path.dirname(directory),
      `${path.basename(directory)}-tokens`
    )
    await fs.mkdir(target, { recursive: true })
    await fs.writeFile(
      path.join(target, 'tokens.resolver.json'),
      JSON.stringify(resolverFor('source.tokens.json'))
    )
    await fs.writeFile(path.join(target, 'source.tokens.json'), '{}')
    await fs.symlink(target, path.join(directory, 'tokens'))

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        `Token source cannot use a symbolic link: ${path.join(directory, 'tokens')}`
      )
    } finally {
      await fs.rm(target, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')(
    'rejects special nodes even when their names are ignored',
    async () => {
      await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
      await writeJson('source.tokens.json', {})
      const specialPath = path.join(directory, 'stream')
      const created = spawnSync('mkfifo', [specialPath], { encoding: 'utf8' })
      expect(created.status).toBe(0)
      expect(created.stderr).toBe('')

      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source path is not a regular file or directory: stream'
      )
    }
  )

  it('bounds nested directories at 64 levels', async () => {
    await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
    await writeJson('source.tokens.json', {})
    const deep = path.join(
      directory,
      ...Array.from({ length: 65 }, (_, index) => `d${index}`)
    )
    await fs.mkdir(deep, { recursive: true })
    await fs.writeFile(path.join(deep, 'deep.tokens.json'), '{}')

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source can contain at most 64 nested directory levels.'
    )
  })

  it('bounds the source at 1,000 token files', async () => {
    await writeJson('tokens.resolver.json', {
      version: '2025.10',
      resolutionOrder: [],
    })
    await Promise.all(
      Array.from({ length: 1_001 }, (_, index) =>
        fs.writeFile(
          path.join(
            directory,
            `part-${String(index).padStart(4, '0')}.tokens.json`
          ),
          '{}'
        )
      )
    )

    await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
      'Token source can contain at most 1,000 token files.'
    )
  })

  it('bounds all encountered source entries at 100,000', async () => {
    await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
    await writeJson('source.tokens.json', {})
    let index = 0
    const directoryHandle = {
      async read() {
        index += 1
        return index <= 100_001 ? { name: 'ignored.txt' } : null
      },
      async close() {},
    }
    const openDirectory = vi
      .spyOn(fs, 'opendir')
      .mockResolvedValue(directoryHandle as never)

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source can contain at most 100,000 entries.'
      )
    } finally {
      openDirectory.mockRestore()
    }
  })

  it.skipIf(process.platform === 'win32')(
    'rejects unsafe portable token paths',
    async () => {
      await writeJson('tokens.resolver.json', {
        version: '2025.10',
        resolutionOrder: [],
      })
      await writeJson('CON.tokens.json', {})

      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Unsafe DTCG token file path: "CON.tokens.json".'
      )
    }
  )

  it('rejects portable token path collisions', async () => {
    await writeJson('tokens.resolver.json', {
      version: '2025.10',
      resolutionOrder: [],
    })
    await writeJson('Theme.tokens.json', {})
    const firstPath = path.join(directory, 'Theme.tokens.json')
    const secondPath = path.join(directory, 'theme.tokens.json')
    const firstStats = await fs.lstat(firstPath, { bigint: true })
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const openDirectory = fs.opendir.bind(fs)
    const lstat = fs.lstat.bind(fs)
    const readDirectory = vi
      .spyOn(fs, 'opendir')
      .mockImplementation(async (target, options) => {
        if (String(target) !== directory) {
          return openDirectory(target, options)
        }
        const directoryEntries = [
          ...entries,
          {
            name: 'theme.tokens.json',
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          },
        ]
        let index = 0
        return {
          async read() {
            const entry = directoryEntries[index]
            index += 1
            return entry ?? null
          },
          async close() {},
        } as never
      })
    const inspectPath = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === secondPath) {
          return firstStats
        }
        return lstat(target, options)
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'DTCG output paths collide: "Theme.tokens.json" and "theme.tokens.json".'
      )
    } finally {
      inspectPath.mockRestore()
      readDirectory.mockRestore()
    }
  })

  it('rejects a selected source root replaced during discovery', async () => {
    const original = `${directory}.original`
    const replacement = `${directory}.replacement`
    const resolverPath = path.join(directory, 'tokens.resolver.json')
    await writeJson('tokens.resolver.json', resolverFor('inside.tokens.json'))
    await writeJson('inside.tokens.json', {})
    await fs.mkdir(replacement)
    await fs.writeFile(
      path.join(replacement, 'tokens.resolver.json'),
      JSON.stringify(resolverFor('outside.tokens.json'))
    )
    await fs.writeFile(path.join(replacement, 'outside.tokens.json'), '{}')
    const lstat = fs.lstat.bind(fs)
    let swapped = false
    const inspectResolver = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        const stats = await lstat(target, options)
        if (String(target) === resolverPath && !swapped) {
          await fs.rename(directory, original)
          await fs.rename(replacement, directory)
          swapped = true
        }
        return stats
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      inspectResolver.mockRestore()
      if (swapped) {
        await fs.rename(directory, replacement)
        await fs.rename(original, directory)
        await fs.rm(replacement, { recursive: true, force: true })
      }
    }
  })

  it('rejects the outer source root replaced during final realpath', async () => {
    const original = `${directory}.original`
    const replacement = `${directory}.replacement`
    await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
    await writeJson('source.tokens.json', {})
    await fs.mkdir(replacement)
    await fs.writeFile(
      path.join(replacement, 'tokens.resolver.json'),
      JSON.stringify(resolverFor('source.tokens.json'))
    )
    await fs.writeFile(path.join(replacement, 'source.tokens.json'), '{}')
    const realpath = fs.realpath.bind(fs)
    let rootRealpathCalls = 0
    let swapped = false
    const resolvePath = vi
      .spyOn(fs, 'realpath')
      .mockImplementation(async (target, options) => {
        if (String(target) === directory) {
          rootRealpathCalls += 1
          if (rootRealpathCalls === 2) {
            await fs.rename(directory, original)
            await fs.rename(replacement, directory)
            swapped = true
          }
        }
        return realpath(target, options)
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      resolvePath.mockRestore()
      if (swapped) {
        await fs.rename(directory, replacement)
        await fs.rename(original, directory)
        await fs.rm(replacement, { recursive: true, force: true })
      }
    }

    expect(rootRealpathCalls).toBe(2)
    expect(swapped).toBe(true)
  })

  it('rejects a source entry added while another token file is read', async () => {
    const tokenPath = path.join(directory, 'source.tokens.json')
    await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
    await writeJson('source.tokens.json', {})
    const open = fs.open.bind(fs)
    let added = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === tokenPath && !added) {
          await fs.writeFile(path.join(directory, 'late.tokens.json'), '{}')
          added = true
        }
        return handle
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(added).toBe(true)
  })

  it('rejects a root Resolver added while reading the fallback source', async () => {
    const tokenDirectory = path.join(directory, 'tokens')
    const nestedToken = path.join(tokenDirectory, 'source.tokens.json')
    await writeJson(
      'tokens/tokens.resolver.json',
      resolverFor('source.tokens.json')
    )
    await writeJson('tokens/source.tokens.json', {})
    const open = fs.open.bind(fs)
    let added = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === nestedToken && !added) {
          await fs.writeFile(
            path.join(directory, 'tokens.resolver.json'),
            JSON.stringify(resolverFor('root.tokens.json'))
          )
          await fs.writeFile(path.join(directory, 'root.tokens.json'), '{}')
          added = true
        }
        return handle
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(added).toBe(true)
  })

  it('rejects the outer source root replaced while reading the fallback', async () => {
    const original = `${directory}.original`
    const replacement = `${directory}.replacement`
    const nestedToken = path.join(directory, 'tokens', 'source.tokens.json')
    await writeJson(
      'tokens/tokens.resolver.json',
      resolverFor('source.tokens.json')
    )
    await writeJson('tokens/source.tokens.json', {})
    await fs.mkdir(replacement)
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === nestedToken && !swapped) {
          await fs.rename(directory, original)
          await fs.rename(replacement, directory)
          swapped = true
        }
        return handle
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      openFile.mockRestore()
      if (swapped) {
        await fs.rename(directory, replacement)
        await fs.rename(original, directory)
        await fs.rm(replacement, { recursive: true, force: true })
      }
    }

    expect(swapped).toBe(true)
  })

  it('rechecks the outer root after confirming fallback precedence', async () => {
    const original = `${directory}.original`
    const replacement = `${directory}.replacement`
    const rootResolver = path.join(directory, 'tokens.resolver.json')
    await writeJson(
      'tokens/tokens.resolver.json',
      resolverFor('source.tokens.json')
    )
    await writeJson('tokens/source.tokens.json', {})
    await fs.mkdir(replacement)
    const lstat = fs.lstat.bind(fs)
    let resolverChecks = 0
    let swapped = false
    const inspectPath = vi
      .spyOn(fs, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === rootResolver) {
          resolverChecks += 1
          if (resolverChecks === 2) {
            await fs.rename(directory, original)
            await fs.rename(replacement, directory)
            swapped = true
          }
        }
        return lstat(target, options)
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source directory changed while reading: .'
      )
    } finally {
      inspectPath.mockRestore()
      if (swapped) {
        await fs.rename(directory, replacement)
        await fs.rename(original, directory)
        await fs.rm(replacement, { recursive: true, force: true })
      }
    }

    expect(resolverChecks).toBe(2)
    expect(swapped).toBe(true)
  })

  it('rejects a nested directory replaced outside the source before it opens', async () => {
    const nested = path.join(directory, 'themes')
    const outside = `${directory}-outside`
    await writeJson(
      'tokens.resolver.json',
      resolverFor('themes/dark.tokens.json')
    )
    await writeJson('themes/dark.tokens.json', {})
    await fs.mkdir(outside)
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
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        /Token source (?:directory changed while reading|cannot use a symbolic link): themes/
      )
    } finally {
      readDirectory.mockRestore()
      if (swapped) {
        await fs.unlink(nested)
        await fs.rename(`${nested}.original`, nested)
      }
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects a token file replaced while it opens', async () => {
    const tokenPath = path.join(directory, 'source.tokens.json')
    const replacement = path.join(directory, 'replacement.json')
    const original = `${tokenPath}.original`
    await writeJson('tokens.resolver.json', resolverFor('source.tokens.json'))
    await writeJson('source.tokens.json', {})
    await fs.writeFile(replacement, '{}')
    const open = fs.open.bind(fs)
    let swapped = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        if (String(target) === tokenPath && !swapped) {
          await fs.rename(tokenPath, original)
          await fs.rename(replacement, tokenPath)
          const handle = await open(target, flags, mode)
          await fs.rename(tokenPath, replacement)
          await fs.rename(original, tokenPath)
          swapped = true
          return handle
        }
        return open(target, flags, mode)
      })

    try {
      await expect(runCheck(parseArgs([directory]))).rejects.toThrow(
        'Token source file changed while reading: source.tokens.json'
      )
    } finally {
      openFile.mockRestore()
    }

    expect(swapped).toBe(true)
  })

  it('preserves a token read failure when closing the file also fails', async () => {
    const target = path.join(directory, 'invalid.tokens.json')
    await writeJson('tokens.resolver.json', resolverFor('invalid.tokens.json'))
    await fs.writeFile(target, '{')
    const closeFailure = new Error('Injected close failure.')
    const open = fs.open.bind(fs)
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (file, flags, mode) => {
        const handle = await open(file, flags, mode)
        if (String(file) === target) {
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
      failure = await runCheck(parseArgs([directory])).catch(error => error)
    } finally {
      openFile.mockRestore()
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'Token source JSON is invalid: invalid.tokens.json\n' +
        'Could not close token source JSON file: invalid.tokens.json'
    )
    expect((failure as Error).cause).toBeInstanceOf(AggregateError)
  })
})

describe('primitree check variables source loading', () => {
  function validVariables(): unknown {
    return { meta: { variableCollections: {}, variables: {} } }
  }

  it('rejects invalid UTF-8 before parsing variables JSON', async () => {
    const source = path.join(directory, 'variables.json')
    await fs.writeFile(
      source,
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
    )

    await runCheck(parseArgs([source]))

    expect(console.error).toHaveBeenCalledWith(
      'error: Token source JSON is invalid UTF-8: variables.json'
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects variables JSON above the 20 MiB limit', async () => {
    const source = path.join(directory, 'variables.json')
    await fs.writeFile(source, JSON.stringify(validVariables()))
    await fs.truncate(source, 20 * 1024 * 1024 + 1)

    await runCheck(parseArgs([source]))

    expect(console.error).toHaveBeenCalledWith(
      'error: Token source JSON file exceeds the 20 MiB limit: variables.json'
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects a symbolic link used as variables JSON', async () => {
    const target = path.join(directory, 'target.json')
    const source = path.join(directory, 'variables.json')
    await fs.writeFile(target, JSON.stringify(validVariables()))
    await fs.symlink(target, source)

    await runCheck(parseArgs([source]))

    expect(console.error).toHaveBeenCalledWith(
      `error: Token source cannot use a symbolic link: ${source}`
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects a dangling symbolic link instead of calling it missing', async () => {
    const source = path.join(directory, 'variables.json')
    await fs.symlink(path.join(directory, 'missing.json'), source)

    await runCheck(parseArgs([source]))

    expect(console.error).toHaveBeenCalledWith(
      `error: Token source cannot use a symbolic link: ${source}`
    )
    expect(process.exitCode).toBe(1)
  })

  it('propagates a source inspection failure', async () => {
    const source = path.join(directory, 'variables.json')
    const failure = Object.assign(new Error('Injected inspection failure.'), {
      code: 'EACCES',
    })
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
      caught = await runCheck(parseArgs([source])).catch(error => error)
    } finally {
      inspectSource.mockRestore()
    }

    expect(caught).toBe(failure)
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a variables FIFO without opening it',
    async () => {
      const source = path.join(directory, 'variables.json')
      const created = spawnSync('mkfifo', [source], { encoding: 'utf8' })
      expect(created.status).toBe(0)
      expect(created.stderr).toBe('')
      const open = fs.open.bind(fs)
      const stat = fs.stat.bind(fs)
      let usedNonblockingOpen = false
      const inspectWithStat = vi
        .spyOn(fs, 'stat')
        .mockImplementation(async (target, options) => {
          if (String(target) === source) {
            throw new Error('The dispatch probe must use lstat.')
          }
          return stat(target, options)
        })
      const openFile = vi
        .spyOn(fs, 'open')
        .mockImplementation(async (target, flags, mode) => {
          if (String(target) === source) {
            usedNonblockingOpen =
              typeof flags === 'number' &&
              (flags & fsConstants.O_NONBLOCK) === fsConstants.O_NONBLOCK
            if (!usedNonblockingOpen) {
              throw new Error('Test prevented a blocking FIFO open.')
            }
          }
          return open(target, flags, mode)
        })

      try {
        await runCheck(parseArgs([source]))
      } finally {
        openFile.mockRestore()
        inspectWithStat.mockRestore()
      }

      expect(usedNonblockingOpen).toBe(false)
      expect(console.error).toHaveBeenCalledWith(
        `error: Token source path is not a regular file: ${source}`
      )
      expect(process.exitCode).toBe(1)
    }
  )

  it('rejects variables JSON replaced while it opens', async () => {
    const source = path.join(directory, 'variables.json')
    const replacement = path.join(directory, 'replacement.json')
    const original = `${source}.original`
    await fs.writeFile(source, JSON.stringify(validVariables()))
    await fs.writeFile(replacement, JSON.stringify(validVariables()))
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
      await runCheck(parseArgs([source]))
    } finally {
      openFile.mockRestore()
    }

    expect(swapped).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      'error: Token source file changed while reading: variables.json'
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects variables JSON changed through the same inode while reading', async () => {
    const source = path.join(directory, 'variables.json')
    const marker = 'before!!'
    const changedMarker = 'after!!!'
    const raw = JSON.stringify({
      meta: { variableCollections: {}, variables: {} },
      padding: 'a'.repeat(70 * 1024),
      marker,
    })
    const markerOffset = raw.indexOf(marker)
    await fs.writeFile(source, raw)
    const open = fs.open.bind(fs)
    let changed = false
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === source) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async (...args) => {
            const result = await read(...args)
            if (!changed && result.bytesRead > 0) {
              const writer = await open(source, 'r+')
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
      await runCheck(parseArgs([source]))
    } finally {
      openFile.mockRestore()
    }

    expect(changed).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      'error: Token source file changed while reading: variables.json'
    )
    expect(process.exitCode).toBe(1)
  })

  it('preserves invalid variables JSON and close failures', async () => {
    const source = path.join(directory, 'variables.json')
    await fs.writeFile(source, '{')
    const closeFailure = new Error('Injected variables close failure.')
    const open = fs.open.bind(fs)
    const openFile = vi
      .spyOn(fs, 'open')
      .mockImplementation(async (target, flags, mode) => {
        const handle = await open(target, flags, mode)
        if (String(target) === source) {
          const close = handle.close.bind(handle)
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            await close()
            throw closeFailure
          })
        }
        return handle
      })

    try {
      await runCheck(parseArgs([source]))
    } finally {
      openFile.mockRestore()
    }

    expect(console.error).toHaveBeenCalledWith(
      'error: Token source JSON is invalid: variables.json\n' +
        'Could not close token source JSON file: variables.json'
    )
    expect(process.exitCode).toBe(1)
  })
})
