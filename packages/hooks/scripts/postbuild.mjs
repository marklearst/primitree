/**
 * Post-build step for @figmavars/hooks:
 *
 * 1. dist/index.d.ts is rolled up by vite-plugin-dts; mirror it to .d.cts
 *    for CJS consumers.
 * 2. The /core subpath is a pure re-export of @figmavars/core, so its
 *    declarations are a one-liner written here (the rollup only covers the
 *    main entry).
 * 3. Remove intermediate per-module declaration directories left behind by
 *    the multi-entry declaration build.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist')

await fs.copyFile(path.join(dist, 'index.d.ts'), path.join(dist, 'index.d.cts'))

const coreDts = "export * from '@figmavars/core'\n"
await fs.writeFile(path.join(dist, 'core.d.ts'), coreDts)
await fs.writeFile(path.join(dist, 'core.d.cts'), coreDts)

for (const dir of ['contexts', 'core', 'hooks', 'types', 'utils', 'api']) {
  await fs.rm(path.join(dist, dir), { recursive: true, force: true })
}
