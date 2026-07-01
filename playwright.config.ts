import { defineConfig, devices } from '@playwright/test'

function readPort(name: string, fallback: number) {
  const requested = process.env[name]

  if (requested === undefined) {
    return fallback
  }

  if (!/^\d+$/.test(requested)) {
    throw new Error(`${name} must be a decimal integer from 1 to 65535`)
  }

  const port = Number(requested)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a decimal integer from 1 to 65535`)
  }

  return port
}

const docsPort = readPort('PLAYWRIGHT_DOCS_PORT', 3100)
const playgroundPort = readPort('PLAYWRIGHT_PLAYGROUND_PORT', 4273)
const docsBaseUrl = `http://127.0.0.1:${docsPort}`
const playgroundBaseUrl = `http://127.0.0.1:${playgroundPort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'docs',
      testMatch: /docs-.*\.spec\.ts/,
      use: { baseURL: docsBaseUrl },
    },
    {
      name: 'standalone-playground',
      testMatch: /standalone-playground\.spec\.ts/,
      use: { baseURL: playgroundBaseUrl },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter primitree-docs exec next dev --webpack --hostname 127.0.0.1 --port ${docsPort}`,
      url: docsBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter primitree-playground dev --host 127.0.0.1 --port ${playgroundPort} --strictPort`,
      url: playgroundBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
