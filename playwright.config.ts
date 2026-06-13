import { defineConfig, devices } from '@playwright/test'

const requestedDocsPort = process.env.PLAYWRIGHT_DOCS_PORT
const docsPort =
  requestedDocsPort === undefined ? 3000 : Number(requestedDocsPort)

if (!Number.isInteger(docsPort) || docsPort < 1 || docsPort > 65_535) {
  throw new Error('PLAYWRIGHT_DOCS_PORT must be an integer from 1 to 65535')
}

const docsBaseUrl = `http://127.0.0.1:${docsPort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: docsBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter figmavars-docs exec next dev --webpack --hostname 127.0.0.1 --port ${docsPort}`,
    url: docsBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
