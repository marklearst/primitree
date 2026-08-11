import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../src/args'
import { runBuild } from '../src/commands/build'
import * as io from '../src/io'

const legacyFixturePath = path.join(
  import.meta.dirname,
  'fixtures/local-variables.json'
)

let directory: string

function projectSource(
  outputDirectory: string,
  formats: readonly string[]
): Record<string, unknown> {
  return {
    type: 'dtcg',
    file: './tokens.json',
    architecture: {
      layers: [
        { id: 'primitive', roots: ['size'], values: 'literal' },
        {
          id: 'semantic',
          roots: ['semantic'],
          values: 'reference',
          references: ['primitive'],
        },
      ],
    },
    ownership: { default: ['design-systems'] },
    outputs: {
      directory: outputDirectory,
      formats,
    },
  }
}

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-build-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await fs.rm(directory, { recursive: true, force: true })
})

async function writeProject(
  semanticValue: unknown = '{size.base}',
  formats: readonly string[] = ['dtcg', 'css', 'typescript', 'tailwind'],
  sourceName = 'brand',
  outputDirectory = './generated'
): Promise<string> {
  const configPath = path.join(directory, 'primitree.config.ts')
  await fs.writeFile(
    configPath,
    `export default ${JSON.stringify(
      {
        schemaVersion: 1,
        sources: {
          [sourceName]: projectSource(outputDirectory, formats),
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  await fs.writeFile(
    path.join(directory, 'tokens.json'),
    `${JSON.stringify(
      {
        size: {
          base: {
            $type: 'dimension',
            $value: { value: 8, unit: 'px' },
          },
        },
        semantic: {
          space: { $type: 'dimension', $value: semanticValue },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  return configPath
}

async function listFiles(root: string, relative = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  })
  const files: string[] = []
  for (const entry of entries) {
    const entryPath = path.posix.join(relative, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, entryPath)))
    } else {
      files.push(entryPath)
    }
  }
  return files.sort()
}

async function snapshotFiles(root: string): Promise<unknown> {
  return Promise.all(
    (await listFiles(root)).map(async file => {
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

describe('primitree build with a project config', () => {
  it.each([
    [['--config', 'one.ts', '--config=two.ts'], 'Duplicate option: --config'],
    [['--unknown'], 'Unknown option: --unknown'],
    [['--out', 'generated'], 'Unknown option: --out'],
    [['--config'], '--config needs a file path.'],
    [['--source'], '--source needs a source name.'],
    [['--check=yes'], '--check does not take a value.'],
  ])('rejects invalid configured arguments %#', async (argv, message) => {
    await expect(runBuild(parseArgs(argv))).rejects.toThrow(message)
  })

  it('rejects a positional input in check mode without writing', async () => {
    const output = path.join(directory, 'generated')

    await expect(
      runBuild(parseArgs([legacyFixturePath, '--check', '--out', output]))
    ).rejects.toThrow('Configured build does not accept a path argument.')

    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('loads the default config from the working directory', async () => {
    await writeProject()
    vi.spyOn(process, 'cwd').mockReturnValue(directory)

    await runBuild(parseArgs([]))

    await expect(
      fs.lstat(path.join(directory, 'generated', '.primitree-manifest.json'))
    ).resolves.toBeDefined()
  })

  it('requires and accepts a source name when the config has several sources', async () => {
    const configPath = await writeProject()
    await fs.writeFile(
      configPath,
      `export default ${JSON.stringify(
        {
          schemaVersion: 1,
          sources: {
            brand: projectSource('./brand-output', ['dtcg']),
            product: projectSource('./product-output', ['dtcg']),
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Use --source when the config has several sources.'
    )

    await runBuild(parseArgs(['--config', configPath, '--source', 'product']))
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(directory, 'product-output', '.primitree-manifest.json'),
        'utf8'
      )
    )
    expect(manifest.source.id).toBe('product')
    await expect(
      fs.lstat(path.join(directory, 'brand-output'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('requires output settings for the selected source', async () => {
    const configPath = await writeProject()
    const source = projectSource('./generated', ['dtcg'])
    delete source.outputs
    await fs.writeFile(
      configPath,
      `export default ${JSON.stringify(
        { schemaVersion: 1, sources: { brand: source } },
        null,
        2
      )}\n`,
      'utf8'
    )

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Source "brand" needs output settings before it can build.'
    )
  })

  it('writes only the selected first-party files and its manifest', async () => {
    const configPath = await writeProject()

    await runBuild(parseArgs(['--config', configPath]))

    expect(await listFiles(path.join(directory, 'generated'))).toEqual([
      '.primitree-manifest.json',
      'css/tokens.css',
      'css/tokens.tailwind.css',
      'tokens/source.tokens.json',
      'tokens/tokens.resolver.json',
      'ts/tokens.ts',
    ])
  })

  it('does not run an emitter that the source did not select', async () => {
    const configPath = await writeProject('{size.base}', ['dtcg'])
    await fs.writeFile(
      path.join(directory, 'tokens.json'),
      `${JSON.stringify(
        {
          size: {
            family: { $type: 'fontFamily', $value: [] },
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    await runBuild(parseArgs(['--config', configPath]))

    expect(await listFiles(path.join(directory, 'generated'))).toEqual([
      '.primitree-manifest.json',
      'tokens/source.tokens.json',
      'tokens/tokens.resolver.json',
    ])
  })

  it('writes a selected format without DTCG files', async () => {
    const configPath = await writeProject('{size.base}', ['css'])

    await runBuild(parseArgs(['--config', configPath]))

    const output = path.join(directory, 'generated')
    expect(await listFiles(output)).toEqual([
      '.primitree-manifest.json',
      'css/tokens.css',
    ])
    const manifest = JSON.parse(
      await fs.readFile(path.join(output, '.primitree-manifest.json'), 'utf8')
    )
    expect(manifest.formats).toEqual(['css'])
  })

  it('leaves the output absent when a layer rule finds a problem', async () => {
    const configPath = await writeProject({ value: 12, unit: 'px' })

    await runBuild(parseArgs(['--config', configPath]))

    expect(process.exitCode).toBe(1)
    await expect(
      fs.stat(path.join(directory, 'generated'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports missing output in check mode without creating it', async () => {
    const configPath = await writeProject()

    await runBuild(parseArgs(['--config', configPath, '--check']))

    expect(process.exitCode).toBe(1)
    await expect(
      fs.stat(path.join(directory, 'generated'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(directory)).sort()).toEqual([
      'primitree.config.ts',
      'tokens.json',
    ])
  })

  it('reports current output without changing its files', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    const before = await snapshotFiles(output)
    vi.mocked(console.log).mockClear()
    process.exitCode = undefined

    await runBuild(parseArgs(['--config', configPath, '--check']))

    expect(process.exitCode).toBeUndefined()
    expect(await snapshotFiles(output)).toEqual(before)
    expect(console.log).toHaveBeenCalledWith(
      'Build output is current for source "brand".'
    )
  })

  it('reports a changed file without repairing it in check mode', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const cssPath = path.join(directory, 'generated', 'css', 'tokens.css')
    await fs.writeFile(cssPath, 'project edit\n', 'utf8')
    vi.mocked(console.log).mockClear()
    process.exitCode = undefined

    await runBuild(parseArgs(['--config', configPath, '--check']))

    expect(process.exitCode).toBe(1)
    await expect(fs.readFile(cssPath, 'utf8')).resolves.toBe('project edit\n')
    expect(console.log).toHaveBeenCalledWith('changed css/tokens.css')
  })

  it('reports an unexpected file without deleting it in check mode', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const notePath = path.join(directory, 'generated', 'notes.txt')
    await fs.writeFile(notePath, 'keep me\n', 'utf8')
    vi.mocked(console.log).mockClear()
    process.exitCode = undefined

    await runBuild(parseArgs(['--config', configPath, '--check']))

    expect(process.exitCode).toBe(1)
    await expect(fs.readFile(notePath, 'utf8')).resolves.toBe('keep me\n')
    expect(console.log).toHaveBeenCalledWith('unexpected notes.txt')
  })

  it('does not rewrite an output tree that already matches', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const manifestPath = path.join(
      directory,
      'generated',
      '.primitree-manifest.json'
    )
    const fixedTime = new Date('2000-01-01T00:00:00.000Z')
    await fs.utimes(manifestPath, fixedTime, fixedTime)

    await runBuild(parseArgs(['--config', configPath]))

    expect((await fs.stat(manifestPath)).mtimeMs).toBe(fixedTime.getTime())
  })

  it('refuses to replace a generated file that was edited', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    const cssPath = path.join(output, 'css', 'tokens.css')
    await fs.writeFile(cssPath, 'project edit\n', 'utf8')
    const before = await snapshotFiles(output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Refusing to replace changed build output: css/tokens.css'
    )

    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('refuses to replace an output tree with an unexpected file', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    await fs.writeFile(path.join(output, 'notes.txt'), 'keep me\n', 'utf8')
    const before = await snapshotFiles(output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Refusing to replace unexpected build output: notes.txt'
    )

    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('refuses to replace an output tree with an unexpected empty directory', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    const notes = path.join(output, 'notes')
    await fs.mkdir(notes)
    const before = await snapshotFiles(output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Refusing to replace unexpected build output: notes/'
    )

    expect((await fs.stat(notes)).isDirectory()).toBe(true)
    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('refuses to replace an output tree with a missing owned file', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    await fs.rm(path.join(output, 'css', 'tokens.css'))
    const before = await snapshotFiles(output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Refusing to replace missing build output: css/tokens.css'
    )

    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('refuses to replace an output tree with an invalid manifest', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    await fs.writeFile(
      path.join(output, '.primitree-manifest.json'),
      '{}\n',
      'utf8'
    )
    const before = await snapshotFiles(output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Build output manifest must set "schemaVersion" to 1 and include a source ID, source SHA-256 hash, format list, and file list.'
    )

    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('refuses to replace an output tree with a nested symbolic link', async () => {
    const configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    const target = path.join(directory, 'keep.txt')
    const link = path.join(output, 'keep.txt')
    await fs.writeFile(target, 'keep me\n', 'utf8')
    await fs.symlink(target, link)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Build output cannot contain a symbolic link: keep.txt'
    )

    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('keep me\n')
  })

  it('refuses a symbolic link as the output directory', async () => {
    const configPath = await writeProject()
    const target = path.join(directory, 'target')
    const output = path.join(directory, 'generated')
    await fs.mkdir(target)
    await fs.symlink(target, output)

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Source "brand" output directory cannot use a symbolic link.'
    )

    expect((await fs.lstat(output)).isSymbolicLink()).toBe(true)
    expect(await fs.readdir(target)).toEqual([])
  })

  it('rejects an output ancestor changed to a symbolic link after config loading', async () => {
    const configPath = await writeProject(
      '{size.base}',
      ['dtcg'],
      'brand',
      './generated/nested'
    )
    const sourceFile = path.join(directory, 'tokens.json')
    const ancestor = path.join(directory, 'generated')
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    const readJsonFile = io.readJsonFile
    let linkCreated = false
    vi.spyOn(io, 'readJsonFile').mockImplementation(async file => {
      const document = await readJsonFile(file)
      if (!linkCreated && file === sourceFile) {
        await fs.symlink(outside, ancestor, 'dir')
        linkCreated = true
      }
      return document
    })

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      `Build output path cannot use a symbolic link: ${ancestor}`
    )

    expect(linkCreated).toBe(true)
    expect((await fs.lstat(ancestor)).isSymbolicLink()).toBe(true)
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('refuses to replace output owned by another configured source', async () => {
    let configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))
    const output = path.join(directory, 'generated')
    const before = await snapshotFiles(output)
    configPath = await writeProject(
      '{size.base}',
      ['dtcg', 'css', 'typescript', 'tailwind'],
      'product'
    )

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Existing build output belongs to source "brand", not "product".'
    )

    expect(await snapshotFiles(output)).toEqual(before)
  })

  it('removes prior generated files when the selected formats shrink', async () => {
    let configPath = await writeProject()
    await runBuild(parseArgs(['--config', configPath]))

    configPath = await writeProject('{size.base}', ['dtcg', 'css'])
    await runBuild(parseArgs(['--config', configPath]))

    expect(await listFiles(path.join(directory, 'generated'))).toEqual([
      '.primitree-manifest.json',
      'css/tokens.css',
      'tokens/source.tokens.json',
      'tokens/tokens.resolver.json',
    ])
  })

  it('uses an existing empty output directory for a first build', async () => {
    const configPath = await writeProject()
    const output = path.join(directory, 'generated')
    await fs.mkdir(output)

    await runBuild(parseArgs(['--config', configPath]))

    expect(await listFiles(output)).toContain('.primitree-manifest.json')
  })

  it('refuses an unowned nonempty output directory', async () => {
    const configPath = await writeProject()
    const output = path.join(directory, 'generated')
    const note = path.join(output, 'keep.txt')
    await fs.mkdir(output)
    await fs.writeFile(note, 'keep me\n', 'utf8')

    await expect(runBuild(parseArgs(['--config', configPath]))).rejects.toThrow(
      'Existing build output needs a Primitree manifest file and cannot use a symbolic link in its place.'
    )

    await expect(fs.readFile(note, 'utf8')).resolves.toBe('keep me\n')
    expect(await fs.readdir(directory)).not.toContain(
      '.generated.primitree-lock'
    )
  })
})
