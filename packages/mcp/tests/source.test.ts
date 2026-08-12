import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { toDTCG } from '@primitree/dtcg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadTokenSource } from '../src/source'
import { getToken } from '../src/tools'

const fixturePath = path.join(__dirname, 'fixtures/local-variables.json')
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
const built = toDTCG(fixture)

describe('loadTokenSource', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'primitree-mcp-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('loads a variables.json file', async () => {
    const loaded = await loadTokenSource(fixturePath)
    expect(Object.keys(loaded.files)).toContain('semantic.tokens.json')
    expect(loaded.variablesJson).toBeDefined()
  })
  it('loads a built tokens directory', async () => {
    const dir = path.join(tmpDir, 'tokens')
    await fs.mkdir(dir, { recursive: true })
    for (const [name, doc] of Object.entries(built.files)) {
      await fs.writeFile(path.join(dir, name), JSON.stringify(doc))
    }
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify(built.resolver)
    )

    const direct = await loadTokenSource(dir)
    expect(Object.keys(direct.files).length).toBe(5)

    // Parent directory with tokens/ subdirectory also works.
    const viaParent = await loadTokenSource(tmpDir)
    expect(Object.keys(viaParent.files).length).toBe(5)
  })
  it('loads nested token files by their portable relative paths', async () => {
    const dir = path.join(tmpDir, 'nested-build', 'tokens')
    await fs.mkdir(path.join(dir, 'themes'), { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({
        version: '2025.10',
        sets: {
          dark: { sources: [{ $ref: 'themes/dark.tokens.json' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/dark' }],
      })
    )
    await fs.writeFile(
      path.join(dir, 'themes/dark.tokens.json'),
      JSON.stringify({ theme: { $type: 'string', $value: 'dark' } })
    )

    const loaded = await loadTokenSource(path.dirname(dir))

    expect(Object.keys(loaded.files)).toEqual(['themes/dark.tokens.json'])
    expect(getToken(loaded, 'theme')).toMatchObject({
      found: true,
      value: 'dark',
    })
  })

  it.skipIf(process.platform === 'win32')(
    'rejects a token file path containing a backslash',
    async () => {
      const dir = path.join(tmpDir, 'backslash-path-build')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'tokens.resolver.json'),
        JSON.stringify({ version: '2025.10' })
      )
      const fileName = 'themes\\dark.tokens.json'
      await fs.writeFile(path.join(dir, fileName), '{}')

      await expect(loadTokenSource(dir)).rejects.toThrow(
        `Unsafe DTCG token file path: "${fileName}".`
      )
    }
  )

  async function rejectUnsafePortableTokenPath(
    filePath: string
  ): Promise<void> {
    const dir = path.join(tmpDir, `unsafe-path-${filePath.length}`)
    await fs.mkdir(path.dirname(path.join(dir, filePath)), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(dir, filePath), '{}')

    await expect(loadTokenSource(dir)).rejects.toThrow(
      `Unsafe DTCG token file path: "${filePath}".`
    )
  }

  const unsafePortableTokenPaths = [
    'CON.tokens.json',
    'name?.tokens.json',
    'themes./dark.tokens.json',
  ]
  it.skipIf(process.platform === 'win32').each(unsafePortableTokenPaths)(
    'rejects the unsafe portable token path %s',
    rejectUnsafePortableTokenPath
  )

  async function rejectPortablePathCollision(
    label: string,
    first: string,
    second: string,
    expectedFirst: string,
    expectedSecond: string
  ): Promise<void> {
    const dir = path.join(tmpDir, `colliding-path-${label}`)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(dir, first), '{}')
    const firstStats = await fs.lstat(path.join(dir, first))
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const openDirectory = fs.opendir.bind(fs)
    const lstat = fs.lstat.bind(fs)
    const readDirectory = vi
      .spyOn(fs, 'opendir')
      .mockImplementation(async (target, options) => {
        if (String(target) !== dir) {
          return openDirectory(target, options)
        }
        const directoryEntries = [
          ...entries,
          {
            name: second,
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
        if (String(target) === path.join(dir, second)) {
          return firstStats
        }
        return lstat(target, options)
      })

    try {
      await expect(loadTokenSource(dir)).rejects.toThrow(
        `DTCG output paths collide: "${expectedFirst}" and "${expectedSecond}".`
      )
    } finally {
      inspectPath.mockRestore()
      readDirectory.mockRestore()
    }
  }

  it.each([
    [
      'case',
      'Theme.tokens.json',
      'theme.tokens.json',
      'Theme.tokens.json',
      'theme.tokens.json',
    ],
    [
      'Unicode',
      'straße.tokens.json',
      'STRASSE.tokens.json',
      'STRASSE.tokens.json',
      'straße.tokens.json',
    ],
    [
      'Unicode normalization',
      'café.tokens.json',
      'café.tokens.json',
      'café.tokens.json',
      'café.tokens.json',
    ],
  ])(
    'rejects token paths that collide through portable %s comparison',
    rejectPortablePathCollision
  )
  it('loads token files in locale-independent path order', async () => {
    const dir = path.join(tmpDir, 'ordered-build')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    for (const name of ['a.tokens.json', '0.tokens.json', 'Z.tokens.json']) {
      await fs.writeFile(path.join(dir, name), '{}')
    }

    const loaded = await loadTokenSource(dir)

    expect(Object.keys(loaded.files)).toEqual([
      '0.tokens.json',
      'Z.tokens.json',
      'a.tokens.json',
    ])
  })

  it('orders nested token files by their complete relative paths', async () => {
    const dir = path.join(tmpDir, 'nested-order-build')
    await fs.mkdir(path.join(dir, 'a'), { recursive: true })
    await fs.writeFile(
      path.join(dir, 'tokens.resolver.json'),
      JSON.stringify({ version: '2025.10' })
    )
    await fs.writeFile(path.join(dir, 'a.tokens.json'), '{}')
    await fs.writeFile(path.join(dir, 'a/nested.tokens.json'), '{}')

    const loaded = await loadTokenSource(dir)

    expect(Object.keys(loaded.files)).toEqual([
      'a.tokens.json',
      'a/nested.tokens.json',
    ])
  })
  it('reports a missing source and a directory without a Resolver', async () => {
    await expect(loadTokenSource(path.join(tmpDir, 'missing'))).rejects.toThrow(
      /does not exist/
    )
    const emptyDir = path.join(tmpDir, 'empty')
    await fs.mkdir(emptyDir, { recursive: true })
    await expect(loadTokenSource(emptyDir)).rejects.toThrow(
      /contains no tokens\.resolver\.json/
    )
  })
})
