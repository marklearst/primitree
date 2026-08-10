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
  buildOutputLongestSidecarName,
  MAX_BUILD_RESOLVED_PATH_BYTES,
} from '../src/build-output-paths'
import {
  BUILD_MANIFEST_PATH,
  createBuildManifest,
  hashBuildText,
  type BuildManifest,
} from '../src/output-manifest'

let directory: string
let sandboxDirectory: string

beforeEach(async () => {
  sandboxDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'primitree-output-')
  )
  directory = path.join(sandboxDirectory, 'project')
  await fs.mkdir(directory)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(sandboxDirectory, { recursive: true, force: true })
})

function buildFiles(
  files: readonly PipelineFile[],
  source = 'brand'
): PipelineFile[] {
  return [
    ...files,
    createBuildManifest({
      source,
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

function relativeFilePathWithResolvedBytes(
  targetDirectory: string,
  resolvedBytes: number,
  fill: string
): string {
  const separatorBytes = Buffer.byteLength(path.sep, 'utf8')
  let remaining =
    resolvedBytes -
    Buffer.byteLength(`${path.resolve(targetDirectory)}${path.sep}`, 'utf8')
  const segments: string[] = []
  while (remaining > 200) {
    const segmentBytes = Math.min(200, remaining - 1 - separatorBytes)
    const fillBytes = Buffer.byteLength(fill, 'utf8')
    const repeatedBytes = Math.floor(segmentBytes / fillBytes) * fillBytes
    segments.push(
      `${fill.repeat(repeatedBytes / fillBytes)}${'a'.repeat(segmentBytes - repeatedBytes)}`
    )
    remaining -= segmentBytes + separatorBytes
  }
  const fillBytes = Buffer.byteLength(fill, 'utf8')
  const repeatedBytes = Math.floor(remaining / fillBytes) * fillBytes
  segments.push(
    `${fill.repeat(repeatedBytes / fillBytes)}${'a'.repeat(remaining - repeatedBytes)}`
  )
  return segments.join('/')
}

async function replaceInstalledManifestFiles(
  output: string,
  files: BuildManifest['files']
): Promise<void> {
  const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf8')
  ) as BuildManifest
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        ...manifest,
        files: [...files].sort((left, right) =>
          left.path.localeCompare(right.path)
        ),
      },
      null,
      2
    )}\n`,
    'utf8'
  )
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
    ['ASCII', 'a'.repeat(255)],
    ['multibyte', '界'.repeat(85)],
  ])(
    'accepts %s build-file path components at 255 UTF-8 bytes',
    async (_kind, segment) => {
      const output = path.join(directory, 'generated')
      const filePath = `${segment}/${segment}`

      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }]),
          'brand'
        )
      ).resolves.toBe('written')

      await expect(
        fs.readFile(path.join(output, filePath), 'utf8')
      ).resolves.toBe('value\n')
    }
  )

  it.each([
    ['ASCII intermediate', 'a'.repeat(256), 'token.json'],
    ['ASCII final', 'tokens', 'a'.repeat(256)],
    ['multibyte intermediate', `${'界'.repeat(85)}a`, 'token.json'],
    ['multibyte final', 'tokens', `${'界'.repeat(85)}a`],
  ])(
    'rejects a 256-byte %s build-file path component before creating output',
    async (_kind, first, second) => {
      const output = path.join(directory, 'generated')
      const filePath = `${first}/${second}`

      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }]),
          'brand'
        )
      ).rejects.toThrow(
        `Build output path segment is 256 UTF-8 bytes; use at most 255 UTF-8 bytes: ${JSON.stringify(filePath)}.`
      )

      await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(fs.readdir(directory)).resolves.toEqual([])
    }
  )

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

  it('accepts 64 build-file directory levels', async () => {
    const output = path.join(directory, 'generated')
    const filePath = `${Array.from(
      { length: 64 },
      (_, index) => `d${index}`
    ).join('/')}/token.json`

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: filePath, contents: 'value\n' }]),
        'brand'
      )
    ).resolves.toBe('written')

    await expect(
      fs.readFile(path.join(output, filePath), 'utf8')
    ).resolves.toBe('value\n')
  })

  it('keeps the 16,639-byte relative limit before applying the resolved-path limit', async () => {
    const output = path.join(directory, 'missing')
    const filePath = Array.from({ length: 65 }, () => 'a'.repeat(255)).join('/')
    const files = buildFiles([{ path: filePath, contents: 'value\n' }])

    expect(Buffer.byteLength(filePath, 'utf8')).toBe(16_639)
    await expect(inspectBuildOutput(output, files)).rejects.toThrow(
      'Resolved build output file path is'
    )
  })

  it.each([
    ['ASCII', 'a'],
    ['multibyte', '界'],
  ])(
    'inspects a %s build-file path at exactly 1,023 resolved UTF-8 bytes',
    async (_kind, fill) => {
      const output = path.join(directory, 'missing')
      const filePath = relativeFilePathWithResolvedBytes(
        output,
        MAX_BUILD_RESOLVED_PATH_BYTES,
        fill
      )
      expect(
        Buffer.byteLength(path.join(output, ...filePath.split('/')), 'utf8')
      ).toBe(MAX_BUILD_RESOLVED_PATH_BYTES)
      for (const segment of filePath.split('/')) {
        expect(Buffer.byteLength(segment, 'utf8')).toBeLessThanOrEqual(255)
      }

      await expect(
        inspectBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }])
        )
      ).resolves.toMatchObject({ status: 'drift' })
    }
  )

  it.each([
    ['ASCII', 'a'],
    ['multibyte', '界'],
  ])(
    'rejects a %s build-file path at 1,024 resolved UTF-8 bytes before inspection',
    async (_kind, fill) => {
      const output = path.join(directory, 'missing')
      const filePath = relativeFilePathWithResolvedBytes(
        output,
        MAX_BUILD_RESOLVED_PATH_BYTES + 1,
        fill
      )
      const lstat = fs.lstat.bind(fs)
      let filesystemReads = 0
      vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
        filesystemReads += 1
        return lstat(target, options)
      })

      await expect(
        inspectBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }])
        )
      ).rejects.toThrow(
        `Resolved build output file path is ${MAX_BUILD_RESOLVED_PATH_BYTES + 1} UTF-8 bytes; use at most ${MAX_BUILD_RESOLVED_PATH_BYTES} UTF-8 bytes: ${JSON.stringify(filePath)}.`
      )
      expect(filesystemReads).toBe(0)
    }
  )
})

describe('configured build output replacement', () => {
  it('detects a physical-root ABA during inspection', async () => {
    const root = path.join(directory, 'project')
    const heldRoot = path.join(directory, 'project-held')
    const substituteRoot = path.join(directory, 'project-substitute')
    const output = path.join(root, 'generated')
    await fs.mkdir(root)
    await fs.mkdir(substituteRoot)
    const realpath = fs.realpath.bind(fs)
    let swapped = false
    vi.spyOn(fs, 'realpath').mockImplementation(async target => {
      const resolved = await realpath(target)
      if (!swapped && String(target) === root) {
        await fs.rename(root, heldRoot)
        await fs.rename(substituteRoot, root)
        await fs.rename(root, substituteRoot)
        await fs.rename(heldRoot, root)
        swapped = true
      }
      return resolved
    })

    await expect(
      inspectBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
  })

  it('creates multiple missing output parents under a stable root', async () => {
    const root = path.join(directory, 'project')
    const output = path.join(root, 'a', 'b', 'generated')
    await fs.mkdir(root)

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).resolves.toBe('written')

    await expect(
      fs.readFile(path.join(output, 'tokens/a.json'), 'utf8')
    ).resolves.toBe('value\n')
  })

  it('rejects an output-root ABA around the first parent creation', async () => {
    const root = path.join(directory, 'project')
    const heldRoot = path.join(directory, 'project-held')
    const substituteRoot = path.join(directory, 'project-substitute')
    const firstParent = path.join(root, 'a')
    const output = path.join(firstParent, 'generated')
    await fs.mkdir(root)
    await fs.mkdir(substituteRoot)
    const mkdir = fs.mkdir.bind(fs)
    const open = fs.open.bind(fs)
    let swapped = false
    let lockOpens = 0
    vi.spyOn(fs, 'mkdir').mockImplementation(async (target, options) => {
      if (!swapped && String(target) === firstParent) {
        await fs.rename(root, heldRoot)
        await fs.rename(substituteRoot, root)
        const result = await mkdir(target, options)
        await fs.rename(root, substituteRoot)
        await fs.rename(heldRoot, root)
        swapped = true
        return result
      }
      return mkdir(target, options)
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target).includes('.generated.primitree-lock')) {
        lockOpens += 1
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(lockOpens).toBe(0)
    await expect(fs.readdir(root)).resolves.toEqual([])
  })

  it('keeps a direct output root bound during the creating traversal', async () => {
    const root = path.join(directory, 'project')
    const heldRoot = path.join(directory, 'project-held')
    const substituteRoot = path.join(directory, 'project-substitute')
    const output = path.join(root, 'generated')
    await fs.mkdir(root)
    await fs.mkdir(substituteRoot)
    const lstat = fs.lstat.bind(fs)
    const realpath = fs.realpath.bind(fs)
    const open = fs.open.bind(fs)
    let preflightResolved = false
    let rootReadsAfterPreflight = 0
    let swapped = false
    let lockOpens = 0
    vi.spyOn(fs, 'realpath').mockImplementation(async target => {
      const resolved = await realpath(target)
      if (String(target) === root) {
        preflightResolved = true
      }
      return resolved
    })
    vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
      const stats = await lstat(target, options)
      if (preflightResolved && String(target) === root) {
        rootReadsAfterPreflight += 1
        if (!swapped && rootReadsAfterPreflight === 5) {
          await fs.rename(root, heldRoot)
          await fs.rename(substituteRoot, root)
          swapped = true
        }
      }
      return stats
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target).includes('.generated.primitree-lock')) {
        lockOpens += 1
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(lockOpens).toBe(0)
    await expect(fs.readdir(root)).resolves.toEqual([])
  })

  it('binds the physical-root preflight before creating an output lock', async () => {
    const root = path.join(directory, 'project')
    const heldRoot = path.join(directory, 'project-held')
    const substituteRoot = path.join(directory, 'project-substitute')
    const output = path.join(root, 'generated')
    await fs.mkdir(root)
    await fs.mkdir(substituteRoot)
    const realpath = fs.realpath.bind(fs)
    const open = fs.open.bind(fs)
    let swapped = false
    let lockOpens = 0
    vi.spyOn(fs, 'realpath').mockImplementation(async target => {
      const resolved = await realpath(target)
      if (!swapped && String(target) === root) {
        await fs.rename(root, heldRoot)
        await fs.rename(substituteRoot, root)
        swapped = true
      }
      return resolved
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target).includes('.generated.primitree-lock')) {
        lockOpens += 1
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(lockOpens).toBe(0)
    await expect(fs.readdir(root)).resolves.toEqual([])
  })

  it('detects a physical-root ABA during realpath before creating an output lock', async () => {
    const root = path.join(directory, 'project')
    const heldRoot = path.join(directory, 'project-held')
    const substituteRoot = path.join(directory, 'project-substitute')
    const output = path.join(root, 'generated')
    await fs.mkdir(root)
    await fs.mkdir(substituteRoot)
    const realpath = fs.realpath.bind(fs)
    const open = fs.open.bind(fs)
    let swapped = false
    let lockOpens = 0
    vi.spyOn(fs, 'realpath').mockImplementation(async target => {
      const resolved = await realpath(target)
      if (!swapped && String(target) === root) {
        await fs.rename(root, heldRoot)
        await fs.rename(substituteRoot, root)
        await fs.rename(root, substituteRoot)
        await fs.rename(heldRoot, root)
        swapped = true
      }
      return resolved
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target).includes('.generated.primitree-lock')) {
        lockOpens += 1
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(lockOpens).toBe(0)
    await expect(fs.readdir(root)).resolves.toEqual([])
  })

  it('keeps the closest existing output parent bound during creation', async () => {
    const root = path.join(directory, 'project')
    const parent = path.join(root, 'build')
    const heldParent = path.join(root, 'build-held')
    const substituteParent = path.join(root, 'build-substitute')
    const output = path.join(parent, 'generated')
    await fs.mkdir(parent, { recursive: true })
    await fs.mkdir(substituteParent)
    const lstat = fs.lstat.bind(fs)
    const open = fs.open.bind(fs)
    let parentReads = 0
    let swapped = false
    let lockOpens = 0
    vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
      const stats = await lstat(target, options)
      if (String(target) === parent) {
        parentReads += 1
        if (!swapped && parentReads > 2) {
          await fs.rename(parent, heldParent)
          await fs.rename(substituteParent, parent)
          swapped = true
        }
      }
      return stats
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (String(target).includes('.generated.primitree-lock')) {
        lockOpens += 1
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        root
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(lockOpens).toBe(0)
    await expect(fs.readdir(parent)).resolves.toEqual([])
  })

  it.each([
    ['ASCII', 'a'],
    ['multibyte', '界'],
  ])(
    'installs a %s build-file path at exactly 1,023 bytes below the longest synthetic root',
    async (_kind, fill) => {
      const output = path.join(directory, 'generated')
      const physicalDirectory = await fs.realpath(directory)
      const longestSyntheticRoot = path.join(
        physicalDirectory,
        buildOutputLongestSidecarName('generated')
      )
      const filePath = relativeFilePathWithResolvedBytes(
        longestSyntheticRoot,
        MAX_BUILD_RESOLVED_PATH_BYTES,
        fill
      )
      expect(
        Buffer.byteLength(
          path.join(longestSyntheticRoot, ...filePath.split('/')),
          'utf8'
        )
      ).toBe(MAX_BUILD_RESOLVED_PATH_BYTES)

      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }]),
          'brand'
        )
      ).resolves.toBe('written')
      await expect(
        fs.readFile(path.join(output, ...filePath.split('/')), 'utf8')
      ).resolves.toBe('value\n')
      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'changed\n' }]),
          'brand'
        )
      ).resolves.toBe('written')
      await expect(
        fs.readFile(path.join(output, ...filePath.split('/')), 'utf8')
      ).resolves.toBe('changed\n')
    }
  )

  it.each([
    ['ASCII', 'a'],
    ['multibyte', '界'],
  ])(
    'rejects a %s build-file path at 1,024 bytes below the longest synthetic root before locking',
    async (_kind, fill) => {
      const output = path.join(directory, 'generated')
      const physicalDirectory = await fs.realpath(directory)
      const longestSyntheticRoot = path.join(
        physicalDirectory,
        buildOutputLongestSidecarName('generated')
      )
      const filePath = relativeFilePathWithResolvedBytes(
        longestSyntheticRoot,
        MAX_BUILD_RESOLVED_PATH_BYTES + 1,
        fill
      )
      expect(
        Buffer.byteLength(
          path.join(longestSyntheticRoot, ...filePath.split('/')),
          'utf8'
        )
      ).toBe(MAX_BUILD_RESOLVED_PATH_BYTES + 1)
      const open = fs.open.bind(fs)
      const lstat = fs.lstat.bind(fs)
      let lockOpens = 0
      let filesystemReads = 0
      vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
        lockOpens += 1
        return open(target, flags, mode)
      })
      vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
        filesystemReads += 1
        return lstat(target, options)
      })

      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: filePath, contents: 'value\n' }]),
          'brand'
        )
      ).rejects.toThrow(
        `Resolved build output file path is ${MAX_BUILD_RESOLVED_PATH_BYTES + 1} UTF-8 bytes; use at most ${MAX_BUILD_RESOLVED_PATH_BYTES} UTF-8 bytes: ${JSON.stringify(filePath)}.`
      )
      expect(lockOpens).toBe(0)
      expect(filesystemReads).toBeGreaterThan(0)
    }
  )

  it('keeps writer parent guards valid across a new install and replacement', async () => {
    const output = path.join(directory, 'generated')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
        'brand'
      )
    ).resolves.toBe('written')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).resolves.toBe('written')

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('new\n')
  })

  it('rejects 65 manifest directory levels before joining the path', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const hostilePath = `${Array.from(
      { length: 65 },
      (_, index) => `d${index}`
    ).join('/')}/token.json`
    await replaceInstalledManifestFiles(output, [
      {
        path: 'tokens/a.json',
        bytes: Buffer.byteLength('old\n', 'utf8'),
        sha256: hashBuildText('old\n'),
      },
      { path: hostilePath, bytes: 0, sha256: hashBuildText('') },
    ])
    const join = path.join.bind(path)
    vi.spyOn(path, 'join').mockImplementation((...segments) => {
      if (segments.length > 65) {
        throw new Error('Reached an unbounded build-output path join.')
      }
      return join(...segments)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      'Build output path can contain at most 64 nested directory levels.'
    )
  })

  it('rejects an oversized manifest path before splitting or joining it', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const hostilePath = Array.from({ length: 66 }, () => 'a'.repeat(255)).join(
      '/'
    )
    expect(Buffer.byteLength(hostilePath, 'utf8')).toBe(16_895)
    await replaceInstalledManifestFiles(output, [
      {
        path: 'tokens/a.json',
        bytes: Buffer.byteLength('old\n', 'utf8'),
        sha256: hashBuildText('old\n'),
      },
      { path: hostilePath, bytes: 0, sha256: hashBuildText('') },
    ])
    const join = path.join.bind(path)
    vi.spyOn(path, 'join').mockImplementation((...segments) => {
      if (segments.length > 65) {
        throw new Error('Reached an unbounded build-output path join.')
      }
      return join(...segments)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      'Build output path can contain at most 16,639 UTF-8 bytes.'
    )
  })

  it.each([
    ['ASCII', 'a'],
    ['multibyte', '界'],
  ])(
    'rejects a %s installed-manifest path at 1,024 resolved UTF-8 bytes before inspecting the owned path',
    async (_kind, fill) => {
      const output = path.join(directory, 'generated')
      await installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
        'brand'
      )
      const hostilePath = relativeFilePathWithResolvedBytes(
        output,
        MAX_BUILD_RESOLVED_PATH_BYTES + 1,
        fill
      )
      const hostileAbsolute = path.join(output, ...hostilePath.split('/'))
      expect(Buffer.byteLength(hostileAbsolute, 'utf8')).toBe(
        MAX_BUILD_RESOLVED_PATH_BYTES + 1
      )
      await replaceInstalledManifestFiles(output, [
        {
          path: 'tokens/a.json',
          bytes: Buffer.byteLength('old\n', 'utf8'),
          sha256: hashBuildText('old\n'),
        },
        { path: hostilePath, bytes: 0, sha256: hashBuildText('') },
      ])
      const lstat = fs.lstat.bind(fs)
      let hostilePathReads = 0
      vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
        if (String(target) === hostileAbsolute) {
          hostilePathReads += 1
        }
        return lstat(target, options)
      })

      await expect(
        installBuildOutput(
          output,
          buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
          'brand'
        )
      ).rejects.toThrow(
        `Resolved build output file path is ${MAX_BUILD_RESOLVED_PATH_BYTES + 1} UTF-8 bytes; use at most ${MAX_BUILD_RESOLVED_PATH_BYTES} UTF-8 bytes: ${JSON.stringify(hostilePath)}.`
      )
      expect(hostilePathReads).toBe(0)
    }
  )

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

  it('does not omit an unexpected file from a swapped directory handle', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.writeFile(path.join(output, 'keep.txt'), 'user data\n', 'utf8')
    await fs.cp(output, outside, { recursive: true })
    await fs.rm(path.join(outside, 'keep.txt'))
    const openDirectory = fs.opendir.bind(fs)
    let swapped = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      if (!swapped && String(target) === output) {
        await fs.rename(output, heldOutput)
        await fs.rename(outside, output)
        const handle = await openDirectory(output, options)
        await fs.rename(output, outside)
        await fs.rename(heldOutput, output)
        swapped = true
        return handle
      }
      return openDirectory(target, options)
    })

    await expect(inspectBuildOutput(output, files, directory)).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(swapped).toBe(true)
  })

  it('detects repeated output-root swap-open-restore scans', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.writeFile(path.join(output, 'keep.txt'), 'user data\n', 'utf8')
    await fs.cp(output, outside, { recursive: true })
    await fs.rm(path.join(outside, 'keep.txt'))
    const openDirectory = fs.opendir.bind(fs)
    let rootOpens = 0
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      if (String(target) !== output) {
        return openDirectory(target, options)
      }
      rootOpens += 1
      await fs.rename(output, heldOutput)
      await fs.rename(outside, output)
      const handle = await openDirectory(output, options)
      await fs.rename(output, outside)
      await fs.rename(heldOutput, output)
      return handle
    })

    await expect(inspectBuildOutput(output, files, directory)).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(rootOpens).toBeGreaterThan(0)
    await expect(
      fs.readFile(path.join(output, 'keep.txt'), 'utf8')
    ).resolves.toBe('user data\n')
  })

  it('detects repeated nested-directory swap-open-restore scans', async () => {
    const output = path.join(directory, 'generated')
    const tokens = path.join(output, 'tokens')
    const heldTokens = path.join(output, 'held-tokens')
    const outsideTokens = path.join(directory, 'outside-tokens')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.writeFile(path.join(tokens, 'keep.txt'), 'user data\n', 'utf8')
    await fs.cp(tokens, outsideTokens, { recursive: true })
    await fs.rm(path.join(outsideTokens, 'keep.txt'))
    const openDirectory = fs.opendir.bind(fs)
    let nestedOpens = 0
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      if (String(target) !== tokens) {
        return openDirectory(target, options)
      }
      nestedOpens += 1
      await fs.rename(tokens, heldTokens)
      await fs.rename(outsideTokens, tokens)
      const handle = await openDirectory(tokens, options)
      await fs.rename(tokens, outsideTokens)
      await fs.rename(heldTokens, tokens)
      return handle
    })

    await expect(inspectBuildOutput(output, files, directory)).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(nestedOpens).toBeGreaterThan(0)
    await expect(
      fs.readFile(path.join(tokens, 'keep.txt'), 'utf8')
    ).resolves.toBe('user data\n')
  })

  it('keeps a stable output check read-only', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    const before = await snapshotFiles(output)
    const writeFile = vi.spyOn(fs, 'writeFile')
    const makeDirectory = vi.spyOn(fs, 'mkdir')
    const rename = vi.spyOn(fs, 'rename')
    const remove = vi.spyOn(fs, 'rm')

    await expect(inspectBuildOutput(output, files, directory)).resolves.toEqual(
      {
        status: 'current',
        paths: [],
      }
    )

    await expect(snapshotFiles(output)).resolves.toEqual(before)
    expect(writeFile).not.toHaveBeenCalled()
    expect(makeDirectory).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('verifies directory epochs with linearly growing path checks', async () => {
    const measure = async (count: number): Promise<number> => {
      const output = path.join(directory, `generated-${count}`)
      const files = buildFiles([{ path: 'token.json', contents: 'value\n' }])
      await installBuildOutput(output, files, 'brand')
      await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const group = path.join(output, `group-${index}`)
          await fs.mkdir(group)
          await fs.writeFile(
            path.join(group, 'keep.txt'),
            'user data\n',
            'utf8'
          )
        })
      )
      const lstat = fs.lstat.bind(fs)
      let outputPathChecks = 0
      vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
        if (
          String(target) === output ||
          String(target).startsWith(`${output}${path.sep}`)
        ) {
          outputPathChecks += 1
        }
        return lstat(target, options)
      })

      const state = await inspectBuildOutput(output, files, directory)
      expect(state.status).toBe('drift')
      vi.mocked(fs.lstat).mockRestore()
      return outputPathChecks
    }

    const small = await measure(16)
    const large = await measure(32)

    expect(large).toBeLessThan(small * 3)
    expect(large).toBeLessThan(32 * 30)
  })

  it('preserves a directory close failure before an epoch failure', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }])
    await installBuildOutput(output, files, 'brand')
    const closeFailure = new Error('Injected output directory close failure.')
    const openDirectory = fs.opendir.bind(fs)
    let changedDuringClose = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      const handle = await openDirectory(target, options)
      if (!changedDuringClose && String(target) === output) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await fs.rename(output, heldOutput)
          await fs.rename(heldOutput, output)
          changedDuringClose = true
          await close()
          throw closeFailure
        })
      }
      return handle
    })

    const failure = await inspectBuildOutput(output, files, directory).catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected output scanning to fail.')
    }
    expect(failure.message).toContain(
      `Could not close build output directory: ${output}`
    )
    expect(failure.message).toContain(
      `Primitree found a changed build output path while inspecting: ${output}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both directory close and epoch failures.')
    }
    expect(failure.cause.errors[0]).toBe(closeFailure)
    expect(failure.cause.errors[1]).toBeInstanceOf(Error)
    expect(changedDuringClose).toBe(true)
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

  it('keeps a changed-file error before a close failure', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    const tokenPath = path.join(output, 'tokens', 'a.json')
    const open = fs.open.bind(fs)
    const closeFailure = new Error('Injected output file close failure.')
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        await fs.appendFile(tokenPath, 'later\n', 'utf8')
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close()
          throw closeFailure
        })
      }
      return handle
    })

    const failure = await inspectBuildOutput(output, files).catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected output inspection to fail.')
    }
    expect(failure.message).toBe(
      `Primitree found changed build output while reading: ${tokenPath}\nCould not close build output file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both output read and close failures.')
    }
    expect(failure.cause.errors).toHaveLength(2)
    expect((failure.cause.errors[0] as Error).message).toBe(
      `Primitree found changed build output while reading: ${tokenPath}`
    )
    expect(failure.cause.errors[1]).toBe(closeFailure)
  })

  it('preserves an output scan and directory close failure', async () => {
    const output = path.join(directory, 'generated')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    const scanFailure = new Error('Injected output scan failure.')
    const closeFailure = new Error('Injected output directory close failure.')
    const openDirectory = fs.opendir.bind(fs)
    vi.spyOn(fs, 'opendir').mockImplementation(async target => {
      if (String(target) !== output) {
        return openDirectory(target)
      }
      const handle = await openDirectory(target)
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'read').mockRejectedValue(scanFailure)
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        await close()
        throw closeFailure
      })
      return handle
    })

    const failure = await inspectBuildOutput(output, files).catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected output scanning to fail.')
    }
    expect(failure.message).toBe(
      `Injected output scan failure.\nCould not close build output directory: ${output}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both output scan and close failures.')
    }
    expect(failure.cause.errors).toEqual([scanFailure, closeFailure])
  })

  it('preserves an output open and path-change failure', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.mkdir(outside)
    const openFailure = new Error('Injected output open failure.')
    const openDirectory = fs.opendir.bind(fs)
    vi.spyOn(fs, 'opendir').mockImplementation(async target => {
      if (String(target) === output) {
        await fs.rename(output, heldOutput)
        await fs.symlink(outside, output, 'dir')
        throw openFailure
      }
      return openDirectory(target)
    })

    const failure = await inspectBuildOutput(output, files, directory).catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected output opening to fail.')
    }
    expect(failure.message).toBe(
      `Injected output open failure.\nPrimitree found a changed build output path while inspecting: ${output}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both output open and path failures.')
    }
    expect(failure.cause.errors).toEqual([openFailure, expect.any(Error)])
  })

  it('closes an opened output directory when its post-open guard fails', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.mkdir(outside)
    const openDirectory = fs.opendir.bind(fs)
    let closeCalls = 0
    let swapped = false
    vi.spyOn(fs, 'opendir').mockImplementation(async target => {
      const handle = await openDirectory(target)
      if (!swapped && String(target) === output) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closeCalls += 1
          await close()
        })
        await fs.rename(output, heldOutput)
        await fs.symlink(outside, output, 'dir')
        swapped = true
      }
      return handle
    })

    await expect(inspectBuildOutput(output, files, directory)).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(swapped).toBe(true)
    expect(closeCalls).toBe(1)
  })

  it('closes an opened output file when its post-open guard fails', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.mkdir(outside)
    const tokenPath = path.join(output, 'tokens', 'a.json')
    const open = fs.open.bind(fs)
    let closeCalls = 0
    let swapped = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (!swapped && String(target) === tokenPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closeCalls += 1
          await close()
        })
        await fs.rename(output, heldOutput)
        await fs.symlink(outside, output, 'dir')
        swapped = true
      }
      return handle
    })

    await expect(inspectBuildOutput(output, files, directory)).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(swapped).toBe(true)
    expect(closeCalls).toBe(1)
  })

  it('preserves a post-open path failure before a file close failure', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    const files = buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }])
    await installBuildOutput(output, files, 'brand')
    await fs.mkdir(outside)
    const tokenPath = path.join(output, 'tokens', 'a.json')
    const open = fs.open.bind(fs)
    const closeFailure = new Error('Injected post-open file close failure.')
    let closeCalls = 0
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === tokenPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closeCalls += 1
          await close()
          throw closeFailure
        })
        await fs.rename(output, heldOutput)
        await fs.symlink(outside, output, 'dir')
      }
      return handle
    })

    const failure = await inspectBuildOutput(output, files, directory).catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected guarded file opening to fail.')
    }
    expect(failure.message).toBe(
      `Primitree found a changed build output path while inspecting: ${output}\nCould not close build output file: ${tokenPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both path and close failures.')
    }
    expect((failure.cause.errors[0] as Error).message).toBe(
      `Primitree found a changed build output path while inspecting: ${output}`
    )
    expect(failure.cause.errors[1]).toBe(closeFailure)
    expect(closeCalls).toBe(1)
  })

  it('stops scanning an output parent after 100,000 entries', async () => {
    const output = path.join(directory, 'generated')
    const openDirectory = fs.opendir.bind(fs)
    vi.spyOn(fs, 'opendir').mockImplementation(async target => {
      if (String(target) !== directory) {
        return openDirectory(target)
      }
      let index = 0
      return {
        async read() {
          if (index > 100_000) {
            return null
          }
          const entry = { name: `sibling-${index}` }
          index += 1
          return entry
        },
        async close() {},
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

  it('reports retained cleanup paths from an interrupted build before replacing output', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const before = await snapshotFiles(output)
    const cleanupDirectory = path.join(
      directory,
      '.generated.primitree-clean-20000000-0000-0000-0000-000000000000'
    )
    const cleanupFile = path.join(
      directory,
      '.generated.primitree-clean-10000000-0000-0000-0000-000000000000'
    )
    await fs.mkdir(cleanupDirectory)
    await fs.writeFile(
      path.join(cleanupDirectory, 'keep.txt'),
      'directory data\n',
      'utf8'
    )
    await fs.writeFile(cleanupFile, 'file data\n', 'utf8')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found one or more recovery paths from an interrupted build. Check these paths before running the build again: ${cleanupFile}, ${cleanupDirectory}`
    )

    expect(await snapshotFiles(output)).toEqual(before)
    await expect(fs.readFile(cleanupFile, 'utf8')).resolves.toBe('file data\n')
    await expect(
      fs.readFile(path.join(cleanupDirectory, 'keep.txt'), 'utf8')
    ).resolves.toBe('directory data\n')
  })

  it('does not treat cleanup paths for another output name as interrupted state', async () => {
    const output = path.join(directory, 'generated')
    const otherCleanup = path.join(
      directory,
      '.generated-extra.primitree-clean-00000000-0000-0000-0000-000000000000'
    )
    const similarCleanup = path.join(
      directory,
      '.generated.primitree-cleanup-00000000-0000-0000-0000-000000000000'
    )
    await fs.mkdir(otherCleanup)
    await fs.writeFile(similarCleanup, 'keep me\n', 'utf8')

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).resolves.toBe('written')

    await expect(fs.lstat(otherCleanup)).resolves.toBeDefined()
    await expect(fs.readFile(similarCleanup, 'utf8')).resolves.toBe('keep me\n')
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
    let lockCleanup: string | undefined
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
      if (String(target).includes('.generated.primitree-clean-')) {
        lockCleanup = String(target)
        cleanupCalls.push('remove')
        throw new Error('Injected lock removal failure.')
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
      throw new Error('Expected operation and lock cleanup to fail.')
    }
    expect(failure.message).toContain(
      `Primitree found one or more backups from an interrupted build. Check these paths before running the build again: ${backup}`
    )
    expect(lockCleanup).toBeDefined()
    expect(failure.message).toContain(
      `Primitree could not release the output lock: ${lockCleanup}`
    )

    expect(cleanupCalls).toEqual(['close', 'remove'])
    if (lockCleanup === undefined) {
      throw new Error('Expected Primitree to retain the lock cleanup path.')
    }
    await expect(fs.lstat(lockCleanup)).resolves.toBeDefined()
  })

  it('reports a lock cleanup error after a successful build', async () => {
    const output = path.join(directory, 'generated')
    const remove = fs.rm.bind(fs)
    let lockCleanup: string | undefined
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (String(target).includes('.generated.primitree-clean-')) {
        lockCleanup = String(target)
        throw new Error('Injected lock removal failure.')
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
      throw new Error('Expected output-lock cleanup to fail.')
    }
    expect(lockCleanup).toBeDefined()
    expect(failure.message).toBe(
      `Primitree could not release the output lock: ${lockCleanup}`
    )

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('value\n')
    if (lockCleanup === undefined) {
      throw new Error('Expected Primitree to retain the lock cleanup path.')
    }
    await expect(fs.lstat(lockCleanup)).resolves.toBeDefined()
  })

  it('does not remove a substituted output-lock path', async () => {
    const output = path.join(directory, 'generated')
    const lock = path.join(directory, '.generated.primitree-lock')
    let cleanup: string | undefined
    let heldLock: string | undefined
    const outsideLock = path.join(directory, 'outside-lock')
    await fs.writeFile(outsideLock, 'user data\n', 'utf8')
    const rename = fs.rename.bind(fs)
    let substituted = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (!substituted && String(from) === lock) {
        cleanup = String(to)
        heldLock = `${String(to)}-held`
        await rename(to, heldLock)
        await rename(outsideLock, to)
        substituted = true
      }
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow('Primitree could not release the output lock:')

    expect(substituted).toBe(true)
    expect(cleanup).toBeDefined()
    expect(heldLock).toBeDefined()
    if (cleanup === undefined || heldLock === undefined) {
      throw new Error('Expected a substituted lock cleanup path.')
    }
    await expect(fs.readFile(cleanup, 'utf8')).resolves.toBe('user data\n')
    await expect(fs.lstat(heldLock)).resolves.toBeDefined()
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

  it('rejects invalid UTF-8 in an installed manifest before ownership checks', async () => {
    const output = path.join(directory, 'generated')
    const tokenPath = path.join(output, 'tokens', 'a.json')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
    const manifest = await fs.readFile(manifestPath)
    const sourceNameOffset = manifest.indexOf('brand')
    if (sourceNameOffset === -1) {
      throw new Error('Expected the installed manifest source name.')
    }
    manifest[sourceNameOffset] = 0xff
    await fs.writeFile(manifestPath, manifest)

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }], '�rand'),
        '�rand'
      )
    ).rejects.toThrow(
      `Build output manifest is not valid UTF-8: ${manifestPath}`
    )

    await expect(fs.readFile(tokenPath, 'utf8')).resolves.toBe('old\n')
  })

  it('keeps a changed-manifest error before a close failure', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
    const open = fs.open.bind(fs)
    const closeFailure = new Error('Injected manifest close failure.')
    let manifestOpens = 0
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === manifestPath) {
        manifestOpens += 1
        if (manifestOpens === 2) {
          await fs.appendFile(manifestPath, 'later\n', 'utf8')
          const close = handle.close.bind(handle)
          vi.spyOn(handle, 'close').mockImplementation(async () => {
            await close()
            throw closeFailure
          })
        }
      }
      return handle
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected manifest reading to fail.')
    }
    expect(failure.message).toBe(
      `Primitree found a changed build output manifest while reading it.\nCould not close build output file: ${manifestPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both manifest read and close failures.')
    }
    expect((failure.cause.errors[0] as Error).message).toBe(
      'Primitree found a changed build output manifest while reading it.'
    )
    expect(failure.cause.errors[1]).toBe(closeFailure)
  })

  it('keeps an invalid-manifest error before a close failure', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
    await fs.writeFile(manifestPath, '{}\n', 'utf8')
    const open = fs.open.bind(fs)
    const closeFailure = new Error('Injected invalid manifest close failure.')
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === manifestPath) {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          await close()
          throw closeFailure
        })
      }
      return handle
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected invalid manifest reading to fail.')
    }
    expect(failure.message).toBe(
      `Build output manifest must set "schemaVersion" to 1 and include a source ID, source SHA-256 hash, format list, and file list.\nCould not close build output file: ${manifestPath}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both manifest parse and close failures.')
    }
    expect((failure.cause.errors[0] as Error).message).toBe(
      'Build output manifest must set "schemaVersion" to 1 and include a source ID, source SHA-256 hash, format list, and file list.'
    )
    expect(failure.cause.errors[1]).toBe(closeFailure)
  })

  it('rejects a same-inode manifest rewrite while reading', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const manifestPath = path.join(output, BUILD_MANIFEST_PATH)
    const original = await fs.readFile(manifestPath)
    const replacement = Buffer.from(original)
    const hashLabel = Buffer.from('"sha256": "')
    const hashLabelOffset = replacement.indexOf(hashLabel)
    if (hashLabelOffset === -1) {
      throw new Error('Expected a manifest source hash.')
    }
    const hashOffset = hashLabelOffset + hashLabel.length
    replacement[hashOffset] = replacement[hashOffset] === 0x61 ? 0x62 : 0x61
    const open = fs.open.bind(fs)
    let rewritten = false
    let manifestOpens = 0
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      const handle = await open(target, flags, mode)
      if (String(target) === manifestPath) {
        manifestOpens += 1
        type PositionalRead = (
          buffer: NodeJS.ArrayBufferView,
          offset: number,
          length: number,
          position: number | null
        ) => Promise<{ bytesRead: number; buffer: NodeJS.ArrayBufferView }>
        const read = handle.read.bind(handle) as PositionalRead
        vi.spyOn(handle, 'read').mockImplementation((async (
          buffer: NodeJS.ArrayBufferView,
          offset: number,
          length: number,
          position: number | null
        ) => {
          const result = await read(buffer, offset, length, position)
          if (!rewritten && manifestOpens === 2 && result.bytesRead > 0) {
            await fs.writeFile(manifestPath, replacement)
            rewritten = true
          }
          return result
        }) as typeof handle.read)
      }
      return handle
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      'Primitree found a changed build output manifest while reading it.'
    )

    expect(rewritten).toBe(true)
  })

  it('rejects an output ancestor changed while the lock is opened', async () => {
    const project = path.join(directory, 'project')
    const ancestor = path.join(project, 'build')
    const heldAncestor = path.join(project, 'held-build')
    const output = path.join(ancestor, 'generated')
    const outside = path.join(directory, 'outside')
    await fs.mkdir(ancestor, { recursive: true })
    await fs.mkdir(outside)
    const lock = path.join(ancestor, '.generated.primitree-lock')
    const open = fs.open.bind(fs)
    let swapped = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (!swapped && String(target) === lock) {
        await fs.rename(ancestor, heldAncestor)
        await fs.symlink(outside, ancestor, 'dir')
        swapped = true
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand',
        project
      )
    ).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${ancestor}`
    )

    expect(swapped).toBe(true)
    expect(await fs.readdir(outside)).toEqual(['.generated.primitree-lock'])
    expect(await fs.readdir(heldAncestor)).toEqual([])
  })

  it('binds a swapped output-lock handle before any build mutation', async () => {
    const project = path.join(directory, 'project')
    const parent = path.join(project, 'build')
    const heldParent = path.join(project, 'held-build')
    const outsideParent = path.join(directory, 'outside-build')
    const output = path.join(parent, 'generated')
    const lock = path.join(parent, '.generated.primitree-lock')
    const outsideLock = path.join(outsideParent, '.generated.primitree-lock')
    await fs.mkdir(parent, { recursive: true })
    await fs.mkdir(outsideParent)
    const open = fs.open.bind(fs)
    const closeFailure = new Error('Injected swapped lock close failure.')
    let closeCalls = 0
    let swapped = false
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (!swapped && String(target) === lock) {
        await fs.rename(parent, heldParent)
        await fs.rename(outsideParent, parent)
        const handle = await open(target, flags, mode)
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closeCalls += 1
          await close()
          throw closeFailure
        })
        await fs.rename(parent, outsideParent)
        await fs.rename(heldParent, parent)
        await fs.writeFile(lock, 'substitute\n', 'utf8')
        swapped = true
        return handle
      }
      return open(target, flags, mode)
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
      'brand',
      project
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected output-lock binding to fail.')
    }
    expect(failure.message).toBe(
      `Primitree could not bind the output lock to its path: ${lock}\nLock binding error: The opened lock does not match the lock path.\nCould not close output lock: ${lock}`
    )
    expect(failure.cause).toBeInstanceOf(AggregateError)
    if (!(failure.cause instanceof AggregateError)) {
      throw new Error('Expected both output-lock binding and close failures.')
    }
    expect((failure.cause.errors[0] as Error).message).toBe(
      `Primitree could not bind the output lock to its path: ${lock}\nLock binding error: The opened lock does not match the lock path.`
    )
    expect(failure.cause.errors[1]).toBe(closeFailure)
    expect(swapped).toBe(true)
    expect(closeCalls).toBe(1)
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readFile(lock, 'utf8')).resolves.toBe('substitute\n')
    await expect(fs.lstat(outsideLock)).resolves.toMatchObject({ size: 0 })
    expect(await fs.readdir(parent)).toEqual(['.generated.primitree-lock'])
  })

  it('stops when a parent swap hides an interrupted backup during open', async () => {
    const project = path.join(directory, 'project')
    const parent = path.join(project, 'build')
    const heldParent = path.join(project, 'held-build')
    const outsideParent = path.join(directory, 'outside-build')
    const output = path.join(parent, 'generated')
    await fs.mkdir(parent, { recursive: true })
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand',
      project
    )
    const before = await snapshotFiles(output)
    const backup = path.join(parent, '.generated.primitree-backup-interrupted')
    await fs.mkdir(backup)
    await fs.writeFile(path.join(backup, 'keep.txt'), 'keep me\n', 'utf8')
    await fs.mkdir(outsideParent)
    const openDirectory = fs.opendir.bind(fs)
    let swapped = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      if (!swapped && String(target) === parent) {
        await fs.rename(parent, heldParent)
        await fs.rename(outsideParent, parent)
        const handle = await openDirectory(parent, options)
        await fs.rename(parent, outsideParent)
        await fs.rename(heldParent, parent)
        swapped = true
        return handle
      }
      return openDirectory(target, options)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand',
        project
      )
    ).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${parent}`
    )

    expect(swapped).toBe(true)
    expect(await snapshotFiles(output)).toEqual(before)
    await expect(
      fs.readFile(path.join(backup, 'keep.txt'), 'utf8')
    ).resolves.toBe('keep me\n')
    await expect(fs.readdir(outsideParent)).resolves.toEqual([])
  })

  it('rejects an output directory changed while empty-output verification opens it', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    await fs.mkdir(outside)
    const openDirectory = fs.opendir.bind(fs)
    let outputOpens = 0
    let swapped = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      if (String(target) === output) {
        outputOpens += 1
        if (outputOpens === 2) {
          await fs.rename(output, heldOutput)
          await fs.symlink(outside, output, 'dir')
          swapped = true
        }
      }
      return openDirectory(target, options)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(swapped).toBe(true)
    expect(await fs.readdir(outside)).toEqual([])
    await expect(
      fs.readFile(path.join(heldOutput, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })

  it('rejects an output directory changed while ownership verification reads it', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    await fs.cp(output, outside, { recursive: true })
    const openDirectory = fs.opendir.bind(fs)
    const open = fs.open.bind(fs)
    let outputOpens = 0
    let swapped = false
    let outsideFileOpened = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      const handle = await openDirectory(target, options)
      if (String(target) === output) {
        outputOpens += 1
        if (outputOpens === 3) {
          const read = handle.read.bind(handle)
          vi.spyOn(handle, 'read').mockImplementation(async () => {
            if (!swapped) {
              await fs.rename(output, heldOutput)
              await fs.symlink(outside, output, 'dir')
              swapped = true
            }
            return read()
          })
        }
      }
      return handle
    })
    vi.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
      if (swapped && String(target).startsWith(`${output}${path.sep}`)) {
        outsideFileOpened = true
      }
      return open(target, flags, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(swapped).toBe(true)
    expect(outsideFileOpened).toBe(false)
    await expect(
      fs.readFile(path.join(heldOutput, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })

  it('does not restore a backup path changed during verification', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    const openDirectory = fs.opendir.bind(fs)
    let backup: string | undefined
    let heldBackup: string | undefined
    let swapped = false
    vi.spyOn(fs, 'opendir').mockImplementation(async (target, options) => {
      const targetPath = String(target)
      const handle = await openDirectory(target, options)
      if (!swapped && targetPath.includes('.generated.primitree-backup-')) {
        backup = targetPath
        heldBackup = `${targetPath}-held`
        await fs.rename(targetPath, heldBackup)
        await fs.symlink(outside, targetPath, 'dir')
        swapped = true
      }
      return handle
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(swapped).toBe(true)
    expect(backup).toBeDefined()
    expect(heldBackup).toBeDefined()
    if (backup === undefined || heldBackup === undefined) {
      throw new Error('Expected a moved and substituted backup path.')
    }
    expect((await fs.lstat(backup)).isSymbolicLink()).toBe(true)
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.readFile(path.join(heldBackup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('does not accept a substituted tree after restoring a backup', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    const rename = fs.rename.bind(fs)
    let backup: string | undefined
    let heldBackup: string | undefined
    let substituted = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      const fromPath = String(from)
      if (
        backup === undefined &&
        from === output &&
        String(to).includes('.generated.primitree-backup-')
      ) {
        backup = String(to)
      }
      await rename(from, to)
      if (backup !== undefined && fromPath === backup && to === output) {
        heldBackup = `${output}-held-restored`
        await fs.rename(output, heldBackup)
        await fs.rename(outside, output)
        substituted = true
      }
    })
    const chmod = fs.chmod.bind(fs)
    vi.spyOn(fs, 'chmod').mockImplementation(async (target, mode) => {
      if (String(target).includes('.generated.primitree-stage-')) {
        throw new Error('Injected prepared-output permission failure.')
      }
      return chmod(target, mode)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
        'brand'
      )
    ).rejects.toThrow('Primitree found a changed build output path')

    expect(substituted).toBe(true)
    expect(heldBackup).toBeDefined()
    if (heldBackup === undefined) {
      throw new Error('Expected the restored backup to remain recoverable.')
    }
    await expect(
      fs.readFile(path.join(heldBackup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
    expect(await fs.readdir(output)).toEqual([])
  })

  it('does not report written after the installed output is replaced', async () => {
    const output = path.join(directory, 'generated')
    const heldOutput = path.join(directory, 'held-generated')
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    const rename = fs.rename.bind(fs)
    let replaced = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (!replaced && String(from).includes('.generated.primitree-stage-')) {
        await fs.rename(output, heldOutput)
        await fs.symlink(outside, output, 'dir')
        replaced = true
      }
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow(
      `Primitree found a changed build output path while inspecting: ${output}`
    )

    expect(replaced).toBe(true)
    expect((await fs.lstat(output)).isSymbolicLink()).toBe(true)
    await expect(
      fs.readFile(path.join(heldOutput, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('value\n')
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('does not install stage contents changed during rename', async () => {
    const output = path.join(directory, 'generated')
    const rename = fs.rename.bind(fs)
    let changed = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (!changed && String(from).includes('.generated.primitree-stage-')) {
        await fs.writeFile(
          path.join(String(from), 'tokens', 'a.json'),
          'changed during rename\n',
          'utf8'
        )
        changed = true
      }
      await rename(from, to)
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow('Prepared build output does not match its manifest.')

    expect(changed).toBe(true)
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
    let cleanup: string | undefined
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
      if (
        String(target).includes('.generated.primitree-clean-') &&
        (await fs.lstat(target)).isDirectory()
      ) {
        cleanup = String(target)
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
    expect(cleanup).toBeDefined()
    expect(failure.message).toContain(
      `Primitree could not remove prepared build output: ${cleanup}`
    )
    if (stage === undefined || cleanup === undefined) {
      throw new Error('Expected the build to keep one prepared directory.')
    }
    await expect(fs.lstat(cleanup)).resolves.toBeDefined()
  })

  it('does not recursively remove a substituted stage cleanup path', async () => {
    const output = path.join(directory, 'generated')
    const outside = path.join(directory, 'outside-stage')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep.txt'), 'user data\n', 'utf8')
    const chmod = fs.chmod.bind(fs)
    vi.spyOn(fs, 'chmod').mockImplementation(async (target, mode) => {
      if (String(target).includes('.generated.primitree-stage-')) {
        throw new Error('Injected prepared-output failure.')
      }
      return chmod(target, mode)
    })
    const rename = fs.rename.bind(fs)
    let stage: string | undefined
    let cleanup: string | undefined
    let heldStage: string | undefined
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (stage === undefined && String(from).includes('.primitree-stage-')) {
        stage = String(from)
        cleanup = String(to)
        heldStage = `${String(to)}-held`
        await rename(to, heldStage)
        await rename(outside, to)
      }
    })

    await expect(
      installBuildOutput(
        output,
        buildFiles([{ path: 'tokens/a.json', contents: 'value\n' }]),
        'brand'
      )
    ).rejects.toThrow('Primitree could not remove prepared build output:')

    expect(stage).toBeDefined()
    expect(cleanup).toBeDefined()
    expect(heldStage).toBeDefined()
    if (
      stage === undefined ||
      cleanup === undefined ||
      heldStage === undefined
    ) {
      throw new Error('Expected a substituted stage cleanup path.')
    }
    await expect(
      fs.readFile(path.join(cleanup, 'keep.txt'), 'utf8')
    ).resolves.toBe('user data\n')
    await expect(fs.lstat(heldStage)).resolves.toBeDefined()
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

  it('retains an unverified prior tree when reading its moved permissions fails', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const lstat = fs.lstat.bind(fs)
    vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
      if (String(target).includes('.generated.primitree-backup-')) {
        throw new Error('Injected permission read failure.')
      }
      return lstat(target, options)
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected prior-output verification to fail.')
    }
    expect(failure.message).toContain('Injected permission read failure.')
    expect(failure.message).toContain(
      'Primitree could not restore the prior build output.'
    )
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    const backups = (await fs.readdir(directory)).filter(entry =>
      entry.startsWith('.generated.primitree-backup-')
    )
    expect(backups).toHaveLength(1)
    const backup = backups[0]
    if (backup === undefined) {
      throw new Error('Expected Primitree to retain the prior output.')
    }
    expect(failure.message).toContain(path.join(directory, backup))
    await expect(
      fs.readFile(path.join(directory, backup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })

  it('reports the retained backup when old-tree cleanup fails', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const remove = fs.rm.bind(fs)
    let cleanup: string | undefined
    vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
      if (
        String(target).includes('.generated.primitree-clean-') &&
        (await fs.lstat(target)).isDirectory()
      ) {
        cleanup = String(target)
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
      'Primitree installed the build output and retained the prior output because cleanup could not verify its path:'
    )

    await expect(
      fs.readFile(path.join(output, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('new\n')
    expect(cleanup).toBeDefined()
    if (cleanup === undefined) {
      throw new Error('Expected Primitree to keep one prior output directory.')
    }
    await expect(
      fs.readFile(path.join(cleanup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })

  it('does not recursively remove a substituted backup path', async () => {
    const output = path.join(directory, 'generated')
    await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'old\n' }]),
      'brand'
    )
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep.txt'), 'user data\n', 'utf8')
    const rename = fs.rename.bind(fs)
    let backup: string | undefined
    let heldBackup: string | undefined
    let substituted = false
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (
        !substituted &&
        String(from).includes('.generated.primitree-backup-') &&
        String(to).includes('.generated.primitree-clean-')
      ) {
        backup = String(to)
        heldBackup = `${String(to)}-held`
        await rename(to, heldBackup)
        await rename(outside, to)
        substituted = true
      }
    })

    const failure = await installBuildOutput(
      output,
      buildFiles([{ path: 'tokens/a.json', contents: 'new\n' }]),
      'brand'
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) {
      throw new Error('Expected backup cleanup to fail.')
    }
    expect(failure.message).toContain(
      'Primitree installed the build output and retained the prior output because cleanup could not verify its path:'
    )

    expect(substituted).toBe(true)
    expect(backup).toBeDefined()
    expect(heldBackup).toBeDefined()
    if (backup === undefined || heldBackup === undefined) {
      throw new Error('Expected a substituted backup cleanup path.')
    }
    await expect(
      fs.readFile(path.join(backup, 'keep.txt'), 'utf8')
    ).resolves.toBe('user data\n')
    await expect(
      fs.readFile(path.join(heldBackup, 'tokens', 'a.json'), 'utf8')
    ).resolves.toBe('old\n')
  })
})
