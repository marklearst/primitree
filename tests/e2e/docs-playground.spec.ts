import { devices, expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import sampleVariables from '../../apps/docs/lib/playground/sample-variables.json' with { type: 'json' }

const widths = [320, 375] as const
const pageHeading = 'Preview a variables export before you install the CLI.'

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

async function gotoPlayground(page: Page) {
  await page.goto('/playground')
  await expect(page.locator('.pg-shell')).toHaveAttribute(
    'data-hydrated',
    'true'
  )
}

async function expectEveryTouchTarget(locator: Locator) {
  const targets = await locator.evaluateAll(elements =>
    elements.map(element => {
      const box = element.getBoundingClientRect()
      return {
        label: element.textContent?.replace(/\s+/g, ' ').trim() || 'unlabelled',
        width: box.width,
        height: box.height,
      }
    })
  )

  expect(targets.length).toBeGreaterThan(0)
  expect(
    targets.filter(target => target.width < 44 || target.height < 44),
    'every playground control should be at least 44x44 CSS pixels'
  ).toEqual([])
}

async function expectVisibleOutline(locator: Locator) {
  const outline = await locator.evaluate(element => {
    const style = getComputedStyle(element)
    const accentProbe = document.createElement('span')
    accentProbe.style.color = 'var(--color-primitree-accent)'
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

async function expectTabPair(tab: Locator, panel: Locator) {
  const tabId = await tab.getAttribute('id')
  const panelId = await panel.getAttribute('id')

  expect(tabId).toBeTruthy()
  expect(panelId).toBeTruthy()
  await expect(tab).toHaveAttribute('aria-controls', panelId ?? '')
  await expect(panel).toHaveAttribute('aria-labelledby', tabId ?? '')
}

for (const width of widths) {
  test(`embedded playground starts with a usable page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await gotoPlayground(page)

    await expect(page.getByRole('main')).toHaveCount(1)
    const heading = page.getByRole('heading', {
      level: 1,
      name: pageHeading,
    })
    await expect(heading).toHaveCount(1)
    await expect(heading).toBeVisible()
    await expectEveryTouchTarget(page.locator('.pg-button'))
    await expectNoDocumentOverflow(page)
  })

  test(`embedded playground output is contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await gotoPlayground(page)

    await page.getByRole('button', { name: 'Try the sample' }).click()

    const heading = page.getByRole('heading', {
      level: 1,
      name: pageHeading,
    })
    await expect(heading).toHaveCount(1)
    await expect(heading).toHaveClass(/\bpg-visually-hidden\b/)
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

    const semanticGroup = page.getByRole('group', { name: 'semantic' })
    const densityGroup = page.getByRole('group', { name: 'density' })
    await expect(semanticGroup).toHaveCount(1)
    await expect(densityGroup).toHaveCount(1)

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
    await expectNoDocumentOverflow(page)

    await files.click()
    await expect(filesPanel).toBeVisible()
    const fileLayout = page.locator('.pg-files')
    const fileMetrics = await fileLayout.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: element.getBoundingClientRect().right,
    }))
    expect(
      fileMetrics.scrollWidth - fileMetrics.clientWidth
    ).toBeLessThanOrEqual(1)
    expect(fileMetrics.right).toBeLessThanOrEqual(width + 1)
    await expect(page.locator('.pg-file')).toHaveCount(12)
    await expectEveryTouchTarget(page.locator('.pg-button'))
    await expectEveryTouchTarget(page.locator('.pg-chip'))
    await expectEveryTouchTarget(page.locator('.pg-tab'))
    await expectEveryTouchTarget(page.locator('.pg-file'))
    await expectNoDocumentOverflow(page)
  })

  test(`warnings disclosure is touch and keyboard usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await gotoPlayground(page)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'warning-variables.json',
      mimeType: 'application/json',
      buffer: warningVariablesBuffer(),
    })

    const summary = page.locator('.pg-warnings > summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('warning')
    await expectEveryTouchTarget(summary)

    await page.getByRole('button', { name: 'Download pipeline (.zip)' }).focus()
    await page.keyboard.press('Tab')
    await expect(summary).toBeFocused()
    await expectVisibleOutline(summary)
    await expectNoDocumentOverflow(page)
  })
}

test('embedded playground tabs and context radios support the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await gotoPlayground(page)
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

  await expect(page.locator('.pg-contexts').getByRole('group')).toHaveCount(2)
  await expect(page.getByRole('radio')).toHaveCount(4)
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
    .locator('.pg-token-table tbody tr')
    .filter({ hasText: 'density.control.height' })
  const compactLabel = densityGroup
    .locator('label.pg-chip')
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

test('embedded playground announces malformed JSON', async ({ page }) => {
  await gotoPlayground(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })

  const alert = page.locator('.pg-error[role="alert"]')
  await expect(alert).toHaveCount(1)
  await expect(alert).toBeVisible()
  expect((await alert.textContent())?.trim().length).toBeGreaterThan(0)
})

test('touch contexts do not apply playground hover enhancements', async ({
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
    await gotoPlayground(page)
    expect(
      await page.evaluate(
        () => matchMedia('(hover: hover) and (pointer: fine)').matches
      )
    ).toBe(false)

    const playgroundLink = page.getByRole('link', { name: 'figma-vars build' })
    const footnoteLink = page.getByRole('link', { name: 'See build docs' })
    const ghostButton = page.getByRole('button', { name: 'Try the sample' })
    const ghostBackground = await ghostButton.evaluate(
      element => getComputedStyle(element).backgroundColor
    )

    await playgroundLink.hover({ force: true })
    await footnoteLink.hover({ force: true })
    await ghostButton.hover({ force: true })

    await expect(playgroundLink).toHaveCSS('text-decoration-line', 'none')
    await expect(footnoteLink).toHaveCSS('text-decoration-line', 'none')
    await expect(ghostButton).toHaveCSS('background-color', ghostBackground)
  } finally {
    await context.close()
  }
})

test('embedded playground preserves reduced-motion behavior', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoPlayground(page)

  const durations = await page.locator('.pg-dropzone').evaluate(element =>
    getComputedStyle(element)
      .transitionDuration.split(',')
      .map(value =>
        value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000
      )
  )

  expect(durations.every(duration => duration <= 0.01)).toBe(true)
})
