// Downloads the licensed Wotfard and MonoLisa webfonts from private Vercel Blob
// storage when a checkout does not have them. The binaries are not distributed
// in this public repository. A local checkout without them builds with system
// fonts; a Vercel build (VERCEL=1) fails instead, so production never ships the
// fallback by accident.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  blobPathname,
  isWoff2,
  licensedFontPaths,
  publicFile,
} from './webfont-paths.mjs'

const paths = await licensedFontPaths()
const missing = []
for (const path of paths) {
  if (!(await isWoff2(publicFile(path)))) {
    missing.push(path)
  }
}

if (missing.length === 0) {
  console.log(`Licensed webfonts present (${paths.length} files).`)
  process.exit(0)
}

const required = process.env.VERCEL === '1'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const message = `${missing.length} licensed webfont files are missing and BLOB_READ_WRITE_TOKEN is not set.`
  if (required) {
    console.error(message)
    console.error(
      'Connect the webfont Blob store to this Vercel project. See public/fonts/wotfard/README.md.'
    )
    process.exit(1)
  }
  console.warn(`${message} The site will render with system fonts.`)
  process.exit(0)
}

const { get } = await import('@vercel/blob')
const failures = []
for (const path of missing) {
  const target = publicFile(path)
  try {
    const result = await get(blobPathname(path), {
      access: 'private',
      useCache: false,
    })
    if (result?.statusCode !== 200 || !result.stream) {
      failures.push(`${path}: not found in Blob storage`)
      continue
    }
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer())
    if (bytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
      failures.push(`${path}: stored file is not a WOFF2`)
      continue
    }
    await mkdir(dirname(fileURLToPath(target)), { recursive: true })
    await writeFile(target, bytes)
    console.log(`Fetched ${path} (${bytes.length} bytes)`)
  } catch (error) {
    failures.push(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

if (failures.length > 0) {
  console.error('Could not fetch every licensed webfont file.')
  for (const failure of failures) {
    console.error(`  ${failure}`)
  }
  process.exit(required ? 1 : 0)
}
