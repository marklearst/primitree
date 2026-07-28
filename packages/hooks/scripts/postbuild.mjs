/**
 * Post-build step for @primitree/hooks:
 *
 * 1. vite-plugin-dts writes dist/index.d.ts. This script copies it to .d.cts
 *    for CJS consumers.
 * 2. Remove intermediate per-module declaration directories left by the
 *    declaration build.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist')

await fs.copyFile(path.join(dist, 'index.d.ts'), path.join(dist, 'index.d.cts'))

for (const dir of ['contexts', 'core', 'hooks', 'types', 'utils', 'api']) {
  await fs.rm(path.join(dist, dir), { recursive: true, force: true })
}
