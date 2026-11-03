// Uploads the licensed webfont files to private Vercel Blob storage. Run from a
// checkout that has the originals, with BLOB_READ_WRITE_TOKEN in .env.local:
//   pnpm --filter primitree-docs fonts:upload
// Uploads use private access, so only the token can read the files. A store
// already seeded by another project can be connected instead of re-uploading,
// as long as it uses the same fonts/wotfard and fonts/monolisa pathnames.
import { readFile } from 'node:fs/promises'
import { put } from '@vercel/blob'
import {
  blobPathname,
  isWoff2,
  licensedFontPaths,
  publicFile,
} from './webfont-paths.mjs'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN is not set.')
  process.exit(1)
}

const failures = []
for (const path of await licensedFontPaths()) {
  const file = publicFile(path)
  if (!(await isWoff2(file))) {
    failures.push(`${path}: missing or not a WOFF2, nothing uploaded`)
    continue
  }
  try {
    const result = await put(blobPathname(path), await readFile(file), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'font/woff2',
    })
    console.log(`Uploaded ${result.pathname}`)
  } catch (error) {
    failures.push(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}
