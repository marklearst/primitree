import { devices, expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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

async function expectHeroContentInsideViewport(page: Page) {
  const viewportWidth = page.viewportSize()?.width
  expect(viewportWidth).toBeTruthy()

  const clipped = await page
    .locator('.governance-hero h1, .governance-hero-support')
    .evaluateAll(
      (elements, width) =>
        elements.flatMap(element => {
          const box = element.getBoundingClientRect()
          const isClipped =
            box.left < -0.5 ||
            box.right > width + 0.5 ||
            element.scrollWidth > element.clientWidth + 1

          return isClipped
            ? [
                `${element.tagName.toLowerCase()}: left=${box.left.toFixed(1)}, right=${box.right.toFixed(1)}, client=${element.clientWidth}, scroll=${element.scrollWidth}`,
              ]
            : []
        }),
      viewportWidth as number
    )

  expect(clipped, 'hero copy must stay inside the visible viewport').toEqual([])
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

async function expectReadableGovernanceText(
  page: Page,
  minimumFontSize: number
) {
  const evidence = await page
    .locator(
      [
        '.canopy-node-kicker',
        '.canopy-node-label',
        '.canopy-token-label',
        '.canopy-stage-track strong',
        '.canopy-stage-track p',
        '.canopy-mobile-node span',
        '.canopy-mobile-node code',
        '.canopy-mobile-logo span',
      ].join(', ')
    )
    .evaluateAll(elements => {
      const parseRgb = (value: string) => {
        const channels = value
          .match(/[0-9.]+/gu)
          ?.slice(0, 3)
          .map(Number)
        return channels?.length === 3 ? channels : undefined
      }
      const luminance = (channels: number[]) => {
        const [red = 0, green = 0, blue = 0] = channels
          .map(channel => channel / 255)
          .map(channel =>
            channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4
          )
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
      }
      const contrast = (foreground: number[], background: number[]) => {
        const foregroundLuminance = luminance(foreground)
        const backgroundLuminance = luminance(background)
        return (
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
        )
      }

      return elements.flatMap(element => {
        if (element.getClientRects().length === 0) {
          return []
        }

        const style = getComputedStyle(element)
        const isSvgText = element instanceof SVGTextElement
        const foreground = parseRgb(isSvgText ? style.fill : style.color)
        const hasAccentWash = element.closest(
          '.canopy-source-node, .canopy-token-node, .canopy-mobile-node-source'
        )
        const background = hasAccentWash
          ? [20, 23, 13]
          : element.closest('.canopy-mobile-node') || isSvgText
            ? [8, 8, 10]
            : [3, 3, 4]
        let effectiveOpacity = 1
        let current: Element | null = element

        while (current !== null) {
          effectiveOpacity *= Number.parseFloat(
            getComputedStyle(current).opacity
          )
          current = current.parentElement
        }

        return [
          {
            contrast: foreground ? contrast(foreground, background) : 0,
            fontSize: Number.parseFloat(style.fontSize),
            label: element.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
            opacity: effectiveOpacity,
          },
        ]
      })
    })

  expect(evidence.length).toBeGreaterThan(0)
  for (const item of evidence) {
    expect(
      item.fontSize,
      `${item.label} must remain legible`
    ).toBeGreaterThanOrEqual(minimumFontSize)
    expect(item.opacity, `${item.label} must not be faded`).toBe(1)
    expect(
      item.contrast,
      `${item.label} must clear WCAG AA`
    ).toBeGreaterThanOrEqual(4.5)
  }
}

function governanceTabs(page: Page) {
  return page.getByRole('tablist', { name: 'Governance evidence' })
}

async function expectOnlyTabSelected(
  page: Page,
  selectedName: 'Govern' | 'Trace' | 'Ship'
) {
  const tabs = governanceTabs(page).getByRole('tab')

  for (let index = 0; index < 3; index += 1) {
    const tab = tabs.nth(index)
    const name = (await tab.textContent())?.trim()
    const panelId = await tab.getAttribute('aria-controls')
    const isSelected = name === selectedName

    expect(panelId).toBeTruthy()
    await expect(tab).toHaveAttribute(
      'aria-selected',
      isSelected ? 'true' : 'false'
    )
    await expect(tab).toHaveAttribute('tabindex', isSelected ? '0' : '-1')

    const panel = page.locator(`#${panelId}`)
    if (isSelected) {
      await expect(panel).toBeVisible()
    } else {
      await expect(panel).toBeHidden()
    }
  }
}

async function expectTabKeyboardNavigation(page: Page) {
  const tablist = governanceTabs(page)
  const govern = tablist.getByRole('tab', { name: 'Govern', exact: true })
  const trace = tablist.getByRole('tab', { name: 'Trace', exact: true })
  const ship = tablist.getByRole('tab', { name: 'Ship', exact: true })

  await govern.focus()
  await page.keyboard.press('ArrowRight')
  await expect(trace).toBeFocused()
  await expectOnlyTabSelected(page, 'Trace')

  await page.keyboard.press('End')
  await expect(ship).toBeFocused()
  await expectOnlyTabSelected(page, 'Ship')

  await page.keyboard.press('Home')
  await expect(govern).toBeFocused()
  await expectOnlyTabSelected(page, 'Govern')

  await page.keyboard.press('ArrowLeft')
  await expect(ship).toBeFocused()
  await expectOnlyTabSelected(page, 'Ship')
}

test('homepage leads with truthful governance', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Govern token change. Know every consequence.',
    })
  ).toHaveCount(1)
  await expect(
    page.getByRole('link', { name: 'Run the quickstart' })
  ).toHaveAttribute('href', '/docs/getting-started')
  await expect(page.getByRole('main')).toContainText('semantic.color.bg.brand')
  await expect(page.getByRole('main')).toContainText(
    '{primitives.color.blue.500}'
  )
  await expect(page.getByRole('main')).toContainText('#3366ff')
  await expect(page.getByRole('main')).toContainText('component.button.bg')
  await expect(page.getByRole('main')).toContainText('component.focus.ring')
  await expect(page.getByRole('main')).toContainText('component.nav.active.bg')
  await expect(page.getByRole('main')).not.toContainText('Turn variables.json')
})

test('desktop navigation exposes documentation, search, and GitHub', async ({
  page,
}) => {
  await page.goto('/')

  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  })
  await expect(
    navigation.getByRole('link', { name: 'Docs', exact: true })
  ).toBeVisible()
  await expect(
    navigation.getByRole('link', { name: 'Playground', exact: true })
  ).toBeVisible()
  await expect(
    navigation.getByRole('button', { name: 'Open Search', exact: true })
  ).toBeVisible()
  await expect(
    navigation.getByRole('link', {
      name: 'Primitree on GitHub',
      exact: true,
    })
  ).toBeVisible()
})

test('search opens its dialog with a focused textbox', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Search', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox')).toBeFocused()
})

test('governance evidence tabs pair panels and use roving tabindex', async ({
  page,
}) => {
  await page.goto('/')

  const tablist = governanceTabs(page)
  const tabs = tablist.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  await expect(tabs).toHaveText(['Govern', 'Trace', 'Ship'])
  await expect(tabs.nth(0)).toHaveAttribute('tabindex', '0')
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1')
  await expect(tabs.nth(2)).toHaveAttribute('tabindex', '-1')
  await expectOnlyTabSelected(page, 'Govern')

  for (let index = 0; index < 3; index += 1) {
    const tab = tabs.nth(index)
    const panelId = await tab.getAttribute('aria-controls')
    const tabId = await tab.getAttribute('id')

    expect(panelId).toBeTruthy()
    expect(tabId).toBeTruthy()
    await expect(page.locator(`#${panelId}`)).toHaveAttribute(
      'role',
      'tabpanel'
    )
    await expect(page.locator(`#${panelId}`)).toHaveAttribute(
      'aria-labelledby',
      tabId as string
    )
  }
})

test('governance evidence tabs support ArrowRight, Home, and End', async ({
  page,
}) => {
  await page.goto('/')
  await expectTabKeyboardNavigation(page)
})

test('forbidden proposal reports the real policy result', async ({ page }) => {
  await page.goto('/')

  const proposal = page.locator('button[aria-pressed]')
  const status = page.getByRole('status')
  await expect(proposal).toHaveCount(1)
  await expect(proposal).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('PASS · 0 findings')
  await expect(page.locator('.canopy-root')).toHaveAttribute(
    'data-stage',
    'ship'
  )

  await proposal.click()
  await expect(proposal).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('BLOCK · PT1004')
  await expect(page.getByRole('main')).toContainText(
    'Layer semantic cannot reference layer component.'
  )

  await proposal.click()
  await expect(proposal).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('PASS · 0 findings')
})

test('iPad touch contexts can use every branch without overflow', async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const context = await browser.newContext({
    ...devices['iPad Pro 11'],
    baseURL,
    viewport: { width: 834, height: 1112 },
  })

  try {
    const page = await context.newPage()
    await page.goto('/')

    const tabs = governanceTabs(page).getByRole('tab')
    await expect(tabs).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      await tabs.nth(index).tap()
      const name = ['Govern', 'Trace', 'Ship'][index] as
        'Govern' | 'Trace' | 'Ship'
      await expectOnlyTabSelected(page, name)
      const panelId = await tabs.nth(index).getAttribute('aria-controls')
      const expectedEvidence = [
        'PASS · 0 findings',
        'component.button.bg',
        'CSS',
      ][index]
      await expect(page.locator(`#${panelId}`)).toContainText(expectedEvidence)
    }

    await expectVisibleTouchTargets(page)
    await expectNoDocumentOverflow(page)
  } finally {
    await context.close()
  }
})

test('homepage stays contained in iPad landscape', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.goto('/')
  await expectNoDocumentOverflow(page)
})

test('governance evidence keeps AA contrast without fading text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expectReadableGovernanceText(page, 11)
})

for (const width of [320, 390]) {
  test(`compact governance graph stays readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')

    await expect(page.locator('.canopy-mobile-graph')).toBeVisible()
    await expect(page.locator('.canopy-svg')).toBeHidden()
    await expectReadableGovernanceText(page, 12)
    await expectNoDocumentOverflow(page)
    await expectHeroContentInsideViewport(page)
  })
}

test('reduced motion preserves the final tree and usable evidence', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const canopy = page
    .locator('[data-stage="ship"]')
    .filter({ has: governanceTabs(page) })
  await expect(canopy).toHaveCount(1)
  await expectTabKeyboardNavigation(page)

  const motion = page.locator('[data-motion]')
  await expect(motion).not.toHaveCount(0)
  const computedMotion = await motion.evaluateAll(elements =>
    elements.map(element => {
      const style = getComputedStyle(element)
      const toMilliseconds = (value: string) =>
        value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000

      return {
        durations: style.animationDuration.split(',').map(toMilliseconds),
        transitionDurations: style.transitionDuration
          .split(',')
          .map(toMilliseconds),
        transform: style.transform,
      }
    })
  )

  for (const { durations, transitionDurations, transform } of computedMotion) {
    expect(durations.every(duration => duration === 0)).toBe(true)
    expect(transitionDurations.every(duration => duration === 0)).toBe(true)
    expect(transform).toBe('none')
  }
})
