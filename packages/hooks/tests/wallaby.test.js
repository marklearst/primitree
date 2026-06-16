import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('wallaby.js config', () => {
  it('does not load or forward environment credentials', async () => {
    const source = readFileSync(resolve(process.cwd(), 'wallaby.js'), 'utf8')

    expect(source).not.toContain('dotenv')
    expect(source).not.toMatch(/['"]\.env['"]/)
    expect(source).not.toContain('VITE_FIGMA_TOKEN')
    expect(source).not.toContain('VITE_FIGMA_FILE_KEY')
    expect(source).not.toContain('process.env')

    const wallabyConfigModule = await import('../wallaby.js')
    const wallabyConfig = wallabyConfigModule.default
    expect(typeof wallabyConfig).toBe('function')

    const config = wallabyConfig({})

    expect(config).toBeDefined()
    expect(Array.isArray(config.files)).toBe(true)
    expect(Array.isArray(config.tests)).toBe(true)
    expect(config.testFramework.name).toBe('vitest')
    expect(config.files).not.toContain('.env')

    const serializedEnvironment = JSON.stringify(config.env ?? {})
    expect(serializedEnvironment).not.toContain('VITE_FIGMA_TOKEN')
    expect(serializedEnvironment).not.toContain('VITE_FIGMA_FILE_KEY')
  })
})
