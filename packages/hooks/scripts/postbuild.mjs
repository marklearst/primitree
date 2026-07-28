/**
 * Post-build step for @primitree/hooks:
 *
 * 1. vite-plugin-dts writes dist/index.d.ts; this script copies it to .d.cts
 *    for CJS consumers.
 * 2. The /core subpath is a pure re-export of @primitree/core, so its
 *    declarations are a one-line export written here (the rollup covers the
 *    main entry).
 * 3. Remove intermediate per-module declaration directories left behind by
 *    the multi-entry declaration build.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist')

await fs.copyFile(path.join(dist, 'index.d.ts'), path.join(dist, 'index.d.cts'))

const coreDts = "export * from '@primitree/core'\n"
await fs.writeFile(path.join(dist, 'core.d.ts'), coreDts)
await fs.writeFile(path.join(dist, 'core.d.cts'), coreDts)

for (const dir of ['contexts', 'core', 'hooks', 'types', 'utils', 'api']) {
  await fs.rm(path.join(dist, dir), { recursive: true, force: true })
}
