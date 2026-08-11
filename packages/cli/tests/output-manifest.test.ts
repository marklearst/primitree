import { describe, expect, it } from 'vitest'
import {
  createBuildManifest,
  hashBuildText,
  MAX_BUILD_FILE_BYTES,
  MAX_BUILD_TOTAL_BYTES,
  parseBuildManifest,
} from '../src/output-manifest'

describe('build output manifest', () => {
  it('sorts formats and files and hashes their exact UTF-8 text', () => {
    const manifest = createBuildManifest({
      source: 'brand',
      sourceContents: 'source\n',
      formats: ['tailwind', 'dtcg'],
      files: [
        { path: 'tokens/z.tokens.json', contents: 'beta\n' },
        { path: 'tokens/a.tokens.json', contents: 'alpha\n' },
      ],
    })

    expect(manifest.path).toBe('.primitree-manifest.json')
    expect(manifest.contents.endsWith('\n')).toBe(true)
    const document = JSON.parse(manifest.contents)
    expect(document).toEqual({
      schemaVersion: 1,
      source: {
        id: 'brand',
        sha256:
          'b8bb034f9b63bd0254fbc7c157cae746c75853f4643d6cea844dc48ddb57f522',
      },
      formats: ['dtcg', 'tailwind'],
      files: [
        {
          path: 'tokens/a.tokens.json',
          bytes: 6,
          sha256:
            'b6a98d9ce9a2d9149288fa3df42d377c3e42737afdcdaf714e33c0a100b51060',
        },
        {
          path: 'tokens/z.tokens.json',
          bytes: 5,
          sha256:
            'f2c82decdd7181cf98945929a62598db7e6b477e11f6e0eb0ae97020eff151ad',
        },
      ],
    })
    expect(parseBuildManifest(manifest.contents).files).toEqual(document.files)
  })

  it('counts file contents as UTF-8 bytes', () => {
    const manifest = createBuildManifest({
      source: 'brand',
      sourceContents: '{}\n',
      formats: ['dtcg'],
      files: [{ path: 'tokens/source.tokens.json', contents: 'é\n' }],
    })

    expect(JSON.parse(manifest.contents).files[0].bytes).toBe(3)
  })

  it('rejects an empty format list', () => {
    const contents = JSON.stringify({
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: [],
      files: [],
    })

    expect(() => parseBuildManifest(contents)).toThrow(
      'Build output manifest must list one or more formats, with no repeats, in this order: dtcg, css, typescript, tailwind.'
    )
  })

  it('requires a nonnegative safe-integer byte count for each file', () => {
    const source = {
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: ['dtcg'],
    }
    const file = {
      path: 'tokens/source.tokens.json',
      sha256: hashBuildText(''),
    }
    const invalidEntries = [
      file,
      { ...file, bytes: -1 },
      { ...file, bytes: 0.5 },
      { ...file, bytes: Number.MAX_SAFE_INTEGER + 1 },
      { ...file, bytes: '0' },
    ]

    for (const entry of invalidEntries) {
      expect(() =>
        parseBuildManifest(JSON.stringify({ ...source, files: [entry] }))
      ).toThrow(
        'Each build output manifest file entry needs a nonempty path, a nonnegative safe-integer byte count, and a 64-character SHA-256 hash.'
      )
    }
  })

  it('rejects extra file-entry fields', () => {
    const contents = JSON.stringify({
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: ['dtcg'],
      files: [
        {
          path: 'tokens/source.tokens.json',
          bytes: 0,
          sha256: hashBuildText(''),
          extra: true,
        },
      ],
    })

    expect(() => parseBuildManifest(contents)).toThrow(
      'Each build output manifest file entry needs a nonempty path, a nonnegative safe-integer byte count, and a 64-character SHA-256 hash.'
    )
  })

  it('rejects duplicate or unsorted file paths', () => {
    const source = {
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: ['dtcg'],
    }
    const file = {
      bytes: 0,
      sha256: hashBuildText(''),
    }

    for (const paths of [
      ['tokens/a.json', 'tokens/a.json'],
      ['tokens/z.json', 'tokens/a.json'],
    ]) {
      const files = paths.map(path => ({ ...file, path }))
      expect(() =>
        parseBuildManifest(JSON.stringify({ ...source, files }))
      ).toThrow(
        'The build output manifest must list each file path once and in sort order.'
      )
    }
  })

  it('rejects more than five file entries', () => {
    const contents = JSON.stringify({
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: ['dtcg'],
      files: Array.from({ length: 6 }, () => null),
    })

    expect(() => parseBuildManifest(contents)).toThrow(
      'Build output manifest cannot list more than 5 files.'
    )
  })

  it('rejects file and total byte counts beyond the build limits', () => {
    const source = {
      schemaVersion: 1,
      source: { id: 'brand', sha256: hashBuildText('source\n') },
      formats: ['dtcg'],
    }
    const file = {
      path: 'tokens/a.json',
      bytes: MAX_BUILD_FILE_BYTES + 1,
      sha256: hashBuildText(''),
    }

    expect(() =>
      parseBuildManifest(JSON.stringify({ ...source, files: [file] }))
    ).toThrow(
      'Build output manifest file exceeds the 64 MiB limit: tokens/a.json'
    )

    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `tokens/${index}.json`,
      bytes: MAX_BUILD_TOTAL_BYTES / 4,
      sha256: hashBuildText(''),
    }))
    expect(() =>
      parseBuildManifest(JSON.stringify({ ...source, files }))
    ).toThrow('Build output manifest files exceed the 256 MiB total limit.')
  })
})
