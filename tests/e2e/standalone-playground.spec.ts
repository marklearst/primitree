import { devices, expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import sampleVariables from '../../apps/playground/src/sample-variables.json' with { type: 'json' }

const widths = [320, 375] as const
const pageHeading = 'Drop your Figma variables. Leave with a token pipeline.'
const interactiveSelector =
  'a[href], button, summary, label:has(input[type="radio"])'

function warningVariablesBuffer() {
  const payload = structuredClone(sampleVariables) as unknown as {
    meta: {
      variables: Record<string, { valuesByMode: Record<string, unknown> }>
    }
  }
  const colorVariable = payload.meta.variables['VariableID:1:102']

  if (!colorVariable) {
    throw new Error('The local sample is missing its warning color variable')
  }

  colorVariable.valuesByMode['1:0'] = 'not-a-color'
  return Buffer.from(JSON.stringify(payload))
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )

  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectInsideViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth + 1
  )
}

async function expectEveryVisibleInteractiveTarget(page: Page, width: number) {
  const failures = await page.locator(interactiveSelector).evaluateAll(
    (elements, viewportWidth) =>
      elements.flatMap(element => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0

        if (!visible) {
          return []
        }

        const label =
          element.getAttribute('aria-label') ||
          element.textContent?.replace(/\s+/g, ' ').trim() ||
          element.querySelector('img[alt]')?.getAttribute('alt') ||
          element.getAttribute('href') ||
          'unlabelled'
        const issues = []

        if (box.width < 44 || box.height < 44) {
          issues.push(
            `${element.tagName.toLowerCase()} "${label}" is ${box.width.toFixed(1)}x${box.height.toFixed(1)}`
          )
        }
        if (box.x < 0 || box.right > viewportWidth + 1) {
          issues.push(
            `${element.tagName.toLowerCase()} "${label}" spans ${box.x.toFixed(1)}..${box.right.toFixed(1)}`
          )
        }

        return issues
      }),
    width
  )

  expect(
    failures,
    'every visible interactive target should be at least 44x44 CSS pixels and remain inside the viewport'
  ).toEqual([])
}

async function expectPersistentPageStructure(page: Page) {
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(
    page.getByRole('heading', { level: 1, name: pageHeading })
  ).toHaveCount(1)
}

async function expectVisibleOutline(locator: Locator) {
  const outline = await locator.evaluate(element => {
    const style = getComputedStyle(element)
    const accentProbe = document.createElement('span')
    accentProbe.style.color = 'var(--accent)'
    document.body.append(accentProbe)
    const accentColor = getComputedStyle(accentProbe).color
    accentProbe.remove()

    return {
      accentColor,
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    }
  })

  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThanOrEqual(2)
  expect(outline.color).toBe(outline.accentColor)
}

async function expectTabPair(tab: Locator, panel: Locator) {
  const tabId = await tab.getAttribute('id')
  const panelId = await panel.getAttribute('id')

  expect(tabId).toMatch(/^standalone-/)
  expect(panelId).toMatch(/^standalone-/)
  await expect(tab).toHaveAttribute('aria-controls', panelId ?? '')
  await expect(panel).toHaveAttribute('aria-labelledby', tabId ?? '')
}

async function expectTabState(
  activeTab: Locator,
  inactiveTab: Locator,
  activePanel: Locator,
  inactivePanel: Locator
) {
  await expect(activeTab).toBeFocused()
  await expect(activeTab).toHaveAttribute('aria-selected', 'true')
  await expect(activeTab).toHaveAttribute('tabindex', '0')
  await expect(inactiveTab).toHaveAttribute('aria-selected', 'false')
  await expect(inactiveTab).toHaveAttribute('tabindex', '-1')
  await expect(activePanel).toBeVisible()
  await expect(inactivePanel).toBeHidden()
}

for (const width of widths) {
  test(`standalone playground starts with a usable page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')

    await expectPersistentPageStructure(page)
    await expect(
      page.getByRole('heading', { level: 1, name: pageHeading })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'target',
      '_blank'
    )
    await expect(page.getByRole('link', { name: 'npm' })).toHaveAttribute(
      'target',
      '_blank'
    )
    await expect(
      page.getByRole('link', { name: '@figmavars' })
    ).toHaveAttribute('target', '_blank')
    await expectInsideViewport(page.locator('.brand'), width)
    await expectInsideViewport(page.locator('.header-links'), width)
    await expectInsideViewport(page.locator('.footer'), width)
    await expectEveryVisibleInteractiveTarget(page, width)
    await expectNoDocumentOverflow(page)
  })

  test(`standalone playground output is contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the sample' }).click()

    await expectPersistentPageStructure(page)
    const heading = page.getByRole('heading', {
      level: 1,
      name: pageHeading,
    })
    await expect(heading).toHaveClass(/\bvisually-hidden\b/)
    const headingBox = await heading.boundingBox()
    expect(headingBox).not.toBeNull()
    expect(headingBox?.width).toBeLessThanOrEqual(1)
    expect(headingBox?.height).toBeLessThanOrEqual(1)
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'sample-variables.json',
      })
    ).toBeVisible()

    const tokens = page.getByRole('tab', { name: 'Tokens' })
    const files = page.getByRole('tab', { name: 'Generated files' })
    const tokensPanel = page.getByRole('tabpanel', {
      name: 'Tokens',
      includeHidden: true,
    })
    const filesPanel = page.getByRole('tabpanel', {
      name: 'Generated files',
      includeHidden: true,
    })

    await expect(tokensPanel).toHaveCount(1)
    await expect(filesPanel).toHaveCount(1)
    await expect(tokensPanel).toBeVisible()
    await expect(filesPanel).toBeHidden()
    await expect(page.getByRole('group', { name: 'semantic' })).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'density' })).toHaveCount(1)

    const tableRegion = page.getByRole('region', { name: 'Generated tokens' })
    await expect(tableRegion).toHaveAttribute('tabindex', '0')
    const tableMetrics = await tableRegion.evaluate(element => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }
    })
    expect(tableMetrics.left).toBeGreaterThanOrEqual(0)
    expect(tableMetrics.right).toBeLessThanOrEqual(width + 1)
    expect(tableMetrics.scrollWidth).toBeGreaterThan(tableMetrics.clientWidth)
    expect(['auto', 'scroll']).toContain(tableMetrics.overflowX)
    await tokens.focus()
    await page.keyboard.press('Tab')
    await expect(tableRegion).toBeFocused()
    await expectVisibleOutline(tableRegion)

    await expectInsideViewport(page.locator('.brand'), width)
    await expectInsideViewport(page.locator('.header-links'), width)
    await expectInsideViewport(page.locator('.report-actions'), width)
    await expectInsideViewport(page.locator('.contexts'), width)
    await expectInsideViewport(page.locator('.footer'), width)
    await expectEveryVisibleInteractiveTarget(page, width)
    await expectNoDocumentOverflow(page)

    await files.click()
    await expect(filesPanel).toBeVisible()
    await expect(tokensPanel).toBeHidden()
    const fileLayout = page.locator('.files')
    const fileMetrics = await fileLayout.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }))
    expect(
      fileMetrics.scrollWidth - fileMetrics.clientWidth
    ).toBeLessThanOrEqual(1)
    expect(fileMetrics.left).toBeGreaterThanOrEqual(0)
    expect(fileMetrics.right).toBeLessThanOrEqual(width + 1)
    await expect(page.locator('.file')).toHaveCount(12)
    await expectEveryVisibleInteractiveTarget(page, width)
    await expectNoDocumentOverflow(page)

    await tokens.click()
    await expect(tokensPanel).toBeVisible()
    await expect(filesPanel).toBeHidden()
    await expectEveryVisibleInteractiveTarget(page, width)
    await expectNoDocumentOverflow(page)
  })

  test(`standalone warnings disclosure is usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'warning-variables.json',
      mimeType: 'application/json',
      buffer: warningVariablesBuffer(),
    })

    await expectPersistentPageStructure(page)
    const summary = page.locator('.warnings > summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('warning')
    await expectInsideViewport(summary, width)
    await page.getByRole('button', { name: 'Download pipeline (.zip)' }).focus()
    await page.keyboard.press('Tab')
    await expect(summary).toBeFocused()
    await expectVisibleOutline(summary)
    await expectEveryVisibleInteractiveTarget(page, width)
    await expectNoDocumentOverflow(page)
  })
}

test('standalone tabs and context radios support the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the sample' }).click()

  const tablist = page.getByRole('tablist', { name: 'Preview output' })
  const tokens = page.getByRole('tab', { name: 'Tokens' })
  const files = page.getByRole('tab', { name: 'Generated files' })
  const tokensPanel = page.getByRole('tabpanel', {
    name: 'Tokens',
    includeHidden: true,
  })
  const filesPanel = page.getByRole('tabpanel', {
    name: 'Generated files',
    includeHidden: true,
  })

  await expect(tablist).toHaveCount(1)
  await expect(tokensPanel).toHaveCount(1)
  await expect(filesPanel).toHaveCount(1)
  await expectTabPair(tokens, tokensPanel)
  await expectTabPair(files, filesPanel)
  await expect(tokens).toHaveAttribute('aria-selected', 'true')
  await expect(tokens).toHaveAttribute('tabindex', '0')
  await expect(files).toHaveAttribute('aria-selected', 'false')
  await expect(files).toHaveAttribute('tabindex', '-1')
  await expect(tokensPanel).toBeVisible()
  await expect(filesPanel).toBeHidden()

  await tokens.focus()
  await tokens.press('ArrowRight')
  await expectTabState(files, tokens, filesPanel, tokensPanel)
  await files.press('ArrowRight')
  await expectTabState(tokens, files, tokensPanel, filesPanel)
  await tokens.press('ArrowLeft')
  await expectTabState(files, tokens, filesPanel, tokensPanel)
  await files.press('Home')
  await expectTabState(tokens, files, tokensPanel, filesPanel)
  await tokens.press('End')
  await expectTabState(files, tokens, filesPanel, tokensPanel)
  await files.press('ArrowLeft')
  await expectTabState(tokens, files, tokensPanel, filesPanel)
  await expectVisibleOutline(tokens)

  const semanticGroup = page.getByRole('group', { name: 'semantic' })
  const densityGroup = page.getByRole('group', { name: 'density' })
  const light = semanticGroup.getByRole('radio', { name: 'light' })
  const dark = semanticGroup.getByRole('radio', { name: 'dark' })
  const comfortable = densityGroup.getByRole('radio', {
    name: 'comfortable',
  })
  const compact = densityGroup.getByRole('radio', { name: 'compact' })

  await expect(page.locator('.contexts').getByRole('group')).toHaveCount(2)
  await expect(page.getByRole('radio')).toHaveCount(4)
  await expect(light).toHaveAttribute('name', 'standalone-context-semantic')
  await expect(dark).toHaveAttribute('name', 'standalone-context-semantic')
  await expect(comfortable).toHaveAttribute(
    'name',
    'standalone-context-density'
  )
  await expect(compact).toHaveAttribute('name', 'standalone-context-density')
  await expect(light).toBeChecked()
  await expect(dark).not.toBeChecked()
  await expect(comfortable).toBeChecked()
  await expect(compact).not.toBeChecked()
  for (const radio of [light, dark, comfortable, compact]) {
    await expect(radio).toBeEnabled()
    await expect(radio).not.toHaveAttribute('tabindex', '-1')
    const style = await radio.evaluate(element => {
      const computed = getComputedStyle(element)
      return { display: computed.display, visibility: computed.visibility }
    })
    expect(style.display).not.toBe('none')
    expect(style.visibility).not.toBe('hidden')
  }

  const densityRow = page
    .locator('.token-table tbody tr')
    .filter({ hasText: 'density.control.height' })
  const compactLabel = densityGroup
    .locator('label.chip')
    .filter({ hasText: 'compact' })
  await expect(densityRow).toContainText('40px')
  await comfortable.focus()
  await comfortable.press('ArrowRight')
  await expect(compact).toBeFocused()
  await expect(compact).toBeChecked()
  await expect(comfortable).not.toBeChecked()
  await expect(densityRow).toContainText('32px')
  await expectVisibleOutline(compactLabel)
  await compact.press('ArrowLeft')
  await expect(comfortable).toBeFocused()
  await expect(comfortable).toBeChecked()
  await expect(densityRow).toContainText('40px')
  await compactLabel.click()
  await expect(compact).toBeChecked()
  await expect(densityRow).toContainText('32px')
})

test('standalone playground announces malformed JSON', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })

  const alert = page.locator('.error[role="alert"]')
  await expect(alert).toHaveCount(1)
  await expect(alert).toBeVisible()
  expect((await alert.textContent())?.trim().length).toBeGreaterThan(0)
})

test('touch contexts do not apply standalone hover enhancements', async ({
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

    await page.getByRole('button', { name: 'Try the sample' }).click()
    await page.getByRole('tab', { name: 'Generated files' }).click()

    const targets = [
      page.getByRole('link', { name: 'GitHub' }),
      page.getByRole('link', { name: '@figmavars' }),
      page.getByRole('button', { name: 'Start over' }),
      page.getByRole('button', { name: 'Download pipeline (.zip)' }),
      page.locator('label.chip').first(),
      page.locator('.file').first(),
    ]

    for (const target of targets) {
      const before = await target.evaluate(element => {
        const style = getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          color: style.color,
          textDecoration: style.textDecorationLine,
          transform: style.transform,
        }
      })
      await target.hover({ force: true })
      const after = await target.evaluate(element => {
        const style = getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          color: style.color,
          textDecoration: style.textDecorationLine,
          transform: style.transform,
        }
      })

      expect(after).toEqual(before)
    }
  } finally {
    await context.close()
  }
})

test('standalone playground collapses every duration for reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the sample' }).click()

  const offenders = await page.locator('body').evaluate(() => {
    const toSeconds = (value: string) =>
      value.endsWith('ms')
        ? Number.parseFloat(value) / 1000
        : Number.parseFloat(value)

    return [...document.querySelectorAll('*')].flatMap(element => {
      const style = getComputedStyle(element)
      const durations = [
        ...style.transitionDuration.split(',').map(toSeconds),
        ...style.animationDuration.split(',').map(toSeconds),
      ]

      if (durations.every(duration => duration <= 0.001)) {
        return []
      }

      return [
        `${element.tagName.toLowerCase()}.${element.className}: ${durations.join(', ')}`,
      ]
    })
  })

  expect(offenders).toEqual([])
  await expect(page.locator('html')).not.toHaveCSS('scroll-behavior', 'smooth')
  await expect(page.getByRole('button', { name: 'Start over' })).toHaveCSS(
    'transform',
    'none'
  )
})
