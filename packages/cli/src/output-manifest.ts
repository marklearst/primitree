import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { PipelineFile } from '@primitree/dtcg'
import type { PrimitreeOutputFormat } from './config'

export const BUILD_MANIFEST_PATH = '.primitree-manifest.json'

const FORMAT_ORDER = ['dtcg', 'css', 'typescript', 'tailwind'] as const
export const MAX_BUILD_FILE_BYTES = 64 * 1024 * 1024
export const MAX_BUILD_TOTAL_BYTES = 256 * 1024 * 1024

const MAX_MANIFEST_FILES = 5
const MANIFEST_FILE_LIMIT_MESSAGE =
  'Build output manifest cannot list more than 5 files.'
const SHA256 = /^[0-9a-f]{64}$/u

export interface BuildManifest {
  readonly schemaVersion: 1
  readonly source: {
    readonly id: string
    readonly sha256: string
  }
  readonly formats: readonly PrimitreeOutputFormat[]
  readonly files: readonly {
    readonly path: string
    readonly bytes: number
    readonly sha256: string
  }[]
}

export function hashBuildText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

export function parseBuildManifest(contents: string): BuildManifest {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error('Build output manifest must contain JSON.')
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'source', 'formats', 'files']) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, ['id', 'sha256']) ||
    typeof value.source.id !== 'string' ||
    value.source.id.length === 0 ||
    typeof value.source.sha256 !== 'string' ||
    !SHA256.test(value.source.sha256) ||
    !Array.isArray(value.formats) ||
    !Array.isArray(value.files)
  ) {
    throw new Error(
      'Build output manifest must set "schemaVersion" to 1 and include a source ID, source SHA-256 hash, format list, and file list.'
    )
  }
  const formats = value.formats
  const orderedFormats = FORMAT_ORDER.filter(format => formats.includes(format))
  if (
    formats.length === 0 ||
    orderedFormats.length !== formats.length ||
    orderedFormats.some((format, index) => formats[index] !== format)
  ) {
    throw new Error(
      'Build output manifest must list one or more formats, with no repeats, in this order: dtcg, css, typescript, tailwind.'
    )
  }
  if (value.files.length > MAX_MANIFEST_FILES) {
    throw new Error(MANIFEST_FILE_LIMIT_MESSAGE)
  }
  const files: { path: string; bytes: number; sha256: string }[] = []
  let totalBytes = 0
  for (const entry of value.files) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['path', 'bytes', 'sha256']) ||
      typeof entry.path !== 'string' ||
      entry.path.length === 0 ||
      typeof entry.bytes !== 'number' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== 'string' ||
      !SHA256.test(entry.sha256)
    ) {
      throw new Error(
        'Each build output manifest file entry needs a nonempty path, a nonnegative safe-integer byte count, and a 64-character SHA-256 hash.'
      )
    }
    if (entry.bytes > MAX_BUILD_FILE_BYTES) {
      throw new Error(
        `Build output manifest file exceeds the 64 MiB limit: ${entry.path}`
      )
    }
    totalBytes += entry.bytes
    if (totalBytes > MAX_BUILD_TOTAL_BYTES) {
      throw new Error(
        'Build output manifest files exceed the 256 MiB total limit.'
      )
    }
    files.push({
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })
  }
  if (
    files.some((file, index) => {
      const previous = files[index - 1]
      return (
        previous !== undefined && previous.path.localeCompare(file.path) >= 0
      )
    })
  ) {
    throw new Error(
      'The build output manifest must list each file path once and in sort order.'
    )
  }
  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze({
      id: value.source.id,
      sha256: value.source.sha256,
    }),
    formats: Object.freeze([...orderedFormats]),
    files: Object.freeze(files.map(file => Object.freeze(file))),
  })
}

export function createBuildManifest(
  input: Readonly<{
    source: string
    sourceContents: string
    formats: readonly PrimitreeOutputFormat[]
    files: readonly PipelineFile[]
  }>
): PipelineFile {
  if (input.files.length > MAX_MANIFEST_FILES) {
    throw new Error(MANIFEST_FILE_LIMIT_MESSAGE)
  }
  let totalBytes = 0
  const orderedFiles = [...input.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => {
      const bytes = Buffer.byteLength(file.contents, 'utf8')
      if (bytes > MAX_BUILD_FILE_BYTES) {
        throw new Error(
          `Build output file exceeds the 64 MiB limit: ${file.path}`
        )
      }
      totalBytes += bytes
      if (totalBytes > MAX_BUILD_TOTAL_BYTES) {
        throw new Error('Build output files exceed the 256 MiB total limit.')
      }
      return {
        path: file.path,
        bytes,
        sha256: hashBuildText(file.contents),
      }
    })
  const selectedFormats = new Set(input.formats)

  return {
    path: BUILD_MANIFEST_PATH,
    contents: `${JSON.stringify(
      {
        schemaVersion: 1,
        source: {
          id: input.source,
          sha256: hashBuildText(input.sourceContents),
        },
        formats: FORMAT_ORDER.filter(format => selectedFormats.has(format)),
        files: orderedFiles,
      },
      null,
      2
    )}\n`,
  }
}
