import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8')
)

describe('package contract', () => {
  it('ships one root entry without a core compatibility subpath', () => {
    expect(Object.keys(manifest.exports)).toEqual(['.'])
    expect(manifest.typesVersions).toBeUndefined()

    for (const file of [
      'dist/core.mjs',
      'dist/core.cjs',
      'dist/core.d.ts',
      'dist/core.d.cts',
    ]) {
      expect(existsSync(resolve(packageRoot, file)), file).toBe(false)
    }
  })
})
