import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const widths = [320, 375] as const

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
}

for (const width of widths) {
  test(`marketing shell is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'FigmaVars' })).toBeVisible()
    const menu = page.locator('details[aria-label="Navigation"]')
    const summary = menu.locator('summary')
    await expectTouchTarget(summary)
    await summary.click()
    const docsLink = menu.getByRole('link', { name: 'Docs' })
    const playgroundLink = menu.getByRole('link', { name: 'Playground' })
    await expect(docsLink).toBeVisible()
    await expect(playgroundLink).toBeVisible()
    await expectTouchTarget(docsLink)
    await expectTouchTarget(playgroundLink)
    await expectNoDocumentOverflow(page)
  })
}

test('documentation page owns a main landmark', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
