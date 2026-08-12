import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineFile } from '@primitree/dtcg'
import {
  inspectBuildOutput,
  installBuildOutput as installBuildOutputWithRoot,
} from '../src/build-output'
import {
  BUILD_MANIFEST_PATH,
  createBuildManifest,
  hashBuildText,
} from '../src/output-manifest'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-output-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

function buildFiles(files: readonly PipelineFile[]): PipelineFile[] {
  return [
    ...files,
    createBuildManifest({
      source: 'brand',
      sourceContents: 'source\n',
      formats: ['dtcg'],
      files,
    }),
  ]
}

function installBuildOutput(
  output: string,
  files: readonly PipelineFile[],
  sourceId: string,
  root = directory
) {
  return installBuildOutputWithRoot(output, files, sourceId, root)
}

async function snapshotFiles(root: string): Promise<unknown> {
  const pending = ['']
  const files: string[] = []
  while (pending.length > 0) {
    const relative = pending.pop()
    if (relative === undefined) {
      break
    }
    const entries = await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    })
    for (const entry of entries) {
      const entryPath = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else {
        files.push(entryPath)
      }
    }
  }
  return Promise.all(
    files.sort().map(async file => {
      const filePath = path.join(root, file)
      const [contents, stats] = await Promise.all([
        fs.readFile(filePath, 'utf8'),
        fs.stat(filePath),
      ])
      return {
        file,
        contents,
        mode: stats.mode,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      }
    })
  )
}

describe('configured build output paths', () => {
  it('rejects candidate files without one manifest', async () => {
    const output = path.join(directory, 'generated')

    await expect(
      installBuildOutput(
        output,
        [{ path: 'tokens/a.json', contents: 'value\n' }],
        'brand'
      )
    ).rejects.toThrow('Build output requires one Primitree manifest file.')

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readdir(directory)).resolves.toEqual([])
  })

  it('rejects a candidate manifest that does not match its files', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([
      { path: 'tokens/a.json', contents: 'original\n' },
    ])
    files[0] = { path: 'tokens/a.json', contents: 'changed\n' }

    await expect(installBuildOutput(output, files, 'brand')).rejects.toThrow(
      'Build output manifest does not match its files.'
    )

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readdir(directory)).resolves.toEqual([])
  })

  it('rejects a candidate manifest for another source', async () => {
    const output = path.join(directory, 'generated')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'product'
      )
    ).rejects.toThrow(
      'Build output manifest belongs to source "brand", not "product".'
    )

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readdir(directory)).resolves.toEqual([])
  })

  it.each([
    '../outside.txt',
    '/absolute.txt',
    'C:/absolute.txt',
    'C:relative.txt',
    'tokens\\source.json',
    'tokens/source:stream.json',
    'tokens/CON.json',
    'tokens/COM¹.json',
    'tokens/LPT³.cache',
    'tokens/source.json.',
    'tokens/source.json ',
    'tokens//source.json',
    'tokens/./source.json',
    'tokens/../source.json',
    'tokens/control-\u0000.json',
  ])('rejects unsafe path %j before creating output', async filePath => {
    const output = path.join(directory, 'generated')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: filePath, contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(`Unsafe build output path: ${JSON.stringify(filePath)}.`)

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readdir(directory)).resolves.toEqual([])
  })

  it.each([
    ['tokens/a.json', 'tokens/a.json'],
    ['tokens/a.json', 'TOKENS/A.JSON'],
    ['tokens/café.json', 'tokens/café.json'],
    ['tokens/I.json', 'tokens/ı.json'],
    ['tokens/ß.json', 'tokens/SS.json'],
    ['tokens/ẞ.json', 'tokens/ß.json'],
    ['tokens', 'tokens/a.json'],
  ])('rejects colliding paths %j and %j', async (left, right) => {
    const output = path.join(directory, 'generated')

    await expect(
      installBuildOutput(
        output,
        buildFiles([
          { path: left, contents: 'left\n' },
          { path: right, contents: 'right\n' },
        ]),
        'brand'
      )
    ).rejects.toThrow('Build output paths collide')

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readdir(directory)).resolves.toEqual([])
  })
})

describe('configured build output replacement', () => {
  it.skipIf(process.platform === 'win32')(
    'matches new sibling directory permissions for new output',
    async () => {
      const output = path.join(directory, 'generated')
      const control = path.join(directory, 'control')
      await fs.mkdir(control)
      const expectedMode = (await fs.stat(control)).mode & 0o777

      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )

      expect((await fs.stat(output)).mode & 0o777).toBe(expectedMode)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'preserves output directory permissions during replacement',
    async () => {
      const output = path.join(directory, 'generated')
      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
        'brand'
      )
      await fs.chmod(output, 0o750)

      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )

      expect((await fs.stat(output)).mode & 0o777).toBe(0o750)
      await expect(
        fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
      ).resolves.toBe('new\n')
    }
  )

  it('reports a file that blocks an expected directory as output drift', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([
      { path: 'css/tokens.css', contents: ':root {}\n' },
    ])
    await installBuildOutput(output, files, 'brand')
    await fs.rm(path.join(output, 'css'), { recursive: true })
    await fs.writeFile(path.join(output, 'css'), 'blocking file\n', 'utf8')

    await expect(inspectBuildOutput(output, files)).resolves.toEqual({
      status: 'drift',
      paths: [
        { path: 'css', kind: 'unexpected' },
        { path: 'css/tokens.css', kind: 'missing' },
      ],
    })
  })

  it('iterates output entries without loading each directory at once', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    const readDirectory = vi.spyOn(fs, 'readdir')

    await expect(inspectBuildOutput(output, files)).resolves.toEqual({
      status: 'current',
      paths: [],
    })

    expect(readDirectory).not.toHaveBeenCalledWith(output, {
      withFileTypes: true,
    })
  })

  it('rejects an oversized manifest before reading it', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
    await fs.truncate(manifestPath, 16 * 1024 * 1024 + 1)
    const readFile = vi.spyOn(fs, 'readFile')

    await expect(installBuildOutput(output, files, 'brand')).rejects.toThrow(
      'Build output manifest exceeds the 16 MiB limit.'
    )

    expect(readFile).not.toHaveBeenCalledWith(manifestPath, 'utf8')
  })

  it('rejects a file with the wrong byte size before reading it', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    const tokenPath = path.join(output, 'tokens', 'a.json')
    await fs.truncate(tokenPath, 2 * 1024 * 1024)
    const readFile = vi.spyOn(fs, 'readFile')

    await expect(installBuildOutput(output, files, 'brand')).rejects.toThrow(
      'Refusing to replace changed build output: tokens/a.json'
    )

    expect(readFile).not.toHaveBeenCalledWith(tokenPath, 'utf8')
  })

  it('stops when a file grows between its path check and open', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    const tokenPath = path.join(output, 'tokens', 'a.json')
    const open = fs.open.bind(fs)
    let enlarged = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (!enlarged && String(target) === tokenPath) {
        enlarged = true
        await fs.appendFile(tokenPath, 'later\n', 'utf8')
      }
      return open(target, flags, mode)
    })

    await expect(inspectBuildOutput(output, files)).rejects.toThrow(
      `Primitree found changed build output while reading: ${tokenPath}`
    )

    expect(enlarged).toBe(true)
  })

  it('stops scanning an output parent after 100,000 entries', async () => {
    const output = path.join(directory, 'generated')
    const openDirectory = fs.opendir.bind(fs)
    vi.spyOn(fs, 'opendir').mockImplementation(async target => {
      if (String(target) !== directory) {
        return openDirectory(target)
      }
      return {
        async *[Symbol.asyncIterator]() {
          for (let index = 0; index <= 100_000; index += 1) {
            yield { name: `sibling-${index}` }
          }
        },
      } as Awaited<ReturnType<typeof fs.opendir>>
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      'Build output parent can contain at most 100,000 entries.'
    )
  })

  it('stops when an earlier replacement left a backup', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const before = await snapshotFiles(output)
    const backup = path.join(
      directory,
      '.generated.primitree-backup-interrupted'
    )
    await fs.mkdir(backup)
    await fs.writeFile(path.join(backup, 'keep.txt'), 'keep me\n', 'utf8')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found one or more backups from an interrupted build. Check these paths before running the build again: ${backup}`
    )

    expect(await snapshotFiles(output)).toEqual(before)
    await expect(
      fs.readFile(path.join(backup, 'keep.txt'), 'utf8')
    ).resolves.toBe('keep me\n')
  })

  it('refuses to write while the output lock exists', async () => {
    const output = path.join(directory, 'generated')
    const lock = path.join(directory, '.generated.primitree-lock')
    await fs.writeFile(lock, '', 'utf8')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(`Another Primitree build holds the output lock: ${lock}`)

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(lock)).resolves.toBeDefined()
    expect(await fs.readdir(directory)).toEqual(['.generated.primitree-lock'])
  })

  it('keeps the operation error and attempts both lock cleanup steps', async () => {
    const output = path.join(directory, 'generated')
    const lock = path.join(directory, '.generated.primitree-lock')
    const backup = path.join(
      directory,
      '.generated.primitree-backup-interrupted'
    )
    await fs.mkdir(backup)
    const cleanupCalls: string[] = []
    const open = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === lock) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          cleanupCalls.push('close')
          await close()
          throw new Error('Injected lock close failure.')
        })
      }
      return handle
    })
    const remove = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (String(target) === lock) {
        cleanupCalls.push('remove')
        throw new Error('Injected lock removal failure.')
      }
      await remove(target, options)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found one or more backups from an interrupted build. Check these paths before running the build again: ${backup}\nPrimitree could not release the output lock: ${lock}`
    )

    expect(cleanupCalls).toEqual(['close', 'remove'])
    await expect(fs.lstat(lock)).resolves.toBeDefined()
  })

  it('reports a lock cleanup error after a successful build', async () => {
    const output = path.join(directory, 'generated')
    const lock = path.join(directory, '.generated.primitree-lock')
    const remove = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (String(target) === lock) {
        throw new Error('Injected lock removal failure.')
      }
      await remove(target, options)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(`Primitree could not release the output lock: ${lock}`)

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('value\n')
    await expect(fs.lstat(lock)).resolves.toBeDefined()
  })

  it('rejects a symbolic-link ancestor before creating output files', async () => {
    const project = path.join(directory, 'project')
    const outside = path.join(directory, 'outside')
    const linkedParent = path.join(project, 'build')
    const output = path.join(linkedParent, 'generated')
    await fs.mkdir(project)
    await fs.mkdir(outside)
    await fs.symlink(outside, linkedParent, 'dir')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        project
      )
    ).rejects.toThrow(
      `Build output path cannot use a symbolic link: ${linkedParent}`
    )

    await expect(fs.readdir(outside)).resolves.toEqual([])
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an unsafe path in the installed manifest', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const outside = path.join(directory, 'outside.txt')
    await fs.writeFile(outside, 'outside\n', 'utf8')
    await fs.rm(path.join(output, 'tokens'), { recursive: true })
    await fs.writeFile(
      path.join(output, BUILD_MANIFEST_PATH),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          source: { id: 'brand', sha256: hashBuildText('source\n') },
          formats: ['dtcg'],
          files: [
            {
              path: '../outside.txt',
              bytes: 8,
              sha256: hashBuildText('outside\n'),
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Unsafe build output path: "../outside.txt".')

    await expect(fs.readFile(outside, 'utf8')).resolves.toBe('outside\n')
    await expect(
      fs.readFile(path.join(output, BUILD_MANIFEST_PATH), 'utf8')
    ).resolves.toContain('../outside.txt')
  })

  it('restores the prior tree when installing the prepared tree fails', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const before = await snapshotFiles(output)
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (
        String(from).includes('.generated.primitree-stage-') &&
        to === output
      ) {
        throw new Error('Injected replacement failure.')
      }
      await rename(from, to)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Injected replacement failure.')

    expect(await snapshotFiles(output)).toEqual(before)
    expect(await fs.readdir(directory)).toEqual(['generated'])
  })

  it('keeps the install and restore errors when both operations fail', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const rename = fs.rename.bind(fs)
    let backup: string | undefined
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (
        from === output &&
        String(to).includes('.generated.primitree-backup-')
      ) {
        backup = String(to)
        await rename(from, to)
        return
      }
      if (
        String(from).includes('.generated.primitree-stage-') &&
        to === output
      ) {
        throw new Error('Injected install failure.')
      }
      if (backup !== undefined && String(from) === backup && to === output) {
        throw new Error('Injected restore failure.')
      }
      await rename(from, to)
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected the build to fail with an Error.')
    }
    expect(failure.message).toContain('Injected install failure.')
    expect(failure.message).toContain('Injected restore failure.')
    if (backup === undefined) {
      throw new Error(
        'Expected Primitree to retain one prior output directory.'
      )
    }
    expect(failure.message).toContain(backup)
    expect(failure.cause).toBeInstanceOf(AggregateError)
    await expect(fs.lstat(backup)).resolves.toBeDefined()
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the install error and names a stage that cleanup could not remove', async () => {
    const output = path.join(directory, 'generated')
    const rename = fs.rename.bind(fs)
    const remove = fs.rm.bind(fs)
    let stage: string | undefined
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (
        String(from).includes('.generated.primitree-stage-') &&
        to === output
      ) {
        stage = String(from)
        throw new Error('Injected install failure.')
      }
      await rename(from, to)
    })
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (stage !== undefined && String(target) === stage) {
        throw new Error('Injected stage cleanup failure.')
      }
      await remove(target, options)
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected the build to fail with an Error.')
    }
    expect(failure.message).toContain('Injected install failure.')
    expect(failure.message).toContain(
      `Primitree could not remove prepared build output: ${stage}`
    )
    if (stage === undefined) {
      throw new Error('Expected the build to keep one prepared directory.')
    }
    await expect(fs.lstat(stage)).resolves.toBeDefined()
  })

  it('preserves an edit made immediately before the prior tree is moved', async () => {
    const output = path.join(directory, 'generated')
    const tokenPath = path.join(output, 'tokens', 'a.json')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const rename = fs.rename.bind(fs)
    let injected = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (
        !injected &&
        from === output &&
        String(to).includes('.generated.primitree-backup-')
      ) {
        injected = true
        await fs.writeFile(tokenPath, 'late edit\n', 'utf8')
      }
      await rename(from, to)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Refusing to replace changed build output: tokens/a.json')

    expect(injected).toBe(true)
    await expect(fs.readFile(tokenPath, 'utf8')).resolves.toBe('late edit\n')
    expect(await fs.readdir(directory)).toEqual(['generated'])
  })

  it.skipIf(process.platform === 'win32')(
    'preserves permissions changed immediately before the prior tree is moved',
    async () => {
      const output = path.join(directory, 'generated')
      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
        'brand'
      )
      await fs.chmod(output, 0o750)
      const rename = fs.rename.bind(fs)
      let injected = false
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (
          !injected &&
          from === output &&
          String(to).includes('.generated.primitree-backup-')
        ) {
          injected = true
          await fs.chmod(output, 0o710)
        }
        await rename(from, to)
      })

      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )

      expect(injected).toBe(true)
      expect((await fs.stat(output)).mode & 0o777).toBe(0o710)
    }
  )

  it('restores the prior tree when reading its moved permissions fails', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const lstat = fs.lstat.bind(fs)
    vi.spyOn(fs, 'lstat').mockImplementation(async target => {
      if (String(target).includes('.generated.primitree-backup-')) {
        throw new Error('Injected permission read failure.')
      }
      return lstat(target)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Injected permission read failure.')

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
    expect(await fs.readdir(directory)).toEqual(['generated'])
  })

  it('reports the retained backup when old-tree cleanup fails', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const remove = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (String(target).includes('.generated.primitree-backup-')) {
        throw new Error('Injected cleanup failure.')
      }
      await remove(target, options)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      'Primitree installed the build output and could not remove the prior output:'
    )

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('new\n')
    const backups = (await fs.readdir(directory)).filter(entry =>
      entry.startsWith('.generated.primitree-backup-')
    )
    expect(backups).toHaveLength(1)
    const backup = backups[0]
    if (backup === undefined) {
      throw new Error('Expected Primitree to keep one prior output directory.')
    }
    await expect(
      fs.readFile(path.join(directory, backup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })
})
