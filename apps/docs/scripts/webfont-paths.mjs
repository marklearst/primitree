import { readFile } from 'node:fs/promises'

const WOFF2_MAGIC = 'wOF2'

const STYLESHEETS = ['../app/fonts.css', '../app/monolisa.css']

/** Licensed font URLs declared in the stylesheets, as site-relative paths. */
export async function licensedFontPaths() {
  const paths = []
  for (const stylesheet of STYLESHEETS) {
    const css = await readFile(new URL(stylesheet, import.meta.url), 'utf8')
    for (const [, path] of css.matchAll(
      /url\(['"]?(\/fonts\/(?:wotfard|monolisa)\/[^'"\s)]+)['"]?\)/g
    )) {
      paths.push(path)
    }
  }
  return [...new Set(paths)]
}

/** Absolute file URL under public/ for a site-relative path. */
export function publicFile(path) {
  return new URL(`../public${path}`, import.meta.url)
}

/** Blob pathname for a site-relative path: strip the leading slash. */
export function blobPathname(path) {
  return path.replace(/^\//, '')
}

/** True when the file exists and starts with the WOFF2 signature. */
export async function isWoff2(fileUrl) {
  try {
    const bytes = await readFile(fileUrl)
    return bytes.subarray(0, 4).toString('ascii') === WOFF2_MAGIC
  } catch {
    return false
  }
}
