import { readFile } from 'node:fs/promises'

describe('policy package export', () => {
  it('configures the policy package export without exporting it from the Core root', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    )
    const buildConfig = await readFile(
      new URL('../../tsup.config.ts', import.meta.url),
      'utf8'
    )
    const rootSource = await readFile(
      new URL('../../src/index.ts', import.meta.url),
      'utf8'
    )

    expect(packageJson.exports['./policy']).toEqual({
      import: {
        types: './dist/policy.d.ts',
        default: './dist/policy.js',
      },
      require: {
        types: './dist/policy.d.cts',
        default: './dist/policy.cjs',
      },
      default: './dist/policy.js',
    })
    expect(buildConfig).toContain("policy: 'src/policy/index.ts'")
    expect(rootSource).not.toContain("export * from './policy/index'")
  })
})
