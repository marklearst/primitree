import { devices, expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const interactiveSelector =
  'a, button, summary, input, select, textarea' as const

const proposalNames = [
  'Current graph',
  'Compliant alias',
  'Layer violation',
  'Rename',
] as const

type ProposalName = (typeof proposalNames)[number]

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
    .locator('.governance-hero h1, .governance-hero-lede')
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
          (box.width >= 43.5 && box.height >= 43.5)
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
  minimumFontSize: number,
  selectors: readonly string[]
) {
  const evidence = await page
    .locator(selectors.join(', '))
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
        const foreground = parseRgb(style.color)
        const inNode = element.closest('.tree-node') !== null
        const inTrunkBand =
          !inNode && element.closest('.tree-band-trunk') !== null
        const inEmitted = element.closest('.proof-emitted') !== null
        const background = inNode
          ? [15, 15, 18]
          : inTrunkBand
            ? [24, 27, 18]
            : inEmitted
              ? [3, 3, 4]
              : [8, 8, 10]
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

function proposalGroup(page: Page) {
  return page.getByRole('radiogroup', { name: 'Governance proposals' })
}

async function expectOnlyProposalChecked(page: Page, selected: ProposalName) {
  const chips = proposalGroup(page).getByRole('radio')

  for (let index = 0; index < proposalNames.length; index += 1) {
    const chip = chips.nth(index)
    const isSelected = proposalNames[index] === selected

    await expect(chip).toHaveAttribute(
      'aria-checked',
      isSelected ? 'true' : 'false'
    )
    await expect(chip).toHaveAttribute('tabindex', isSelected ? '0' : '-1')
  }
}

async function expectChipKeyboardNavigation(page: Page) {
  const group = proposalGroup(page)
  const current = group.getByRole('radio', { name: 'Current graph' })
  const alias = group.getByRole('radio', { name: 'Compliant alias' })
  const rename = group.getByRole('radio', { name: 'Rename' })

  await current.focus()
  await page.keyboard.press('ArrowRight')
  await expect(alias).toBeFocused()
  await expectOnlyProposalChecked(page, 'Compliant alias')

  await page.keyboard.press('End')
  await expect(rename).toBeFocused()
  await expectOnlyProposalChecked(page, 'Rename')

  await page.keyboard.press('Home')
  await expect(current).toBeFocused()
  await expectOnlyProposalChecked(page, 'Current graph')

  await page.keyboard.press('ArrowLeft')
  await expect(rename).toBeFocused()
  await expectOnlyProposalChecked(page, 'Rename')
}

test('homepage leads with truthful governance', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hero-terminal')).toContainText(
    'Check passed for source "brand" with 8 tokens.'
  )
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Change review for design tokens.',
    })
  ).toHaveCount(1)
  await expect(
    page.getByRole('link', { name: 'Run the quickstart' })
  ).toHaveAttribute('href', '/docs/getting-started')
  await expect(page.locator('.hero-install code')).toHaveText(
    'npx primitree@next check'
  )
  await expect(page.locator('.proof-verdict')).toHaveText('PASS · 0 findings')
  await expect(page.getByRole('main')).toContainText('semantic.color.bg.brand')
  await expect(page.getByRole('main')).toContainText('component.button.bg')
  await expect(page.getByRole('main')).toContainText('component.focus.ring')
  await expect(page.getByRole('main')).toContainText('component.nav.active.bg')
  await expect(page.locator('.proof-emitted')).toContainText(
    'var(--primitives-color-blue-500)'
  )
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

test('proposal chips form a radiogroup with roving tabindex', async ({
  page,
}) => {
  await page.goto('/')

  const chips = proposalGroup(page).getByRole('radio')
  await expect(chips).toHaveCount(4)
  await expect(chips).toHaveText([...proposalNames])
  await expectOnlyProposalChecked(page, 'Current graph')
})

test('proposal chips support ArrowRight, Home, and End', async ({ page }) => {
  await page.goto('/')
  await expectChipKeyboardNavigation(page)
})

test('layer violation reports the real policy result', async ({ page }) => {
  await page.goto('/')

  const status = page.getByRole('status')
  await expect(status).toHaveText('PASS · 0 findings')

  await proposalGroup(page)
    .getByRole('radio', { name: 'Layer violation' })
    .click()
  await expect(status).toHaveText('BLOCK · PT1004')
  await expect(page.locator('.proof-detail')).toHaveText(
    'Layer semantic cannot reference layer component.'
  )
  await expect(page.locator('.proof-blocked')).toBeVisible()
  await expect(page.locator('.tree')).toHaveAttribute(
    'data-outcome',
    'violation'
  )

  await proposalGroup(page)
    .getByRole('radio', { name: 'Current graph' })
    .click()
  await expect(status).toHaveText('PASS · 0 findings')
})

test('compliant alias updates the emitted code', async ({ page }) => {
  await page.goto('/')

  await proposalGroup(page)
    .getByRole('radio', { name: 'Compliant alias' })
    .click()
  await expect(page.locator('.proof-emitted')).toContainText(
    'var(--primitives-color-green-500)'
  )
  await expect(page.locator('.tree-source-node')).toContainText(
    'primitives.color.green.500'
  )
})

test('diff terminal lists the rename blast radius', async ({ page }) => {
  await page.goto('/')

  const terminal = page.locator('.governance-diff-grid .terminal')
  await expect(terminal).toContainText('removed semantic.color.bg.brand')
  await expect(terminal).toContainText('added semantic.color.bg.primary')
  await expect(terminal).toContainText('Affected tokens:')
  await expect(terminal).toContainText('component.nav.active.bg')
})

test('tree nodes never overflow their boxes', async ({ page }) => {
  await page.goto('/')

  const overflowing = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.tree-node code'))
    return nodes.filter(node => {
      const parent = node.closest('.tree-node')
      return (
        parent !== null &&
        node.getBoundingClientRect().right >
          parent.getBoundingClientRect().right + 0.5
      )
    }).length
  })
  expect(overflowing).toBe(0)
})

test('homepage has no sticky scroll choreography', async ({ page }) => {
  await page.goto('/')

  const sticky = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('main *')).filter(
        element => getComputedStyle(element).position === 'sticky'
      ).length
  )
  expect(sticky).toBe(0)
  await expect(page.locator('[data-stage]')).toHaveCount(0)
})

test('iPad touch contexts can use every proposal without overflow', async ({
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

    const chips = proposalGroup(page).getByRole('radio')
    await expect(chips).toHaveCount(4)
    for (let index = 0; index < proposalNames.length; index += 1) {
      await chips.nth(index).tap()
      await expectOnlyProposalChecked(
        page,
        proposalNames[index] as ProposalName
      )
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
  await expectReadableGovernanceText(page, 11, [
    '.tree-band-label',
    '.tree-node-kicker',
    '.tree-node code',
    '.proof-verdict',
    '.proof-detail',
    '.proof-emitted-label',
    '.proof-emitted code',
    '.proof-owner code',
    '.terminal code',
  ])
})

for (const width of [320, 390]) {
  test(`compact governance panel stays readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')

    await expect(page.locator('.tree')).toBeVisible()
    await expectReadableGovernanceText(page, 12, [
      '.tree-node code',
      '.proof-verdict',
      '.proof-detail',
      '.proof-emitted code',
      '.terminal code',
    ])
    await expectNoDocumentOverflow(page)
    await expectHeroContentInsideViewport(page)
  })
}

test('reduced motion preserves the tree and usable evidence', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('.tree')).toBeVisible()
  await expect(page.locator('.tree-head-brand svg')).toBeVisible()
  await expectChipKeyboardNavigation(page)

  const spineDurations = await page
    .locator('.tree-spine-alias')
    .evaluateAll(elements =>
      elements.map(element => {
        const value = getComputedStyle(element).animationDuration
        return value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000
      })
    )
  for (const duration of spineDurations) {
    expect(duration).toBeLessThanOrEqual(50)
  }
})
