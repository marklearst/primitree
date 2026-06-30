import { devices, expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const widths = [320, 375] as const
const interactiveSelector =
  'a, button, summary, input, select, textarea' as const

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectVisibleTouchTargets(page: Page) {
  const undersized = await page
    .locator(interactiveSelector)
    .evaluateAll(elements =>
      elements.flatMap(element => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        const root = element.getRootNode()
        const isFrameworkTool =
          root instanceof ShadowRoot && root.host.localName === 'nextjs-portal'
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0

        if (
          isFrameworkTool ||
          !isVisible ||
          (box.width >= 44 && box.height >= 44)
        ) {
          return []
        }

        const label =
          element.getAttribute('aria-label') ||
          element.textContent?.replace(/\s+/g, ' ').trim() ||
          element.querySelector('img[alt]')?.getAttribute('alt') ||
          element.getAttribute('href') ||
          'unlabelled'

        return [
          `${element.tagName.toLowerCase()} "${label}": ${box.width.toFixed(1)}x${box.height.toFixed(1)}`,
        ]
      })
    )

  expect(
    undersized,
    'every visible interactive target should be at least 44x44 CSS pixels'
  ).toEqual([])
}

async function expectAccentFocusOutline(locator: Locator) {
  await expect(locator).toBeFocused()
  const outline = await locator.evaluate(element => {
    const style = getComputedStyle(element)
    const accentProbe = document.createElement('span')
    accentProbe.style.color = 'var(--color-primitree-accent)'
    document.body.append(accentProbe)
    const accentColor = getComputedStyle(accentProbe).color
    accentProbe.remove()

    return {
      color: style.outlineColor,
      offset: Number.parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      accentColor,
    }
  })

  expect(outline.style).toBe('solid')
  expect(outline.width).toBeGreaterThanOrEqual(2)
  expect(outline.offset).toBeGreaterThanOrEqual(3)
  expect(outline.color).toBe(outline.accentColor)
}

for (const width of widths) {
  test(`marketing shell is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Primitree' })).toBeVisible()
    const menu = page.locator('details[aria-label="Navigation"]')
    const summary = menu.locator('summary')
    await summary.click()
    const docsLink = menu.getByRole('link', { name: 'Docs' })
    const playgroundLink = menu.getByRole('link', { name: 'Playground' })
    const githubLink = menu.getByRole('link', { name: 'GitHub' })
    await expect(docsLink).toBeVisible()
    await expect(playgroundLink).toBeVisible()
    await expect(githubLink).toHaveAttribute('target', '_blank')
    expect((await githubLink.getAttribute('rel'))?.split(/\s+/).sort()).toEqual(
      ['noopener', 'noreferrer']
    )
    await expectVisibleTouchTargets(page)
    await expectNoDocumentOverflow(page)
  })
}

test('documentation page owns a main landmark', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('mobile navigation exposes the active page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/playground')
  const menu = page.locator('details[aria-label="Navigation"]')
  await menu.locator('summary').click()
  const activeLinks = menu.locator('nav a[aria-current="page"]')
  await expect(activeLinks).toHaveCount(1)
  await expect(activeLinks).toHaveText('Playground')
})

test('mobile shell exposes the accent focus treatment', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expectAccentFocusOutline(page.getByRole('link', { name: 'Primitree' }))

  await page.keyboard.press('Tab')
  await expectAccentFocusOutline(
    page.locator('details[aria-label="Navigation"] summary')
  )
})

test('touch contexts exclude fine-pointer hover enhancements', async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL,
  })

  try {
    const page = await context.newPage()
    await page.goto('/')
    expect(
      await page.evaluate(
        () => matchMedia('(hover: hover) and (pointer: fine)').matches
      )
    ).toBe(false)

    const primary = page.getByRole('link', { name: 'Read the docs' })
    await primary.hover({ force: true })
    await expect(primary).toHaveCSS('transform', 'none')
  } finally {
    await context.close()
  }
})

test('reduced motion collapses decorative animation and transform', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const motion = await page.locator('.hero-eyebrow-dot').evaluate(element => {
    const style = getComputedStyle(element)
    const toMilliseconds = (value: string) =>
      value.endsWith('ms')
        ? Number.parseFloat(value)
        : Number.parseFloat(value) * 1000

    return {
      durations: style.animationDuration.split(',').map(toMilliseconds),
      iterations: style.animationIterationCount.split(','),
    }
  })

  expect(motion.durations.every(duration => duration <= 0.01)).toBe(true)
  expect(motion.iterations.every(iteration => iteration === '1')).toBe(true)
  await expect(page.locator('.mark-stage')).toHaveCSS('transform', 'none')
})
