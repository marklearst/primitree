import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const widths = [320, 375] as const
const acceptanceWidths = [390, 1440] as const
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

async function expectNeutralFocusOutline(locator: Locator) {
  await expect(locator).toBeFocused()
  const outline = await locator.evaluate(element => {
    const style = getComputedStyle(element)
    const textProbe = document.createElement('span')
    textProbe.style.color = 'var(--color-primitree-text)'
    document.body.append(textProbe)
    const textColor = getComputedStyle(textProbe).color
    textProbe.remove()

    return {
      color: style.outlineColor,
      offset: Number.parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      textColor,
    }
  })

  expect(outline.style).toBe('solid')
  expect(outline.width).toBeGreaterThanOrEqual(2)
  expect(outline.offset).toBeGreaterThanOrEqual(3)
  expect(outline.color).toBe(outline.textColor)
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

for (const width of acceptanceWidths) {
  test(`marketing shell remains contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expectNoDocumentOverflow(page)
  })

  test(`documentation page remains contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/docs/getting-started')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoDocumentOverflow(page)
  })
}

test('marketing shell applies the approved Lichen background', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(3, 3, 4)'
  )
})

test('documentation page owns a main landmark', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('documentation shell resolves the approved Lichen theme', async ({
  page,
}) => {
  await page.goto('/docs/getting-started')

  const colors = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--color-fd-background)'
    probe.style.color = 'var(--color-fd-primary)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const result = {
      background: style.backgroundColor,
      primary: style.color,
    }
    probe.remove()
    return result
  })

  expect(colors).toEqual({
    background: 'rgb(3, 3, 4)',
    primary: 'rgb(168, 201, 95)',
  })

  const currentPage = page.locator(
    '#nd-sidebar a[href="/docs/getting-started"][data-active="true"]'
  )
  await expect(currentPage).toBeVisible()
  await expect(currentPage).toHaveCSS('color', 'rgb(168, 201, 95)')
})

test('mobile navigation exposes the active page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/playground')
  const menu = page.locator('details[aria-label="Navigation"]')
  await menu.locator('summary').click()
  const activeLinks = menu.locator('nav a[aria-current="page"]')
  await expect(activeLinks).toHaveCount(1)
  await expect(activeLinks).toHaveText('Playground')
  await expect(activeLinks).toHaveCSS('color', 'rgb(168, 201, 95)')
  await expect(activeLinks).toHaveCSS(
    'background-color',
    'rgba(168, 201, 95, 0.1)'
  )
})

test('mobile shell exposes the neutral focus treatment', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expectNeutralFocusOutline(page.getByRole('link', { name: 'Primitree' }))

  await page.keyboard.press('Tab')
  await expectNeutralFocusOutline(
    page.locator('details[aria-label="Navigation"] summary')
  )
})
