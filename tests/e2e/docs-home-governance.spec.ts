import { devices, expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const interactiveSelector =
  'a, button, summary, input, select, textarea, [role="button"]' as const

const proposalNames = [
  'Current graph',
  'Compliant alias',
  'Layer violations',
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
        const bar = element.closest('.proof-verdict-bar')
        const barTone = bar?.getAttribute('data-tone')
        const onPageGround =
          element.closest('.install-output, .governance-step') !== null
        const background =
          barTone === 'pass'
            ? [14, 31, 24]
            : barTone === 'fail'
              ? [30, 23, 22]
              : onPageGround
                ? [11, 15, 13]
                : [16, 21, 18]
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
  return page.getByRole('radiogroup', { name: 'Proposal' })
}

/** Clicks a proposal chip, retrying until React reflects the selection, so a
 * click that lands before hydration completes never strands the test. */
async function pickProposal(page: Page, name: ProposalName) {
  const chip = proposalGroup(page).getByRole('radio', { name })
  await expect(async () => {
    await chip.click()
    await expect(chip).toHaveAttribute('aria-checked', 'true', {
      timeout: 500,
    })
  }).toPass()
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
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Govern token change. Know what it reaches before it merges.',
    })
  ).toHaveCount(1)
  await expect(
    page.getByRole('link', { name: 'Run the quickstart' })
  ).toHaveAttribute('href', '/docs/getting-started')
  await expect(page.locator('.install-copy-row code')).toContainText(
    'npm install -D primitree@next'
  )
  await expect(page.locator('.install-output')).toContainText(
    'graph resolved · 15 tokens · 3 layers'
  )
  await expect(page.locator('.proof-verdict')).toHaveText('PASS 0 findings')
  await expect(page.getByRole('main')).toContainText('color.bg.brand')
  await expect(page.locator('.proof-command')).toContainText(
    '# proposal: current'
  )
  await expect(page.getByRole('main')).toContainText('button.bg')
  await expect(page.getByRole('main')).toContainText('focus.ring')
  await expect(page.getByRole('main')).toContainText('nav.active.bg')
  await expect(page.locator('.proof-count')).toHaveText('15 tokens · 3 layers')
})

test('desktop navigation exposes documentation, search, GitHub, and the version', async ({
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
  await expect(page.locator('.site-version')).toHaveText(/^v\d+\.\d+\.\d+/)
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

test('layer violations report the real policy result', async ({ page }) => {
  await page.goto('/')

  const status = page.getByRole('status')
  await expect(status).toHaveText('PASS 0 findings')

  await pickProposal(page, 'Layer violations')
  await expect(status).toHaveText('FAIL 3 findings · layer-skip')
  await expect(page.locator('.proof-detail')).toContainText(
    'component may only reference semantic.'
  )
  await expect(page.locator(".graph-edge[data-tone='violation']")).toHaveCount(
    3
  )
  await expect(page.locator('.graph-violation-tag')).toContainText(
    '3 × layer-skip'
  )

  await pickProposal(page, 'Current graph')
  await expect(status).toHaveText('PASS 0 findings')
})

test('compliant alias repoints the governed token in the graph', async ({
  page,
}) => {
  await page.goto('/')

  await pickProposal(page, 'Compliant alias')
  await expect(page.locator('.proof-verdict')).toHaveText('PASS 0 findings')
  await expect(page.locator('.graph-svg')).toContainText('green.500')
  await expect(page.locator('.graph-svg')).toContainText('→ {green.500}')
})

test('rename swaps the governed path and marks its consumers', async ({
  page,
}) => {
  await page.goto('/')

  await pickProposal(page, 'Rename')
  await expect(page.locator('.proof-verdict')).toHaveText(
    'PASS 5 changes · 0 findings'
  )
  await expect(page.locator('.graph-svg')).toContainText('color.bg.primary')
  await expect(page.locator(".graph-node[data-flag='changed']")).toHaveCount(3)
})

test('clicking a graph node inspects it in the verdict bar', async ({
  page,
}) => {
  await page.goto('/')

  const brandNode = page.locator(
    ".graph-node[aria-label^='semantic.color.bg.brand']"
  )
  await expect(async () => {
    await brandNode.click()
    await expect(brandNode).toHaveAttribute('aria-pressed', 'true', {
      timeout: 500,
    })
  }).toPass()
  await expect(page.locator('.proof-detail')).toContainText(
    'owner product-design · 3 consumers'
  )

  await page.keyboard.press('Escape')
  await expect(brandNode).toHaveAttribute('aria-pressed', 'false')
})

test('keyboard focus traces the dependency chain', async ({ page }) => {
  await page.goto('/')

  const brandNode = page.locator(
    ".graph-node[aria-label^='semantic.color.bg.brand']"
  )
  await expect(async () => {
    await brandNode.blur()
    await brandNode.focus()
    await expect(
      page.locator(".graph-edge[data-tone='active']").first()
    ).toBeVisible({ timeout: 500 })
  }).toPass()
  await page.keyboard.press('Enter')
  await expect(brandNode).toHaveAttribute('aria-pressed', 'true')
})

test('the install card switches package managers', async ({ page }) => {
  await page.goto('/')

  const tabs = page.getByRole('radiogroup', { name: 'Package manager' })
  await tabs.getByRole('radio', { name: 'pnpm' }).click()
  await expect(page.locator('.install-copy-row code')).toContainText(
    'pnpm add -D primitree@next'
  )
  await expect(
    page.getByRole('button', { name: 'Copy the pnpm install command' })
  ).toBeVisible()
})

test('diff terminal lists the rename blast radius', async ({ page }) => {
  await page.goto('/')

  const terminal = page.locator('.governance-diff-grid .terminal')
  await expect(terminal).toContainText('removed semantic.color.bg.brand')
  await expect(terminal).toContainText('added semantic.color.bg.primary')
  await expect(terminal).toContainText('Affected tokens:')
  await expect(terminal).toContainText('component.nav.active.bg')
})

test('graph labels never overflow their node boxes', async ({ page }) => {
  await page.goto('/')

  const overflowing = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.graph-node'))
    return nodes.filter(node => {
      const box = node.querySelector('.graph-node-box')
      const labels = Array.from(node.querySelectorAll('text'))
      if (!(box instanceof SVGGraphicsElement)) {
        return true
      }
      const limit = box.getBBox().x + box.getBBox().width - 8
      return labels.some(label => {
        if (!(label instanceof SVGGraphicsElement)) {
          return true
        }
        const bounds = label.getBBox()
        return bounds.x + bounds.width > limit
      })
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
      const chip = chips.nth(index)
      await expect(async () => {
        await chip.tap()
        await expect(chip).toHaveAttribute('aria-checked', 'true', {
          timeout: 500,
        })
      }).toPass()
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
    '.proof-command > code',
    '.proof-verdict',
    '.proof-detail',
    '.install-copy-row code',
    '.install-output p',
    '.governance-step code',
    '.terminal code',
  ])
})

for (const width of [320, 390]) {
  test(`compact governance panel stays readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')

    await expect(page.locator('.graph-svg')).toBeVisible()
    await expectReadableGovernanceText(page, 12, [
      '.proof-verdict',
      '.proof-detail',
      '.install-copy-row code',
      '.terminal code',
    ])
    await expectNoDocumentOverflow(page)
    await expectHeroContentInsideViewport(page)
  })
}

test('the graph scrolls in its own container on compact screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const scroll = page.locator('.graph-scroll')
  const scrollable = await scroll.evaluate(
    element => element.scrollWidth > element.clientWidth
  )
  expect(scrollable).toBe(true)
  await expectNoDocumentOverflow(page)
})

test('reduced motion preserves the graph and usable evidence', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('.graph-svg')).toBeVisible()
  await expectChipKeyboardNavigation(page)

  const frameDurations = await page
    .locator('.graph-frame')
    .evaluateAll(elements =>
      elements.map(element => {
        const value = getComputedStyle(element).animationDuration
        return value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000
      })
    )
  for (const duration of frameDurations) {
    expect(duration).toBeLessThanOrEqual(50)
  }
})

test('theme toggle swaps the page between dark and light', async ({ page }) => {
  await page.goto('/')

  const toggle = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .locator('.site-theme-toggle')
  await expect(toggle).toBeVisible()

  await expect(async () => {
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light', {
      timeout: 500,
    })
  }).toPass()

  const lightBackground = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor.replace(/\s/gu, '')
  )
  expect(lightBackground).toBe('rgb(246,250,248)')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
