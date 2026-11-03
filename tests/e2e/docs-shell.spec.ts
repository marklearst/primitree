import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import siteGraph from '../../apps/docs/tokens/generated/graph.json' with { type: 'json' }

// The site follows the reader's color scheme. These checks pin the dark
// theme's solved tokens, so every page here opens in dark.
test.use({ colorScheme: 'dark' })

const widths = [320, 375] as const
const acceptanceWidths = [390, 1440] as const
const interactiveSelector =
  'a, button, summary, input, select, textarea' as const

function darkValue(path: string) {
  const token = siteGraph.tokens.find(item => item.path === path)
  if (token === undefined) {
    throw new Error(`The token file has no ${path}.`)
  }
  return token.value.dark
}

/** Measures how far a color sits from a token's dark value, on a canvas. The
 * bundler decides whether a stylesheet holds oklch() or lab(), so colors compare
 * by what they paint and never by how the browser spells them. */
function gapFromToken(page: Page, color: string, path: string) {
  return page.evaluate(
    ([actual, wanted]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) {
        throw new Error('This browser gave no canvas context.')
      }
      const [first = [], second = []] = [actual, wanted].map(value => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value ?? ''
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      })
      return Math.max(
        ...first.map((channel, index) =>
          Math.abs(channel - (second[index] ?? 0))
        )
      )
    },
    [color, darkValue(path)] as const
  )
}

/** Asserts a computed color paints a token's dark value. Two channels of slack
 * cover the rounding between a color space and 8-bit sRGB. */
async function expectPaintsToken(
  locator: Locator,
  property: string,
  path: string
) {
  await expect
    .poll(
      async () =>
        gapFromToken(
          locator.page(),
          await locator.evaluate(
            (element, name) => getComputedStyle(element).getPropertyValue(name),
            property
          ),
          path
        ),
      { message: `${property} must paint ${path}` }
    )
    .toBeLessThanOrEqual(2)
}

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
    const menu = page.locator('#site-menu')
    const trigger = page.getByRole('button', { name: 'Menu' })
    await trigger.click()
    await expect(menu).toBeVisible()
    // Light dismiss: Escape closes it and hands focus back; so does a tap outside.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(menu).toBeVisible()
    await page.mouse.click(8, 600)
    await expect(menu).toBeHidden()
    await trigger.click()
    const docsLink = menu.getByRole('link', { name: 'Docs' })
    const playgroundLink = menu.getByRole('link', { name: 'Playground' })
    const githubLink = menu.getByRole('link', { name: 'GitHub' })
    const searchButton = menu.getByRole('button', {
      name: 'Open Search',
      exact: true,
    })
    await expect(docsLink).toBeVisible()
    await expect(playgroundLink).toBeVisible()
    await expect(searchButton).toBeVisible()
    await expect(githubLink).toHaveAttribute('target', '_blank')
    expect((await githubLink.getAttribute('rel'))?.split(/\s+/).sort()).toEqual(
      ['noopener', 'noreferrer']
    )
    await searchButton.click()
    const searchDialog = page.getByRole('dialog')
    const searchInput = searchDialog.getByRole('textbox')
    await expect(searchDialog).toBeVisible()
    await expect(searchInput).toBeFocused()
    await expect(menu).toBeHidden()
    // Radix sets body pointer-events to none, which hides the header from a plain hit test.
    const onTop = await searchInput.evaluate(input => {
      const box = input.getBoundingClientRect()
      const locked = document.body.style.pointerEvents
      document.body.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2
      )
      document.body.style.pointerEvents = locked
      return hit === input
    })
    expect(onTop).toBe(true)
    await page.keyboard.press('Escape')
    await expect(searchDialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(menu).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(menu).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(searchDialog).toBeHidden()
    await trigger.click()
    await expect(menu).toBeVisible()
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

test('marketing shell applies the solved page surface', async ({ page }) => {
  await page.goto('/')

  await expectPaintsToken(
    page.locator('body'),
    'background-color',
    'semantic.surface.page'
  )
})

test('documentation page owns a main landmark', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('the header link opens the docs at the top from a scrolled homepage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.evaluate(() => window.scrollTo(0, 1200))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1200)
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Docs' })
    .click()
  await page.waitForURL(/\/docs$/u)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('documentation shell resolves the solved tokens', async ({ page }) => {
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

  expect(
    await gapFromToken(page, colors.background, 'semantic.surface.page')
  ).toBeLessThanOrEqual(2)
  expect(
    await gapFromToken(page, colors.primary, 'semantic.accent.text')
  ).toBeLessThanOrEqual(2)

  const currentPage = page.locator(
    '#nd-sidebar a[href="/docs/getting-started"][data-active="true"]'
  )
  await expect(currentPage).toBeVisible()
  await expectPaintsToken(currentPage, 'color', 'semantic.accent.text')
})

test('mobile navigation exposes the active page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/playground')
  const menu = page.locator('#site-menu')
  await page.getByRole('button', { name: 'Menu' }).click()
  const activeLinks = menu.locator('a[aria-current="page"]')
  await expect(activeLinks).toHaveCount(1)
  await expect(activeLinks).toHaveText('Playground')
  await expectPaintsToken(activeLinks, 'color', 'semantic.accent.text')
  await expectPaintsToken(
    activeLinks,
    'background-color',
    'semantic.accent.subtle'
  )
})

test('an open phone menu goes with its trigger past the phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.locator('#site-menu')
  const trigger = page.getByRole('button', { name: 'Menu' })
  await trigger.click()
  await expect(menu).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(menu).toBeHidden()
  await expect(trigger).toBeHidden()
})

test('a short viewport keeps the search field and its last result on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  // The hotkey listener arrives with hydration, and so do the settled readouts.
  await expect(page.locator('.crown-readout .for-light')).toHaveCount(0)
  await expect(page.locator('.crown-readout dd').first()).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const searchInput = page.getByRole('dialog').getByRole('textbox')
  await expect(searchInput).toBeFocused()
  const box = await searchInput.boundingBox()
  expect(box?.y).toBeGreaterThanOrEqual(0)
  await searchInput.fill('check')
  const list = page.getByRole('dialog').locator('.overflow-y-auto')
  await expect(list.locator('button, a').first()).toBeVisible()
  await expect
    .poll(() => list.evaluate(node => node.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(390)
})

test('docs pages do not prefetch routes that carry their own stylesheet', async ({
  page,
}) => {
  const prefetched: string[] = []
  page.on('request', request => {
    if (request.headers()['next-router-prefetch']) {
      prefetched.push(new URL(request.url()).pathname)
    }
  })
  await page.goto('/docs/playground')
  await page.waitForLoadState('networkidle')
  const devOverlay = page.locator('nextjs-portal')
  // Hydration can land past network idle, and it brings one of these two.
  await expect
    .poll(async () => prefetched.length + (await devOverlay.count()))
    .toBeGreaterThan(0)
  test.skip((await devOverlay.count()) > 0, 'next dev never prefetches')
  expect(prefetched).not.toContain('/')
  expect(prefetched).not.toContain('/playground')
})

test('mobile shell exposes the neutral focus treatment', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expectNeutralFocusOutline(page.getByRole('link', { name: 'Primitree' }))

  await page.keyboard.press('Tab')
  await expectNeutralFocusOutline(page.getByRole('button', { name: 'Menu' }))
})
