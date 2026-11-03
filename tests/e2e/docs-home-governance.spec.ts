import { readFileSync } from 'node:fs'
import { devices, expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import siteCli from '../../apps/docs/lib/landing/site-cli.json' with { type: 'json' }
import {
  cssColor,
  signalCollisions,
  solvePrimitives,
  underInk,
} from '../../apps/docs/lib/tokens/solver.ts'
import { SETTLE_MS } from '../../apps/docs/lib/tokens/page-store.ts'
import {
  COMPILED_KEY,
  HUE_KEY,
  STORAGE_KEY,
} from '../../apps/docs/lib/tokens/theme-script.ts'
import siteGraph from '../../apps/docs/tokens/generated/graph.json' with { type: 'json' }
import themeConfig from '../../apps/docs/tokens/theme.config.json' with { type: 'json' }

test.describe.configure({ timeout: 60_000 })

const BRAND_HUE = themeConfig.hue
const BRAND_45 = '--primitives-color-brand-45'
const CHECK_TIMEOUT = { timeout: 20_000 }
const IDLE_CHAIN =
  'Point at any token, the primary button, an underlined link, or a code panel.'
const copyFailure =
  'Copy failed: your browser blocked the clipboard. Select the text and copy it by hand.'

const managers = [
  {
    name: 'npm',
    value: 'npm',
    install: 'npm install -D @primitree/cli@next',
    run: 'npx primitree',
  },
  {
    name: 'pnpm',
    value: 'pnpm',
    install: 'pnpm add -D @primitree/cli@next',
    run: 'pnpm exec primitree',
  },
  {
    name: 'Yarn',
    value: 'yarn',
    install: 'yarn add -D @primitree/cli@next',
    run: 'yarn primitree',
  },
  {
    name: 'Bun',
    value: 'bun',
    install: 'bun add -d @primitree/cli@next',
    run: 'bunx primitree',
  },
] as const

const presets = [
  { name: 'Ultramarine', hue: 265 },
  { name: 'Citrus', hue: 110 },
  { name: 'Signal red', hue: 27 },
  { name: 'Greenshield', hue: BRAND_HUE },
] as const

const breaks = [
  {
    id: 'literal',
    code: 'PT1003',
    name: 'Wrong value form',
    label: 'Hard-code the accent',
    recording: 'break-literal',
    finding: 'PT1003 semantic.accent.solid',
    owners: 'product-design',
  },
  {
    id: 'skip',
    code: 'PT1004',
    name: 'Reference not allowed',
    label: 'Skip a layer',
    recording: 'break-skip',
    finding: 'PT1004 component.link.text',
    owners: 'design-systems',
  },
  {
    id: 'stray',
    code: 'PT1001',
    name: 'Token outside every layer',
    label: 'Add a stray token',
    recording: 'break-stray',
    finding: 'PT1001 brand.accent',
    owners: 'design-systems',
  },
  {
    id: 'owner',
    code: 'PT1005',
    name: 'No owner',
    label: 'Remove the default owner',
    recording: 'break-owner',
    finding: 'PT1005 component.',
    owners: 'none',
  },
] as const

const tokens = siteGraph.tokens
const tokenCount = tokens.length

function tokenAt(path: string) {
  const token = tokens.find(item => item.path === path)
  if (token === undefined) {
    throw new Error(`The token file has no ${path}.`)
  }
  return token
}

const cssVar = (path: string) => `--${path.split('.').join('-')}`

/** The token and everything it reads, in reference order. */
function chainOf(path: string, theme: 'light' | 'dark' = 'light') {
  const steps = [path]
  let next = tokenAt(path).target[theme]
  while (next !== null) {
    steps.push(next)
    next = tokenAt(next).target[theme]
  }
  return steps
}

/** How many tokens read a token, directly or through another token. */
function reachOf(path: string, theme: 'light' | 'dark' = 'light') {
  const reached = new Set<string>()
  const visit = (target: string) => {
    for (const token of tokens) {
      if (token.target[theme] === target && !reached.has(token.path)) {
        reached.add(token.path)
        visit(token.path)
      }
    }
  }
  visit(path)
  return reached.size
}

/** The primitives the page writes for a hue, from the same solver. */
const solved = (hue: number) =>
  solvePrimitives(hue, {
    brandChroma: themeConfig.brandChroma,
    neutralTint: themeConfig.neutralTint,
  })

function brandAt(hue: number, step: string) {
  const color = solved(hue).brand[step]
  if (color === undefined) {
    throw new Error(`The solver wrote no brand.${step}.`)
  }
  return color
}

function neutralAt(hue: number, step: string) {
  const color = solved(hue).neutral[step]
  if (color === undefined) {
    throw new Error(`The solver wrote no neutral.${step}.`)
  }
  return color
}

/** The color a solid button takes at a hue in the light theme, on its route. */
const solidAt = (hue: number) => brandAt(hue, underInk(hue) ? '85' : '45')
const labelAt = (hue: number) => neutralAt(hue, underInk(hue) ? '8' : '100')

const html = (page: Page) => page.locator('html')
const hueDial = (page: Page) => page.getByRole('slider', { name: 'Brand hue' })
const heroButton = (page: Page) =>
  page.locator('.hero').getByRole('link', { name: 'Read the quickstart' })
const closeBand = (page: Page) => page.locator('.close')
const presetButton = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Hue presets' })
    .getByRole('button', { name, exact: true })
const crownSwitch = (page: Page, name: string) =>
  page.locator('.crown').getByRole('switch', { name, exact: true })
const ruleRow = (page: Page, code: string) =>
  page.locator(`#${code.toLowerCase()}`)
const ruleSwitch = (page: Page, code: string) =>
  ruleRow(page, code).getByRole('switch')
const ruleLink = (page: Page) => ruleRow(page, 'PT1004').locator('.text-link')
const island = (page: Page) => page.locator('.island-text')
const buildLine = (page: Page) => page.locator('.close-colophon')
const graphChain = (page: Page) => page.locator('#graph-chain')
const activeGraph = (page: Page) =>
  page.locator('.graph-svg').filter({ visible: true })
const graphNode = (page: Page, path: string) =>
  activeGraph(page).locator(`.graph-node[data-path="${path}"]`)
const readout = (page: Page, label: string) =>
  page.locator('.crown-readout div').filter({ hasText: label }).locator('dd')

async function seedCompiled(page: Page) {
  await page.addInitScript(key => {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // A blank document has no storage to seed.
    }
  }, COMPILED_KEY)
}

/** Waits for the store to mount, which happens as the controls hydrate. */
async function expectHydrated(page: Page) {
  await expect(page.locator('.crown-readout .for-light')).toHaveCount(0)
  await expect(page.locator('.crown-readout dd').first()).toBeVisible()
}

/** Opens the homepage past the compile, which dims the page for two seconds. */
async function openHome(page: Page) {
  await seedCompiled(page)
  await page.goto('/')
  await expectHydrated(page)
}

/** Every value as sRGB channels and alpha. The bundler decides whether a
 * stylesheet holds oklch() or lab(), so colors compare by what they paint and
 * never by how the browser spells them. */
function paint(page: Page, values: readonly string[]) {
  return page.evaluate(colors => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) {
      throw new Error('This browser gave no canvas context.')
    }
    return colors.map(color => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    })
  }, values)
}

const computed = (locator: Locator, property: string) =>
  locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property
  )

async function paintedGap(
  locator: Locator,
  property: string,
  expected: string
) {
  const value = await computed(locator, property)
  const [actual = [], wanted = []] = await paint(locator.page(), [
    value,
    expected,
  ])
  return Math.max(
    ...actual.map((channel, index) => Math.abs(channel - (wanted[index] ?? 0)))
  )
}

/** Asserts a computed color paints `expected`. Two channels of slack cover the
 * rounding between a color space and 8-bit sRGB. */
async function expectPaints(
  locator: Locator,
  property: string,
  expected: string
) {
  await expect
    .poll(() => paintedGap(locator, property, expected), {
      message: `${property} must paint ${expected}`,
    })
    .toBeLessThanOrEqual(2)
}

function luminance(channels: readonly number[]) {
  const [red = 0, green = 0, blue = 0] = channels.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function ratioOf(first: readonly number[], second: readonly number[]) {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The contrast two computed colors really have on screen. */
async function paintedContrast(
  foreground: Locator,
  foregroundProperty: string,
  background: Locator,
  backgroundProperty: string
) {
  const [text = [], ground = []] = await paint(foreground.page(), [
    await computed(foreground, foregroundProperty),
    await computed(background, backgroundProperty),
  ])
  return ratioOf(text, ground)
}

const rootVariable = (page: Page, name: string) =>
  page.evaluate(
    variable =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim(),
    name
  )

/** Waits for the page to stop moving: the dial at rest and no color fading. */
async function expectAtRest(page: Page) {
  await expect(html(page)).not.toHaveAttribute('data-dragging', /.*/u)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(animation => animation.playState === 'running').length
      )
    )
    .toBe(0)
}

/** The command a chooser shows: the one package-manager variant on screen. */
function shownCommand(scope: Locator) {
  return scope.locator('.install-text').filter({ visible: true })
}

/** The word a copy control shows. Its labels share one cell, and the one in
 * use is the only one visible. */
async function copyLabel(button: Locator) {
  return button.locator('.copy-button-label > *').evaluateAll(labels =>
    labels
      .filter(label => getComputedStyle(label).visibility === 'visible')
      .map(label => label.textContent)
      .join('')
  )
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

/** Checks text against the surface it sits on. Translucent fills composite
 * over the first opaque ancestor, the way the browser paints them. */
async function expectReadableText(
  locator: Locator,
  minimumFontSize: number,
  minimumContrast = 4.5
) {
  const evidence = await locator.evaluateAll(elements => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const parse = (value: string) => {
      if (context === null) {
        return { rgb: [0, 0, 0], alpha: 1 }
      }
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(
        0,
        0,
        1,
        1
      ).data
      return { rgb: [red, green, blue], alpha: alpha / 255 }
    }
    const luminance = ([red = 0, green = 0, blue = 0]: number[]) => {
      const linear = [red, green, blue].map(channel => {
        const value = channel / 255
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4
      })
      return (
        0.2126 * (linear[0] ?? 0) +
        0.7152 * (linear[1] ?? 0) +
        0.0722 * (linear[2] ?? 0)
      )
    }
    const background = (element: Element) => {
      const layers: { rgb: number[]; alpha: number }[] = []
      let current: Element | null = element
      while (current !== null) {
        const fill = parse(getComputedStyle(current).backgroundColor)
        if (fill.alpha > 0) {
          layers.push(fill)
          if (fill.alpha >= 1) {
            break
          }
        }
        current = current.parentElement
      }
      let rgb = [255, 255, 255]
      for (const layer of layers.reverse()) {
        rgb = rgb.map(
          (channel, index) =>
            (layer.rgb[index] ?? 0) * layer.alpha + channel * (1 - layer.alpha)
        )
      }
      return rgb
    }

    return elements.flatMap(element => {
      if (element.getClientRects().length === 0) {
        return []
      }
      const style = getComputedStyle(element)
      const foreground = parse(style.color).rgb
      const ground = background(element)
      const lighter = Math.max(luminance(foreground), luminance(ground))
      const darker = Math.min(luminance(foreground), luminance(ground))
      let opacity = 1
      for (
        let current: Element | null = element;
        current !== null;
        current = current.parentElement
      ) {
        opacity *= Number.parseFloat(getComputedStyle(current).opacity)
      }
      return [
        {
          label: element.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
          contrast: (lighter + 0.05) / (darker + 0.05),
          fontSize: Number.parseFloat(style.fontSize),
          opacity,
        },
      ]
    })
  })

  expect(evidence.length).toBeGreaterThan(20)
  const unreadable = evidence.flatMap(item => [
    ...(item.fontSize < minimumFontSize
      ? [`"${item.label}" sets at ${item.fontSize}px`]
      : []),
    ...(item.opacity !== 1 ? [`"${item.label}" fades to ${item.opacity}`] : []),
    ...(item.contrast < minimumContrast
      ? [`"${item.label}" holds ${item.contrast.toFixed(2)}:1`]
      : []),
  ])
  expect(unreadable).toEqual([])
}

const readableText = [
  '.hero-lede',
  '.hero-invite',
  '.hero-source',
  '.crown-readout dt',
  '.crown-readout dd',
  '.crown-button',
  '.crown-switch',
  '.island-text',
  '.install-manager',
  '.install-code',
  '.graph-band-name',
  '.graph-band-rule',
  '.graph-note',
  '.section-head p',
  '.rule-name',
  '.rule-details dt',
  '.rule-details dd',
  '.rule-switch',
  '.rule-code',
  '.theme-node code',
  '.ramp-label',
  '.workflow-copy p',
  '.reach-lede',
  '.reach-proof figcaption',
  '.config-notes dd',
  '.limits-list li',
  '.limits-facts dt',
  '.limits-facts dd',
  '.limits-note',
  '.close-steps li',
  '.close-chain',
  '.close-colophon',
].join(', ')

/** Sets the dial through its native input, one frame apart, and returns every
 * string the readouts printed along the way. */
function printedAcross(page: Page, hues: readonly number[]) {
  return page.evaluate(async sweep => {
    const input = document.querySelector<HTMLInputElement>('.crown-input')
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    if (input === null || setValue === undefined) {
      throw new Error('The dial has no native range input.')
    }
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
    const printed: string[] = []
    for (const hue of sweep) {
      setValue.call(input, String(hue))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await frame()
      await frame()
      for (const element of document.querySelectorAll(
        '.crown-readout dd, .island-text'
      )) {
        printed.push(element.textContent ?? '')
      }
      printed.push(input.getAttribute('aria-valuetext') ?? '')
    }
    return printed
  }, hues)
}

function expectHonestRatios(printed: readonly string[]) {
  let passes = 0
  for (const text of printed) {
    for (const [, ratio = ''] of text.matchAll(/(\d+\.\d+):1 AA\b/gu)) {
      passes += 1
      expect(Number(ratio), `"${text}" prints a pass`).toBeGreaterThanOrEqual(
        4.5
      )
    }
    for (const [, ratio = ''] of text.matchAll(/(\d+\.\d+) to 1\b/gu)) {
      passes += 1
      expect(Number(ratio), `"${text}" prints a pass`).toBeGreaterThanOrEqual(
        4.5
      )
    }
    for (const [, ratio = ''] of text.matchAll(/(\d+\.\d+):1 fails AA\b/gu)) {
      expect(Number(ratio), `"${text}" prints a failure`).toBeLessThan(4.5)
    }
  }
  expect(passes).toBeGreaterThan(printed.length / 4)
}

/** A ratio the way the page prints it: floored, so a miss never rounds to a pass. */
const floored = (ratio: number) => (Math.floor(ratio * 100) / 100).toFixed(2)

/** Reads the ratio a readout prints, as a number. */
async function printedRatio(page: Page, label: string) {
  const text = (await readout(page, label).textContent()) ?? ''
  const ratio = /^(\d+\.\d+):1/u.exec(text)?.[1]
  expect(ratio, `${label} printed "${text}"`).toBeTruthy()
  return Number(ratio)
}

/** Holds the button's readout to the contrast its computed colors really have. */
async function expectLabelReadoutHonest(page: Page) {
  await expectAtRest(page)
  const printed = await printedRatio(page, 'Button label')
  const real = await paintedContrast(
    heroButton(page),
    'color',
    heroButton(page),
    'background-color'
  )
  expect(
    Math.abs(printed - real),
    `the readout prints ${printed}:1 and the button paints ${real.toFixed(2)}:1`
  ).toBeLessThanOrEqual(0.05)
  await expect(readout(page, 'Button label')).toContainText(
    real >= 4.5 ? ':1 AA' : ':1 fails AA'
  )
}

/** Holds the close section's printed value and ratio to what it paints. */
async function expectCloseChainHonest(page: Page, hex: string) {
  await expectAtRest(page)
  const close = page.locator('.close')
  const chain = page.locator('.close-chain')
  await expectPaints(close, 'background-color', hex)
  const real = await paintedContrast(close, 'color', close, 'background-color')
  const text = (await chain.textContent()) ?? ''
  const printed =
    /^component\.close\.background = (#[\da-f]{6}), label (\d+\.\d+):1(.*)$/u.exec(
      text
    )
  expect(printed, `the close section printed "${text}"`).not.toBeNull()
  expect(printed?.[1]).toBe(hex)
  expect(
    Math.abs(Number(printed?.[2]) - real),
    `the band prints "${text}" and paints ${real.toFixed(2)}:1`
  ).toBeLessThanOrEqual(0.05)
  expect(printed?.[3]).toBe(real >= 4.5 ? ' AA' : ', fails AA')
}

/** The bindings an inline style states, and any that paint something else. */
function bindingMismatches(page: Page) {
  return page.evaluate(() => {
    const mismatches: string[] = []
    let checked = 0
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.append(probe)
    for (const element of document.querySelectorAll(
      '[data-tokens][style], [data-tokens] > [style]'
    )) {
      const declared = (element.getAttribute('style') ?? '').split(';')
      for (const declaration of declared) {
        const match = /^\s*([\w-]+)\s*:\s*var\((--[\w-]+)\)\s*$/u.exec(
          declaration
        )
        if (match === null) {
          continue
        }
        const [, property = '', variable = ''] = match
        checked += 1
        const style = getComputedStyle(element)
        const tokenValue = style.getPropertyValue(variable).trim()
        probe.style.setProperty(property, tokenValue)
        const wanted = getComputedStyle(probe).getPropertyValue(property)
        probe.style.removeProperty(property)
        const painted = style.getPropertyValue(property)
        if (tokenValue === '' || painted !== wanted) {
          mismatches.push(
            `${element.getAttribute('class')} ${property} paints ${painted}, ${variable} holds ${tokenValue}`
          )
        }
      }
    }
    probe.remove()
    return { checked, mismatches }
  })
}

async function expectBindingsHold(page: Page) {
  await expect
    .poll(async () => (await bindingMismatches(page)).mismatches)
    .toEqual([])
  expect((await bindingMismatches(page)).checked).toBeGreaterThan(30)
}

/** Records every class string the root carries, from before the first script. */
async function recordRootClasses(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = []
    Object.assign(window, { rootClasses: log })
    new MutationObserver(() => {
      const classes = document.documentElement?.className ?? ''
      if (log.at(-1) !== classes) {
        log.push(classes)
      }
    }).observe(document, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    })
  })
}

const rootClasses = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { rootClasses: string[] }).rootClasses
  )

test('homepage leads with what the check does', async ({ page }) => {
  await openHome(page)

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Govern token change. Know every token it reaches.',
    })
  ).toHaveCount(1)
  await expect(page.locator('.hero-lede')).toHaveText(
    'One config declares your layers, what each may reference, and who owns it. primitree check fails CI when a DTCG token breaks a rule, and primitree diff lists every token a change reaches.'
  )
  await expect(page.locator('.hero-invite')).toContainText(
    `from the ${tokenCount} tokens in the graph.`
  )
  await expect(heroButton(page)).toHaveAttribute(
    'href',
    '/docs/getting-started'
  )
  await expect(shownCommand(page.locator('.hero'))).toHaveText(
    managers[0].install
  )
  await expect(island(page)).toHaveText('0 findings, exit 0')
  await expect(page.locator('.island-dot')).toBeHidden()
  await expect(buildLine(page)).toContainText(
    `${tokenCount} tokens, 3 layers, 0 findings, exit 0.`
  )
  await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
  await expect(page.locator('.graph-svg-wide')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Token graph of this page: ${tokenCount} tokens`, 'u')
  )
  await expect(page.locator('.graph-svg-wide .graph-node')).toHaveCount(
    tokenCount
  )
  for (const layer of ['component', 'semantic', 'primitives']) {
    await expect(
      page.locator(`.graph-band[data-layer="${layer}"] .graph-band-count`)
    ).toHaveText(String(tokens.filter(token => token.layer === layer).length))
  }
})

test('the sections run in reading order, each under its own heading', async ({
  page,
}) => {
  await openHome(page)

  await expect(page.locator('.home > section')).toHaveCount(9)
  const order = await page
    .locator('.home > section')
    .evaluateAll(sections =>
      sections.map(section => section.className.split(' ')[0])
    )
  expect(order).toEqual([
    'hero',
    'rules',
    'theme',
    'config',
    'workflow',
    'reach',
    'limits',
    'ledger',
    'close',
  ])

  for (const [section, heading] of [
    ['rules', 'Break a rule and see what it costs.'],
    ['theme', 'A theme changes one layer.'],
    ['config', 'primitree.config.ts declares three layers and two owners.'],
    ['workflow', 'Four commands: check, inspect, diff, and build.'],
    ['reach', 'Each rule switch calls @primitree/core in your browser.'],
    [
      'limits',
      'Reads DTCG 2025.10, except composite types, $ref, $extends, and Resolver files.',
    ],
    ['close', 'Run the check on your own tokens.'],
  ] as const) {
    await expect(
      page.locator(`.${section}`).getByRole('heading', { level: 2 })
    ).toHaveText(heading)
    await expect(page.getByRole('region', { name: heading })).toHaveClass(
      new RegExp(`\\b${section}\\b`, 'u')
    )
  }
  await expect(page.locator('.ledger h2')).toHaveText(
    `Read all ${tokenCount} tokens.`
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
  await expect(page.locator('footer')).toContainText(/Primitree v\d+\.\d+\.\d+/)
})

test('search opens its dialog with a focused textbox', async ({ page }) => {
  await openHome(page)
  const trigger = page.getByRole('button', { name: 'Open Search', exact: true })
  await trigger.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('closing search returns focus to where the hotkey found it', async ({
  page,
}) => {
  await openHome(page)
  const docs = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Docs' })
  await docs.focus()
  await page.keyboard.press('ControlOrMeta+k')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(docs).toBeFocused()
})

test('the install chooser offers four native radios', async ({ page }) => {
  await openHome(page)
  const groups = page.getByRole('group', { name: 'Package manager' })
  await expect(groups).toHaveCount(2)

  for (const index of [0, 1]) {
    const radios = groups.nth(index).getByRole('radio')
    await expect(radios).toHaveCount(managers.length)
    for (const [position, manager] of managers.entries()) {
      const radio = groups
        .nth(index)
        .getByRole('radio', { name: manager.name, exact: true })
      await expect(radio).toHaveAttribute('type', 'radio')
      await expect(radio).toHaveAttribute('value', manager.value)
      if (position === 0) {
        await expect(radio).toBeChecked()
      } else {
        await expect(radio).not.toBeChecked()
      }
    }
  }
})

test('arrow keys move the package manager and every command follows', async ({
  page,
}) => {
  await openHome(page)
  const hero = page.getByRole('group', { name: 'Package manager' }).first()

  await hero.getByRole('radio', { name: 'npm', exact: true }).focus()
  for (const manager of [...managers.slice(1), managers[0]]) {
    await page.keyboard.press('ArrowRight')
    const radio = hero.getByRole('radio', { name: manager.name, exact: true })
    await expect(radio).toBeFocused()
    await expect(radio).toBeChecked()
    await expect(shownCommand(page.locator('.hero'))).toHaveText(
      manager.install
    )
    await expect(shownCommand(page.locator('.close'))).toHaveText(
      manager.install
    )
    await expect(page.locator('.close-steps .run-command')).toContainText(
      `${manager.run} check`,
      { useInnerText: true }
    )
    await expect(
      page
        .locator('.workflow-step .run-command')
        .first()
        .locator(`.pm-only[data-pm="${manager.value}"]`)
    ).toHaveCSS('display', 'inline')
    await expect(
      page.locator('.close').getByRole('radio', {
        name: manager.name,
        exact: true,
      })
    ).toBeChecked()
  }

  await page.keyboard.press('ArrowLeft')
  await expect(
    hero.getByRole('radio', { name: 'Bun', exact: true })
  ).toBeChecked()
})

test('the package manager choice survives a reload', async ({ page }) => {
  await openHome(page)
  const pnpm = page
    .locator('.hero')
    .getByRole('radio', { name: 'pnpm', exact: true })
  await pnpm.check()
  await expect(pnpm).toBeChecked()

  await page.reload({ waitUntil: 'domcontentloaded' })
  expect(
    await page.evaluate(() => document.documentElement.dataset.packageManager)
  ).toBe('pnpm')
  await expect(shownCommand(page.locator('.hero'))).toHaveText(
    managers[1].install
  )
  await expectHydrated(page)
  await expect(pnpm).toBeChecked()
  await expect(
    page.getByRole('button', { name: `Copy ${managers[1].install}` })
  ).toHaveCount(2)
})

test('the clipboard receives the command on screen for every manager', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await openHome(page)
  const hero = page.locator('.hero')

  for (const manager of managers) {
    await hero.getByRole('radio', { name: manager.name, exact: true }).check()
    const shown = shownCommand(hero)
    await expect(shown).toHaveText(manager.install)

    const copy = hero.locator('.copy-button')
    await expect(copy).toHaveAccessibleName(`Copy ${manager.install}`)
    await expect.poll(() => copyLabel(copy)).toBe('Copy')
    await copy.click()
    await expect(copy).toHaveAttribute('data-state', 'copied')
    await expect.poll(() => copyLabel(copy)).toBe('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await shown.textContent()
    )
  }
  await expect
    .poll(() => copyLabel(page.locator('.close .copy-button')))
    .toBe('Copy')
})

test('a blocked clipboard reports the failure and selects the command', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('blocked')) },
    })
    document.execCommand = () => false
  })
  await openHome(page)

  const hero = page.locator('.hero .copy-button')
  await hero.click()
  await expect(hero).toHaveAttribute('data-state', 'failed')
  await expect.poll(() => copyLabel(hero)).toBe('Failed')
  await expect(page.locator('.hero .copy-status')).toHaveText(copyFailure)
  await expect(page.locator('.hero .copy-status')).toBeVisible()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    managers[0].install
  )
})

test('the range input turns the dial from the keyboard', async ({ page }) => {
  await openHome(page)
  const dial = hueDial(page)
  const button = heroButton(page)
  await expect(dial).toHaveValue(String(BRAND_HUE))
  await expectPaints(button, 'background-color', brandAt(BRAND_HUE, '45').hex)

  await dial.focus()
  await page.keyboard.press('ArrowRight')
  await expect(dial).toHaveValue(String(BRAND_HUE + 1))
  await expect(page.locator('.crown-value')).toHaveText(String(BRAND_HUE + 1))
  await expect(dial).toHaveAttribute(
    'aria-valuetext',
    new RegExp(`^Hue ${BRAND_HUE + 1}\\. White label, \\d+\\.\\d+ to 1\\.`, 'u')
  )

  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  const hue = BRAND_HUE + 31
  await expect(dial).toHaveValue(String(hue))
  await expect
    .poll(() => rootVariable(page, BRAND_45))
    .toBe(cssColor(brandAt(hue, '45')))
  await expectPaints(button, 'background-color', brandAt(hue, '45').hex)
  await expectPaints(button, 'color', neutralAt(hue, '100').hex)
  expect(
    await paintedGap(button, 'background-color', brandAt(BRAND_HUE, '45').hex)
  ).toBeGreaterThan(2)

  await page.keyboard.press('End')
  await expect(dial).toHaveValue('359')
  await page.keyboard.press('Home')
  await expect(dial).toHaveValue('0')
})

test('each preset retunes the page from the solver', async ({ page }) => {
  await openHome(page)

  for (const { name, hue } of presets) {
    await presetButton(page, name).click()
    await expect(presetButton(page, name)).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    for (const other of presets) {
      if (other.name !== name) {
        await expect(presetButton(page, other.name)).toHaveAttribute(
          'aria-pressed',
          'false'
        )
      }
    }
    await expect(hueDial(page)).toHaveValue(String(hue))
    await expect
      .poll(() => rootVariable(page, BRAND_45))
      .toBe(cssColor(brandAt(hue, '45')))
    await expectPaints(heroButton(page), 'background-color', solidAt(hue).hex)
    await expectPaints(heroButton(page), 'color', labelAt(hue).hex)
  }
})

test('a preset on a signal hue says so on the Island', async ({ page }) => {
  await openHome(page)
  await presetButton(page, 'Signal red').click()

  await expect(island(page)).toHaveText('Hue 27, too close to fail')
  await expect(page.locator('.island-dot')).toHaveAttribute('data-tone', 'fail')
})

test('Citrus flips the label to dark and the readout says so', async ({
  page,
}) => {
  await openHome(page)
  await expect(readout(page, 'Label color')).toHaveText('White')

  await page.evaluate(() => {
    const seen: string[] = []
    Object.assign(window, { islandSeen: seen })
    // New words mount as a new node, so the capsule is watched, not the span.
    const inner = document.querySelector('.island-inner')
    if (inner !== null) {
      new MutationObserver(() =>
        seen.push(document.querySelector('.island-text')?.textContent ?? '')
      ).observe(inner, { characterData: true, childList: true, subtree: true })
    }
  })
  await presetButton(page, 'Citrus').click()

  await expect(readout(page, 'Label color')).toHaveText('Dark')
  await expect(hueDial(page)).toHaveAttribute(
    'aria-valuetext',
    /^Hue 110\. Dark label, /u
  )
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(110, '85').hex
  )
  await expectPaints(heroButton(page), 'color', neutralAt(110, '8').hex)
  await expectPaints(page.locator('.close'), 'color', neutralAt(110, '8').hex)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { islandSeen: string[] }).islandSeen
      )
    )
    .toContain('Label switched to dark to hold AA')

  await presetButton(page, 'Greenshield').click()
  await expect(readout(page, 'Label color')).toHaveText('White')
  await expectPaints(heroButton(page), 'color', neutralAt(BRAND_HUE, '100').hex)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no readout prints a passing ratio under 4.5 in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await openHome(page)

    const hues = [
      ...Array.from({ length: 72 }, (_, index) => index * 5),
      26,
      27,
      28,
      79,
      81,
      83,
      84,
      86,
      129,
      131,
      134,
      135,
    ]
    const printed = await printedAcross(page, hues)
    expect(printed.length).toBe(hues.length * 6)
    expectHonestRatios(printed)
  })
}

test('the readouts state the contrast the button and the link paint', async ({
  page,
}) => {
  await openHome(page)

  await expectLabelReadoutHonest(page)
  for (const name of ['Citrus', 'Ultramarine', 'Greenshield']) {
    await presetButton(page, name).click()
    await expectLabelReadoutHonest(page)
    const printed = await printedRatio(page, 'Link text')
    const real = await paintedContrast(
      ruleLink(page),
      'color',
      page.locator('body'),
      'background-color'
    )
    expect(
      Math.abs(printed - real),
      `${name}: link readout ${printed}:1, painted ${real.toFixed(2)}:1`
    ).toBeLessThanOrEqual(0.05)
  }

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectLabelReadoutHonest(page)
})

test('with the accent hard-coded, the readout still states what the button paints', async ({
  page,
}) => {
  await openHome(page)
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await expectLabelReadoutHonest(page)

  await presetButton(page, 'Citrus').click()
  await expectLabelReadoutHonest(page)
})

test('a hard-coded accent prints its real ratio, and fails AA in dark after breaking it in light', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await expect(readout(page, 'Button label')).toContainText(':1 AA')
  await expectLabelReadoutHonest(page)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expect(island(page)).toHaveText(
    /^Label \d+\.\d{2}:1, fails AA: the button stayed behind$/u
  )

  await expect(readout(page, 'Button label')).toContainText(':1 fails AA')
  await expect(readout(page, 'Button label')).toHaveAttribute('data-fail', '')
  await expectLabelReadoutHonest(page)
  expect(await printedRatio(page, 'Button label')).toBeLessThan(4.5)
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(BRAND_HUE, '45').hex
  )
})

test('the warn and fail readout names the signal a hue reads too close to', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const row = readout(page, 'Hue vs warn/fail')
  await expect(row).toHaveText('Clear')
  await expect(row).not.toHaveAttribute('data-fail', /.*/u)
  expect(signalCollisions(solved(BRAND_HUE), 'light')).toEqual([])

  expect(signalCollisions(solved(27), 'light')).toContain('fail')
  await presetButton(page, 'Signal red').click()
  await expect(row).toHaveText('Near fail')
  await expect(row).toHaveAttribute('data-fail', '')
  await expect(hueDial(page)).toHaveAttribute(
    'aria-valuetext',
    /Reads close to the fail signal\.$/u
  )

  const warnHue = 75
  expect(signalCollisions(solved(warnHue), 'light')).toEqual(['warn'])
  await hueDial(page).fill(String(warnHue))
  await expect(row).toHaveText('Near warn')
  await expect(row).toHaveAttribute('data-fail', '')
  await expect(island(page)).toHaveText(`Hue ${warnHue}, too close to warn`)
  await expect(page.locator('.island-dot')).toHaveAttribute('data-tone', 'warn')

  await presetButton(page, 'Ultramarine').click()
  await expect(row).toHaveText('Clear')
  await expect(row).not.toHaveAttribute('data-fail', /.*/u)
})

test('the closing steps stop at check, which needs no outputs', async ({
  page,
}) => {
  await openHome(page)
  const steps = page.locator('.close-steps li')
  await expect(steps.first()).toHaveText(
    'Add primitree.config.ts, with your layers and a default owner, next to your DTCG file.'
  )
  // With no outputs in that config, build --check exits 2, so CI stays on check.
  await expect(steps.last()).toHaveText('Add check to CI.')
})

test('the close section prints its live value and ratio', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)

  await expectCloseChainHonest(page, brandAt(BRAND_HUE, '45').hex)

  await presetButton(page, 'Citrus').click()
  await expect(readout(page, 'Label color')).toHaveText('Dark')
  await expectCloseChainHonest(page, brandAt(110, '85').hex)

  await presetButton(page, 'Ultramarine').click()
  await expect(hueDial(page)).toHaveValue('265')
  await expectCloseChainHonest(page, brandAt(265, '45').hex)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectCloseChainHonest(page, brandAt(265, '72').hex)

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expectCloseChainHonest(page, brandAt(265, '72').hex)
  await expect(page.locator('.close-chain')).toContainText(', fails AA')
})

test('the Island prints the ratio the readout prints', async ({ page }) => {
  await openHome(page)

  for (const name of ['Ultramarine', 'Greenshield']) {
    await presetButton(page, name).click()
    const ratio = await printedRatio(page, 'Button label')
    await expect(island(page)).toContainText(`label ${ratio.toFixed(2)}:1 AA`)
  }
})

test('a theme flip restates the ratio and the signal on the Island', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await presetButton(page, 'Ultramarine').click()
  await expect(island(page)).toHaveText(/^Hue 265, label /u)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(readout(page, 'Label color')).toHaveText('Dark')
  const ratio = await printedRatio(page, 'Button label')
  await expect(island(page)).toHaveText(
    `Hue 265, label ${ratio.toFixed(2)}:1 AA`
  )

  await presetButton(page, 'Citrus').click()
  await expect(readout(page, 'Hue vs warn/fail')).toHaveText('Clear')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(readout(page, 'Hue vs warn/fail')).toHaveText('Near warn')
  await expect(island(page)).toHaveText('Hue 110, too close to warn')
})

test('a wheel over the dial scrolls the page and leaves the hue alone', async ({
  page,
}) => {
  await openHome(page)
  const box = await page.locator('.crown-dial').boundingBox()
  if (box === null) {
    throw new Error('The dial has no box.')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + 12)
  await page.waitForTimeout(400)
  await page.mouse.wheel(0, 240)
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
})

test('the status region waits for the dial to rest through a signal zone', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await page.evaluate(() => {
    const status = document.querySelector('.island [role="status"]')
    if (status === null) {
      throw new Error('The Island has no status region.')
    }
    const counter = { updates: 0 }
    new MutationObserver(() => {
      counter.updates += 1
    }).observe(status, { childList: true, characterData: true, subtree: true })
    Object.assign(window, { statusUpdates: counter })
  })
  const updates = () =>
    page.evaluate(
      () =>
        (window as unknown as { statusUpdates: { updates: number } })
          .statusUpdates.updates
    )

  await hueDial(page).focus()
  await page.keyboard.press('Home')
  await expect(hueDial(page)).toHaveValue('0')
  await page.keyboard.press('PageUp')
  await expect(hueDial(page)).toHaveValue('36')
  await page.waitForTimeout(2 * SETTLE_MS)
  const before = await updates()
  for (let press = 0; press < 40; press += 1) {
    await page.keyboard.press('ArrowRight', { delay: 30 })
  }
  await expect(hueDial(page)).toHaveValue('76')
  await page.waitForTimeout(2 * SETTLE_MS)
  expect((await updates()) - before).toBeLessThanOrEqual(2)
  await expect(page.locator('.island [role="status"]')).toHaveText(
    'Hue 76, too close to warn'
  )
})

test('a press on the hub leaves the hue alone', async ({ page }) => {
  await openHome(page)
  const dial = await page.locator('.crown-dial').boundingBox()
  expect(dial).not.toBeNull()

  await page.mouse.click(
    (dial?.x ?? 0) + (dial?.width ?? 0) / 2 + 5,
    (dial?.y ?? 0) + (dial?.height ?? 0) / 2 + 12
  )
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
  await expect(html(page)).not.toHaveAttribute('data-dragging', /.*/u)
})

test('a touch on the hub can scroll the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)

  const touchAction = await page.locator('.crown-dial').evaluate(dial => {
    const box = dial.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    )
    return hit === null ? 'none' : getComputedStyle(hit).touchAction
  })
  expect(touchAction).not.toBe('none')
})

test('a chosen hue survives a reload and follows the reader to the docs', async ({
  page,
}) => {
  await openHome(page)
  await presetButton(page, 'Citrus').click()
  await expect(hueDial(page)).toHaveValue('110')
  await expectAtRest(page)

  await page.reload()
  await expectHydrated(page)
  await expect(hueDial(page)).toHaveValue('110')
  await expect(readout(page, 'Label color')).toHaveText('Dark')
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(110, '85').hex
  )

  await page.goto('/docs/getting-started')
  expect(await rootVariable(page, BRAND_45)).toBe(cssColor(brandAt(110, '45')))
})

test('hue zero survives a reload like any other hue', async ({ page }) => {
  await openHome(page)
  await hueDial(page).focus()
  await page.keyboard.press('Home')
  await expect(hueDial(page)).toHaveValue('0')
  await expectAtRest(page)
  expect(await page.evaluate(key => sessionStorage.getItem(key), HUE_KEY)).toBe(
    '0'
  )

  await page.reload()
  await expectHydrated(page)
  await expect(page.locator('.crown-value')).toHaveText('0')
  await expect(hueDial(page)).toHaveValue('0')
})

for (const { id, code, label } of breaks.slice(0, 2)) {
  test(`a reload after "${label}" leaves no broken token behind`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openHome(page)
    await presetButton(page, 'Ultramarine').click()
    await expect(hueDial(page)).toHaveValue('265')

    await ruleSwitch(page, code).click()
    await expect(ruleRow(page, code).locator('.rule-output')).toContainText(
      'exit 1',
      CHECK_TIMEOUT
    )
    await expect(html(page)).toHaveAttribute(
      'data-breaks',
      new RegExp(`\\b${id}\\b`, 'u')
    )

    await page.reload()
    await expectHydrated(page)
    await expect(buildLine(page)).toContainText('exit 0')
    await expect(ruleSwitch(page, code)).toHaveAttribute(
      'aria-checked',
      'false'
    )
    const inline = await html(page).getAttribute('style')
    expect(inline ?? '').not.toMatch(
      id === 'literal' ? /--semantic-accent-solid:/u : /--component-link-text:/u
    )
  })
}

test('a reload takes a rule row break, its hue, and its theme, and the system preference holds', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 2400 })
  await openHome(page)
  await ruleSwitch(page, 'PT1003').click()
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE + 70))
  await ruleSwitch(page, 'PT1004').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expectHydrated(page)
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
  await expect(html(page)).toHaveAttribute('data-theme', 'light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
})

test('a hero break leaves with the page and never comes back half-applied', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await presetButton(page, 'Ultramarine').click()
  await expect(hueDial(page)).toHaveValue('265')

  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Docs' })
    .click()
  await page.waitForURL(/\/docs/u)
  await expect(html(page)).not.toHaveAttribute('data-breaks', /\bliteral\b/u)
  await expect(html(page)).not.toHaveAttribute(
    'style',
    /--semantic-accent-solid:/u
  )

  await page.goBack()
  await expectHydrated(page)
  await expect(crownSwitch(page, 'Hard-code the accent')).toHaveAttribute(
    'aria-checked',
    'false'
  )
  await expect(buildLine(page)).toContainText('0 findings, exit 0.')
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(265, '45').hex
  )
})

test('a hero break survives the graph remounting at the phone width', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await presetButton(page, 'Ultramarine').click()
  await expect(hueDial(page)).toHaveValue('265')

  await page.setViewportSize({ width: 600, height: 900 })
  await expect(page.locator('#token-graph-narrow')).toBeVisible()
  await expect(crownSwitch(page, 'Hard-code the accent')).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(BRAND_HUE, '45').hex
  )
})

test('a moving dial holds every bound element at zero transition', async ({
  page,
}) => {
  await openHome(page)
  const dial = hueDial(page)
  await dial.focus()

  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    const held = await page.evaluate(() => ({
      dragging: document.documentElement.hasAttribute('data-dragging'),
      bound: document.querySelectorAll('[data-tokens]').length,
      moving: [
        ...document.querySelectorAll(
          '[data-tokens], [data-tokens] > [style], .graph-edge, .node-swatch'
        ),
      ].flatMap(element => {
        const style = getComputedStyle(element)
        const seconds = (value: string) =>
          value.split(',').map(Number.parseFloat)
        return [
          ...seconds(style.transitionDuration),
          ...seconds(style.transitionDelay),
        ].some(value => value !== 0)
          ? [`${element.tagName} ${String(element.className)}`]
          : []
      }),
    }))
    expect(held.dragging).toBe(true)
    expect(held.bound).toBeGreaterThan(30)
    expect(held.moving).toEqual([])
  }).toPass()

  await expect(html(page)).not.toHaveAttribute('data-dragging', /.*/u)
  expect(
    Number.parseFloat(await computed(heroButton(page), 'transition-duration'))
  ).toBeGreaterThan(0)
})

test('a pointer drag repaints the button on the move, with no lag', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const box = await page.locator('.crown-dial').boundingBox()
  expect(box).not.toBeNull()
  const centerX = (box?.x ?? 0) + (box?.width ?? 0) / 2
  const centerY = (box?.y ?? 0) + (box?.height ?? 0) / 2
  const radius = ((box?.width ?? 0) * 80) / 200
  const onRing = (degrees: number) => {
    const angle = ((degrees - 90) * Math.PI) / 180
    return [
      centerX + radius * Math.cos(angle),
      centerY + radius * Math.sin(angle),
    ] as const
  }

  await page.mouse.move(...onRing(BRAND_HUE))
  await page.mouse.down()
  const steps: { brand: string; dragging: boolean; gap: number }[] = []
  for (const offset of [12, 24, 36, 48, 60, 72, 84, 96]) {
    await page.mouse.move(...onRing(BRAND_HUE + offset))
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
    const brand = await rootVariable(page, BRAND_45)
    steps.push({
      brand,
      dragging: await page.evaluate(() =>
        document.documentElement.hasAttribute('data-dragging')
      ),
      gap: await paintedGap(heroButton(page), 'background-color', brand),
    })
  }
  await page.mouse.up()

  expect(steps.every(step => step.dragging)).toBe(true)
  // The button paints the token the frame it moves: a delay would freeze it.
  expect(steps.map(step => step.gap).filter(gap => gap > 2)).toEqual([])
  expect(new Set(steps.map(step => step.brand)).size).toBeGreaterThan(3)
  await expect(html(page)).not.toHaveAttribute('data-dragging', /.*/u)
})

test('the wave runs up the references once the dial rests', async ({
  page,
}) => {
  await openHome(page)
  const wave = page.evaluate(
    () =>
      new Promise<boolean>(resolve => {
        const graph = document.querySelector('.graph-svg-wide')
        if (graph === null) {
          resolve(false)
          return
        }
        const observer = new MutationObserver(() => {
          if (graph.querySelector('.graph-edge.is-hot') !== null) {
            observer.disconnect()
            resolve(!document.documentElement.hasAttribute('data-dragging'))
          }
        })
        observer.observe(graph, {
          attributes: true,
          attributeFilter: ['class'],
          subtree: true,
        })
      })
  )

  await hueDial(page).focus()
  await page.keyboard.press('ArrowRight')
  expect(await wave).toBe(true)
})

test('the wave heats visible ribbons alone and every pulse ends', async ({
  page,
}) => {
  await openHome(page)
  await presetButton(page, 'Ultramarine').click()
  const hot = page.locator('.graph-svg-wide .is-hot')
  await expect(hot).not.toHaveCount(0)
  expect(
    await hot.evaluateAll(
      elements =>
        elements.filter(element => getComputedStyle(element).display === 'none')
          .length
    )
  ).toBe(0)
  await expect(hot).toHaveCount(0)
})

test('a wave lands on the stage a broken rule holds', async ({ page }) => {
  await openHome(page)
  const jumps = page.evaluate(
    () =>
      new Promise<string[]>(resolve => {
        const found: string[] = []
        const last = new Map<Element, number>()
        const level = (element: Element) => {
          const style = getComputedStyle(element)
          return Number(
            element.classList.contains('graph-stub')
              ? style.opacity
              : style.fillOpacity
          )
        }
        let heated = false
        const frame = () => {
          for (const [element, before] of last) {
            if (!element.classList.contains('is-hot')) {
              last.delete(element)
              if (Math.abs(level(element) - before) >= 0.1) {
                found.push(`${before} to ${level(element)}`)
              }
            }
          }
          for (const element of document.querySelectorAll(
            '.graph-svg-wide .is-hot'
          )) {
            heated = true
            last.set(element, level(element))
            if (
              element.matches('.is-lit') &&
              getComputedStyle(element).strokeDasharray !== 'none'
            ) {
              found.push('a lit ribbon thinned')
            }
          }
          if (heated && last.size === 0) {
            resolve(found)
            return
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
  )

  await crownSwitch(page, 'Hard-code the accent').click()
  expect(await jumps).toEqual([])
})

test('a theme flip mid-wave leaves no pulse to replay', async ({ page }) => {
  await openHome(page)
  await presetButton(page, 'Ultramarine').evaluate(button => button.click())
  await page
    .getByRole('button', { name: 'Switch to the dark theme' })
    .first()
    .evaluate(button => button.click())
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.graph-svg-wide .is-hot')).toHaveCount(0)
})

test('a second preset inside the wave runs a wave of its own', async ({
  page,
}) => {
  await openHome(page)
  const hot = page.locator('.graph-svg-wide .is-hot')
  await presetButton(page, 'Ultramarine').evaluate(button => button.click())
  await expect(hot).not.toHaveCount(0)
  // A pulse that has not ticked cancels with no event, so the first wave must
  // run before a stray animationcancel could strip the second.
  await expect
    .poll(() =>
      hot
        .first()
        .evaluate(element =>
          element
            .getAnimations()
            .some(animation => Number(animation.currentTime) > 0)
        )
    )
    .toBe(true)
  const heated = await presetButton(page, 'Signal red').evaluate(
    async button => {
      button.click()
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      return document.querySelectorAll('.graph-svg-wide .is-hot').length
    }
  )
  expect(heated).toBeGreaterThan(0)
  await expect(hot).toHaveCount(0)
})

test('a ribbon that loses the light mid-wave keeps its pulse in step', async ({
  page,
}) => {
  await openHome(page)
  const starts = await presetButton(page, 'Ultramarine').evaluate(
    async button => {
      const frames = () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
      button.click()
      await frames()
      const ribbon = document.querySelector(
        '.graph-svg-wide .graph-edge.is-hot'
      )
      ribbon?.classList.add('is-lit')
      await frames()
      ribbon?.classList.remove('is-lit')
      await frames()
      return ribbon
        ?.getAnimations()
        .filter(animation => animation instanceof CSSAnimation)
        .map(animation => animation.startTime)
    }
  )
  expect(starts).toHaveLength(2)
  expect(new Set(starts).size).toBe(1)
})

test('every ribbon the wave can heat carries the normalised length', async ({
  page,
}) => {
  await openHome(page)
  const unnormalised = '.graph-edge:not([pathLength="100"])'
  await expect(page.locator('.graph-svg-wide .graph-edge')).not.toHaveCount(0)
  await expect(page.locator(`.graph-svg-wide ${unnormalised}`)).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.graph-svg-narrow .graph-edge')).not.toHaveCount(0)
  await expect(page.locator(`.graph-svg-narrow ${unnormalised}`)).toHaveCount(0)
})

test('a preset across the ink arc eases the capsule', async ({ page }) => {
  await openHome(page)
  const held = await presetButton(page, 'Citrus').evaluate(button => {
    button.click()
    const capsule = document.querySelector('.island')
    return {
      marker: document.documentElement.dataset.dragging,
      transition: capsule ? getComputedStyle(capsule).transitionProperty : '',
    }
  })
  expect(held).toEqual({ marker: 'jump', transition: 'width' })
  await expect(html(page)).not.toHaveAttribute('data-dragging', /.*/u)
})

test('the button hovers on its own clock and rethemes on the wave', async ({
  page,
}) => {
  await openHome(page)
  const ms = (value: string) =>
    value.endsWith('ms')
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000
  const feedback = ms(
    await rootVariable(page, '--semantic-motion-duration-feedback')
  )
  const reveal = ms(
    await rootVariable(page, '--semantic-motion-duration-reveal')
  )
  const causal = ms(
    await rootVariable(page, '--semantic-motion-duration-causal')
  )
  const resting = await heroButton(page).evaluate(element => {
    const style = getComputedStyle(element)
    const index = style.transitionProperty
      .split(', ')
      .indexOf('background-color')
    // A shorter list repeats, so one duration can cover every property.
    const pick = (list: string) => {
      const items = list.split(', ')
      return items[index % items.length] ?? ''
    }
    return [pick(style.transitionDuration), pick(style.transitionDelay)]
  })
  expect(resting.map(ms)).toEqual([feedback, 0])

  await presetButton(page, 'Ultramarine').click()
  const wave = await heroButton(page).evaluate(element =>
    document
      .getAnimations()
      .filter(animation => animation.effect?.target === element)
      .map(animation => {
        const timing = animation.effect?.getComputedTiming()
        return `${(animation as CSSTransition).transitionProperty} ${Math.round(
          timing?.duration as number
        )} ${Math.round(timing?.delay ?? 0)}`
      })
      .sort()
  )
  expect(wave).toEqual([
    `background-color ${reveal} ${3 * causal}`,
    `color ${reveal} ${3 * causal}`,
  ])
  await expect(html(page)).not.toHaveAttribute('data-settling', /.*/u)
})

test('the Crown turns over a full graph and the chain follows the hue', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const button = await heroButton(page).boundingBox()
  await page.mouse.move((button?.x ?? 0) + 8, (button?.y ?? 0) + 8)
  await expect(activeGraph(page)).toHaveClass(/\bis-focusing\b/u)
  const before = (await graphChain(page).textContent()) ?? ''
  const [, step = ''] =
    /primitives\.color\.brand\.(\d+) = #/u.exec(before) ?? []
  expect(step).not.toBe('')

  await hueDial(page).focus()
  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press('ArrowRight')
  }
  await expectAtRest(page)
  const hue = Number(await hueDial(page).inputValue())
  await expect(graphChain(page)).toContainText(
    `primitives.color.brand.${step} = ${brandAt(hue, step).hex}`
  )
  await expect(island(page)).toHaveText(new RegExp(`^Hue ${hue}, `, 'u'))

  const dial = await page.locator('.crown-dial').boundingBox()
  await page.mouse.move(
    (dial?.x ?? 0) + (dial?.width ?? 0) / 2,
    (dial?.y ?? 0) + 10
  )
  await expect(activeGraph(page)).not.toHaveClass(/\bis-focusing\b/u)
})

for (const width of [320, 360, 390, 414]) {
  test(`a signal readout leaves the hero where it was at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await openHome(page)
    const row = readout(page, 'Hue vs warn/fail')
    await expect(row).toHaveText('Clear')
    const install = page.locator('.hero .install')
    const preset = presetButton(page, 'Signal red')
    // At 320 the click would scroll the preset into view, so it starts in view.
    await preset.scrollIntoViewIfNeeded()
    const before = await install.boundingBox()
    await preset.click()
    await expect(row).toHaveText('Near fail')
    await expectAtRest(page)
    expect((await install.boundingBox())?.y).toBe(before?.y)
  })
}

test('the Island never overhangs its cell on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  await presetButton(page, 'Signal red').click()
  await expect(island(page)).toHaveText('Hue 27, too close to fail')
  await expectAtRest(page)
  const fit = await page.locator('.island').evaluate(shell => {
    const box = shell.getBoundingClientRect()
    const text = shell.querySelector('.island-text')
    return {
      cell: shell.parentElement?.getBoundingClientRect().width ?? 0,
      shell: box.width,
      overhang:
        (shell.querySelector('.island-inner')?.getBoundingClientRect().right ??
          0) - box.right,
      clipped: (text?.scrollWidth ?? 0) - (text?.clientWidth ?? 0),
    }
  })
  expect(fit.shell).toBeLessThanOrEqual(fit.cell)
  expect(fit.overhang).toBeLessThanOrEqual(0)
  expect(fit.clipped).toBe(0)
})

test('a long readout ellipsizes inside the header instead of covering the links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 })
  await openHome(page)
  const path = 'primitives.font.family.sans'
  const box = await graphNode(page, path).boundingBox()
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2
  )
  await expect(island(page)).toContainText(`${path} = `)
  await expectAtRest(page)
  const boxes = await page.evaluate(() => {
    const text = document.querySelector('.island-text')
    return {
      islandRight:
        document.querySelector('.island')?.getBoundingClientRect().right ?? 0,
      linksLeft:
        document.querySelector('.site-header-end')?.getBoundingClientRect()
          .left ?? 0,
      clipped: (text?.scrollWidth ?? 0) > (text?.clientWidth ?? 0),
    }
  })
  expect(boxes.islandRight).toBeLessThanOrEqual(boxes.linksLeft)
  expect(boxes.clipped).toBe(true)
})

test('pointing at a token lights its lineage and outlines what it reaches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const path = 'semantic.accent.solid'
  const node = graphNode(page, path)
  const box = await node.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2
  )

  await expect(node).toHaveClass(/\bis-lit\b/u)
  for (const step of chainOf(path)) {
    await expect(graphNode(page, step)).toHaveClass(/\bis-lit\b/u)
  }
  await expect(
    graphNode(page, 'component.button.primary.background')
  ).toHaveClass(/\bis-lit\b/u)
  await expect(graphNode(page, 'semantic.status.fail')).not.toHaveClass(
    /\bis-lit\b/u
  )
  await expect(activeGraph(page)).toHaveClass(/\bis-focusing\b/u)
  await expect(
    activeGraph(page).locator(
      `.graph-edge.is-lit[data-from="${path}"][data-to="primitives.color.brand.45"]`
    )
  ).toHaveCount(1)

  await expect(graphChain(page)).toContainText(
    `${chainOf(path).join(' → ')} = ${brandAt(BRAND_HUE, '45').hex}`
  )
  expect(reachOf(path)).toBeGreaterThan(1)
  await expectChainGovernance(
    page,
    `Owners: product-design. Reaches ${reachOf(path)} tokens.`
  )
  await expect(heroButton(page)).toHaveClass(/\bis-reached\b/u)
  await expect(page.locator('.close')).toHaveClass(/\bis-reached\b/u)
  await expect(heroButton(page)).toHaveCSS('outline-style', 'dashed')
  await expect(page.locator('.hero-lede')).not.toHaveClass(/\bis-reached\b/u)
  await expect(page.locator('.page-thread')).not.toHaveCount(0)
  await expect(island(page)).toHaveText(new RegExp(`^${path} = `, 'u'))

  const source = await page.locator('.hero-source').boundingBox()
  await page.mouse.move((source?.x ?? 0) + 4, (source?.y ?? 0) + 4)
  await expect(page.locator('.is-reached')).toHaveCount(0)
  await expect(page.locator('.graph-node.is-lit')).toHaveCount(0)
  await expect(page.locator('.page-thread')).toHaveCount(0)
  await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
  await expect(island(page)).toHaveText('0 findings, exit 0')
})

test('a broken rule holds its chain on the graph until the switch turns it off', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const path = 'semantic.accent.solid'
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(`PT1003 ${path}`, CHECK_TIMEOUT)

  await expect(activeGraph(page)).toHaveClass(/\bis-focusing\b/u)
  await expect(graphNode(page, path)).toHaveClass(/\bis-lit\b/u)
  await expect(
    activeGraph(page).locator(`.graph-edge.is-lit[data-to="${path}"]`)
  ).toHaveCount(tokens.filter(token => token.target.light === path).length)
  await expect(page.locator('.is-reached')).toHaveCount(0)
  await expect(page.locator('.page-thread')).toHaveCount(0)
  await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
  await expect(island(page)).toHaveText(`PT1003 ${path}`)

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText('Rule restored, exit 0', CHECK_TIMEOUT)
  await expect(activeGraph(page)).not.toHaveClass(/\bis-focusing\b/u)
  await expect(page.locator('.graph-node.is-lit')).toHaveCount(0)
})

test('pointing at a theme node lights its own ribbon in the theme section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHome(page)
  const path = 'semantic.text.onAccent'
  await page.locator(`.theme-node[data-tokens="${path}"]`).hover()
  await expect(page.locator('.theme-ribbons')).toHaveClass(/\bis-focusing\b/u)
  await expect(
    page.locator(`.theme-ribbon.is-lit[data-from="${path}"]`)
  ).toHaveCount(1)
  await expect(page.locator('.theme-ribbon.is-lit')).toHaveCount(1)
  await expect(island(page)).toHaveText(new RegExp(`^${path} = `, 'u'))

  await page.locator('#theme-title').hover()
  await expect(page.locator('.theme-ribbons')).not.toHaveClass(
    /\bis-focusing\b/u
  )
  await expect(page.locator('.theme-ribbon.is-lit')).toHaveCount(0)
})

test('pointing at a ramp step lights the ribbons that land on it', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHome(page)
  const path = 'primitives.color.brand.45'
  await page.locator(`.ramp-step[data-tokens="${path}"]`).hover()
  await expect(page.locator('.theme-ribbons')).toHaveClass(/\bis-focusing\b/u)
  await expect(
    page.locator(`.theme-ribbon.is-lit[data-to="${path}"]`)
  ).toHaveCount(2)
  await expect(page.locator('.theme-ribbon.is-lit')).toHaveCount(2)
})

test('a phone rotation leaves no lit state behind', async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL,
  })
  const page = await context.newPage()
  await openHome(page)
  await page
    .locator(
      '#token-graph-narrow .graph-node[data-path="semantic.accent.solid"]'
    )
    .tap()
  await expect(heroButton(page)).toHaveClass(/\bis-reached\b/u)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('#token-graph-wide')).toBeVisible()
  await expect(page.locator('.is-reached')).toHaveCount(0)
  await expect(page.locator('#graph-tooltip')).toBeHidden()
  await expect(island(page)).toHaveText('0 findings, exit 0')
  await context.close()
})

test('a roved graph keeps one tab stop across a 719px crossing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const stops = page.locator('#token-graph-wide .graph-node[tabindex="0"]')
  await stops.focus()
  await page.keyboard.press('ArrowRight')
  await page.setViewportSize({ width: 600, height: 900 })
  await expect(page.locator('#token-graph-narrow')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1100 })
  await expect(stops).toHaveCount(1)
})

test('a theme flip restates a lit token in the theme on screen', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const path = 'semantic.accent.solid'
  await graphNode(page, path).focus()
  await expect(graphChain(page)).toContainText(
    `${chainOf(path).join(' → ')} = ${brandAt(BRAND_HUE, '45').hex}`
  )

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(graphChain(page)).toContainText(
    `${chainOf(path, 'dark').join(' → ')} = ${brandAt(BRAND_HUE, '72').hex}`
  )
  await expect(island(page)).toHaveText(
    `${path} = ${brandAt(BRAND_HUE, '72').hex}`
  )
})

test('a rule switch restates the chain of a lit token', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  await graphNode(page, 'component.link.text').hover()
  await expect(graphChain(page)).toContainText('semantic.accent.text')
  await crownSwitch(page, 'Skip a layer').focus()
  await page.keyboard.press('Space')
  await expect(graphChain(page)).toContainText(
    `component.link.text → primitives.color.brand.45 = ${brandAt(BRAND_HUE, '45').hex}`
  )
  await expect(island(page)).toHaveText(
    'PT1004 component.link.text',
    CHECK_TIMEOUT
  )
})

test('a resize redraws the threads and the tooltip of a lit token', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  await graphNode(page, 'semantic.accent.solid').focus()
  const before = await page.locator('.page-thread').first().getAttribute('d')

  await page.setViewportSize({ width: 820, height: 1100 })
  await expect(page.locator('.page-thread').first()).not.toHaveAttribute(
    'd',
    before ?? ''
  )
  await expect(page.locator('#graph-tooltip')).toBeVisible()
  const tooltip = await page.locator('#graph-tooltip').boundingBox()
  expect(tooltip).not.toBeNull()
  expect((tooltip?.x ?? 0) + (tooltip?.width ?? 0)).toBeLessThanOrEqual(820)
})

test('a lit token leaves with the graph that lit it', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1100 })
  await openHome(page)
  await graphNode(page, 'semantic.accent.solid').focus()
  await expect(page.locator('.is-reached')).not.toHaveCount(0)

  await page.setViewportSize({ width: 600, height: 1100 })
  await expect(page.locator('#token-graph-narrow')).toBeVisible()
  await expect(page.locator('.is-reached')).toHaveCount(0)
  await expect(page.locator('#graph-tooltip')).toBeHidden()
  await expect(island(page)).toHaveText('0 findings, exit 0')

  await page.setViewportSize({ width: 1440, height: 1100 })
  await heroButton(page).click()
  await page.waitForURL('**/docs/**')
  await page.mouse.move(3, 300)
  await page.goBack()
  await expect(heroButton(page)).toBeVisible()
  await expect(island(page)).toHaveText('0 findings, exit 0')
})

/** The chain's second line: who owns the token, and how far it travels. */
async function expectChainGovernance(page: Page, line: string) {
  await expect
    .poll(async () =>
      ((await graphChain(page).textContent()) ?? '').split('\n').at(-1)
    )
    .toBe(line)
}

test('the chain ends with who owns a token and how far it reaches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const point = async (path: string) => {
    const box = await graphNode(page, path).boundingBox()
    expect(box, path).not.toBeNull()
    await page.mouse.move(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2
    )
    await expect(graphChain(page)).toContainText(path)
  }

  await expect
    .poll(() => computed(page.locator('.graph-note-chain'), 'font-family'))
    .toMatch(/^Wotfard\b/u)

  const primitive = 'primitives.color.brand.45'
  await point(primitive)
  await expectChainGovernance(
    page,
    `Owners: design-systems. Reaches ${reachOf(primitive)} tokens.`
  )
  await expect
    .poll(() => computed(page.locator('.graph-note-chain'), 'font-family'))
    .toMatch(/^MonoLisa\b/u)

  const semantic = 'semantic.accent.solid'
  await point(semantic)
  await expectChainGovernance(
    page,
    `Owners: product-design. Reaches ${reachOf(semantic)} tokens.`
  )

  const component = 'component.button.primary.background'
  expect(reachOf(component)).toBe(0)
  await point(component)
  await expectChainGovernance(
    page,
    'Owners: design-systems. No token reads it.'
  )

  // With the default owner gone, only the semantic group keeps its owner.
  await ruleSwitch(page, 'PT1005').click()
  await expect(buildLine(page)).toContainText('exit 1', CHECK_TIMEOUT)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await graphNode(page, component).scrollIntoViewIfNeeded()
  await point(component)
  await expectChainGovernance(page, 'Owners: none. No token reads it.')
  await point(semantic)
  await expectChainGovernance(
    page,
    `Owners: product-design. Reaches ${reachOf(semantic)} tokens.`
  )
})

test('a theme flip changes how far a token reaches, and the chain says so', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await openHome(page)
  const path = 'primitives.color.brand.72'
  const box = await graphNode(page, path).boundingBox()
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2
  )

  expect(reachOf(path, 'dark')).not.toBe(reachOf(path, 'light'))
  await expect(graphChain(page)).toContainText(path)
  await expectChainGovernance(
    page,
    `Owners: design-systems. Reaches ${reachOf(path, 'dark')} tokens.`
  )
})

test('pointing at the hero button lights what it reads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)

  await heroButton(page).hover()

  const reads = (
    (await heroButton(page).getAttribute('data-tokens')) ?? ''
  ).split(' ')
  expect(reads).toContain('component.button.primary.background')
  for (const path of reads) {
    for (const step of chainOf(path)) {
      await expect(graphNode(page, step)).toHaveClass(/\bis-lit\b/u)
    }
  }
  await expect(graphChain(page)).toContainText(
    `${chainOf('component.button.primary.backgroundHover').join(' → ')} = ${brandAt(BRAND_HUE, '35').hex}`
  )
  await expect(island(page)).toHaveText(
    `component.button.primary.backgroundHover = ${brandAt(BRAND_HUE, '35').hex}`
  )
  // Pointing at an element traces up to its primitives, and never down to other
  // elements, so nothing else outlines itself.
  await expect(page.locator('.is-reached')).toHaveCount(0)
})

test('pointing at any code panel lights what it reads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHome(page)
  const panels = page.locator(
    '.code-panel, .home pre[data-tokens], .install-command'
  )
  await expect(panels).toHaveCount(13)
  for (const panel of await panels.all()) {
    await page.mouse.move(4, 4)
    await expect(island(page)).toHaveText('0 findings, exit 0')
    await panel.hover()
    await expect(island(page)).toHaveText(
      /^(component\.code\.background|semantic\.surface\.raised) = /u
    )
    await expect(graphChain(page)).not.toHaveText(IDLE_CHAIN)
    const read = ((await panel.getAttribute('data-tokens')) ?? '').split(' ')
    expect(read).toHaveLength(4)
    for (const path of read) {
      await expect(graphNode(page, path)).toHaveClass(/\bis-lit\b/u)
    }
  }
})

test('pointing at any underlined link lights what it reads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHome(page)
  const links = page.locator('.home a')
  const underlined = await links.evaluateAll(anchors =>
    anchors.flatMap((anchor, index) =>
      getComputedStyle(anchor).textDecorationLine === 'underline' ? [index] : []
    )
  )
  expect(underlined).toHaveLength(7)
  for (const index of underlined) {
    await page.mouse.move(4, 4)
    await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
    await links.nth(index).hover()
    await expect(graphChain(page)).not.toHaveText(IDLE_CHAIN)
  }
})

const chainStates = [
  {
    state: 'on the ink arc',
    prepare: async (page: Page) => {
      await presetButton(page, 'Citrus').click()
    },
    element: heroButton,
    property: 'background-color',
    route:
      'component.button.primary.backgroundHover → semantic.accent.solidHover → primitives.color.brand.72 = ',
  },
  {
    state: 'on the ink arc, away from a hover',
    prepare: async (page: Page) => {
      await presetButton(page, 'Citrus').click()
    },
    element: closeBand,
    property: 'background-color',
    route:
      'component.close.background → semantic.accent.solid → primitives.color.brand.85 = ',
  },
  {
    state: 'with the accent hard-coded',
    prepare: async (page: Page) => {
      await crownSwitch(page, 'Hard-code the accent').click()
      await expect(island(page)).toHaveText(
        'PT1003 semantic.accent.solid',
        CHECK_TIMEOUT
      )
      await presetButton(page, 'Ultramarine').click()
    },
    element: closeBand,
    property: 'background-color',
    route: 'component.close.background → semantic.accent.solid = ',
  },
  {
    state: 'with a skipped layer',
    prepare: async (page: Page) => {
      await crownSwitch(page, 'Skip a layer').click()
      await expect(buildLine(page)).toContainText('exit 1', CHECK_TIMEOUT)
    },
    element: ruleLink,
    property: 'color',
    route: 'component.link.text → primitives.color.brand.45 = ',
  },
] as const

for (const { state, prepare, element, property, route } of chainStates) {
  test(`the chain names the route and the color the page paints ${state}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.emulateMedia({ colorScheme: 'light' })
    await openHome(page)
    await prepare(page)
    await expectAtRest(page)

    await element(page).hover({ position: { x: 8, y: 8 } })
    await expect(graphChain(page)).toContainText(route)
    const chain = (await graphChain(page).textContent()) ?? ''
    const hex = /= (#[\da-f]{6})\b/u.exec(chain)?.[1]
    expect(hex, chain).toBeTruthy()
    await expectPaints(element(page), property, hex ?? '')
  })
}

test('arrow keys walk a roving tab stop through the nodes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const graph = activeGraph(page)
  const stops = graph.locator('.graph-node[tabindex="0"]')
  await expect(stops).toHaveCount(1)
  const focusedPath = () =>
    page.evaluate(
      () => document.activeElement?.getAttribute('data-path') ?? null
    )

  await stops.focus()
  const first = await focusedPath()
  expect(first).toMatch(/^component\./u)
  await expect(graph.locator(`.graph-node[data-path="${first}"]`)).toHaveClass(
    /\bis-lit\b/u
  )
  await expect(graphChain(page)).toContainText(first ?? '')

  await page.keyboard.press('ArrowRight')
  const second = await focusedPath()
  expect(second).not.toBe(first)
  expect(second).toMatch(/^component\./u)
  await expect(stops).toHaveCount(1)
  await expect(stops).toHaveAttribute('data-path', second ?? '')
  await expect(graphChain(page)).toContainText(second ?? '')

  await page.keyboard.press('ArrowLeft')
  expect(await focusedPath()).toBe(first)

  await page.keyboard.press('ArrowDown')
  const semantic = await focusedPath()
  expect(semantic).toMatch(/^semantic\./u)
  await expect(stops).toHaveAttribute('data-path', semantic ?? '')

  await page.keyboard.press('ArrowDown')
  expect(await focusedPath()).toMatch(/^primitives\./u)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  expect(await focusedPath()).toMatch(/^component\./u)

  await page.keyboard.press('End')
  const last = await focusedPath()
  await page.keyboard.press('Home')
  expect(await focusedPath()).toBe(first)
  expect(last).not.toBe(first)

  await page.keyboard.press('Tab')
  await expect(page.locator('.graph-node.is-lit')).toHaveCount(0)
  await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
})

test('the graph takes one tab stop', async ({ page }) => {
  await openHome(page)
  await heroButton(page).focus()

  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute('class') ?? ''
    )
  ).toMatch(/\bgraph-node\b/u)
})

test('a click on a node moves the one tab stop with it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openHome(page)
  const stops = activeGraph(page).locator('.graph-node[tabindex="0"]')

  await graphNode(page, 'primitives.color.neutral.45').click()
  await page.keyboard.press('ArrowRight')
  await expect(stops).toHaveCount(1)
  await expect(stops).toHaveAttribute('data-path', /^primitives\./u)
  await expect(stops).toBeFocused()
})

test('dark re-aliases the semantic layer and leaves the primitives alone', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  const rerouted = tokens.filter(
    token => token.target.light !== token.target.dark
  )
  expect(rerouted.length).toBeGreaterThan(10)
  const primitive = await rootVariable(page, BRAND_45)
  const bodyLight = await computed(page.locator('body'), 'background-color')
  const buttonLight = await computed(heroButton(page), 'background-color')

  const toDark = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Switch to the dark theme' })
  await toDark.click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')

  for (const token of rerouted) {
    expect(
      await rootVariable(page, cssVar(token.path)),
      `${token.path} must re-point at ${token.target.dark}`
    ).toBe(await rootVariable(page, cssVar(token.target.dark ?? '')))
  }
  expect(await rootVariable(page, BRAND_45)).toBe(primitive)

  await expectPaints(
    page.locator('body'),
    'background-color',
    neutralAt(BRAND_HUE, '4').hex
  )
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(BRAND_HUE, '72').hex
  )
  await expectPaints(heroButton(page), 'color', neutralAt(BRAND_HUE, '4').hex)
  expect(await computed(page.locator('body'), 'background-color')).not.toBe(
    bodyLight
  )
  expect(await computed(heroButton(page), 'background-color')).not.toBe(
    buttonLight
  )
  await expect(readout(page, 'Label color')).toHaveText('Dark')
})

test('edges drawn for the inactive theme are not displayed', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const displays = (theme: 'light' | 'dark') =>
    page
      .locator(`.graph-svg-wide .graph-edge[data-only="${theme}"]`)
      .evaluateAll(edges => edges.map(edge => getComputedStyle(edge).display))
  const hasNone = (values: readonly string[]) =>
    values.length > 0 && values.every(value => value === 'none')
  const hasNoHidden = (values: readonly string[]) =>
    values.length > 0 && values.every(value => value !== 'none')

  expect(hasNone(await displays('dark'))).toBe(true)
  expect(hasNoHidden(await displays('light'))).toBe(true)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  expect(hasNone(await displays('light'))).toBe(true)
  expect(hasNoHidden(await displays('dark'))).toBe(true)
})

test('a theme flip re-points what the graph traces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await openHome(page)

  await heroButton(page).hover()
  await expect(graphChain(page)).toContainText(
    `${chainOf('component.button.primary.backgroundHover', 'dark').join(' → ')} = ${brandAt(BRAND_HUE, '85').hex}`
  )
  await expect(
    activeGraph(page).locator(
      '.graph-edge.is-lit[data-from="semantic.accent.solid"][data-to="primitives.color.brand.72"]'
    )
  ).toHaveCount(1)
})

test('the first visit follows the reader color scheme', async ({ page }) => {
  await seedCompiled(page)
  for (const [colorScheme, step] of [
    ['light', '100'],
    ['dark', '4'],
  ] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await expect(html(page)).toHaveAttribute('data-theme', colorScheme)
    await expectPaints(
      page.locator('body'),
      'background-color',
      neutralAt(BRAND_HUE, step).hex
    )
  }
})

test('theme toggle swaps the page between dark and light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openHome(page)

  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  })
  const toLight = navigation.getByRole('button', {
    name: 'Switch to the light theme',
  })
  const toDark = navigation.getByRole('button', {
    name: 'Switch to the dark theme',
  })
  await expect(toLight).toBeVisible()

  await toLight.click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expectPaints(
    page.locator('body'),
    'background-color',
    neutralAt(BRAND_HUE, '100').hex
  )

  await expect(toDark).toBeVisible()
  await toDark.click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
})

test('the stray token shows in its diagram before the switch and the note takes its place after', async ({
  page,
}) => {
  await openHome(page)
  const diagram = page.locator('.rule-diagram[data-rule="stray"]')
  const resting = diagram.locator('.rule-label.when-off')
  await expect(resting).toHaveText('brand.accent')
  await expect(resting).toBeVisible()
  await expect(diagram.locator('.rule-dot.rule-quiet')).toBeVisible()
  await expect(diagram.locator('.rule-note')).toBeHidden()
  expect(
    await page
      .locator('.rule-diagram[data-rule="skip"] .rule-label')
      .allTextContents()
  ).not.toEqual(await diagram.locator('.rule-label').allTextContents())

  await ruleSwitch(page, 'PT1001').click()
  await expect(resting).toBeHidden()
  await expect(diagram.locator('.rule-note')).toHaveText(
    'brand.accent, in no layer'
  )
})

for (const { id, code, label, recording, finding, owners } of breaks) {
  test(`"${label}" prints the real finding and turning it off restores exit 0`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openHome(page)
    const row = ruleRow(page, code)
    const toggle = ruleSwitch(page, code)
    const output = row.locator('.rule-output')
    await expect(toggle).toHaveAccessibleName(label)
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(output).toHaveText('')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(html(page)).toHaveAttribute(
      'data-breaks',
      new RegExp(`\\b${id}\\b`, 'u')
    )
    await expect(output).toContainText('exit 1', CHECK_TIMEOUT)

    // The same lines the real CLI printed for this edit.
    const recorded = siteCli[recording].stderr
      .split('\n')
      .filter(line => /^PT\d{4} /u.test(line))
    const lines = (await output.textContent())?.split('\n') ?? []
    expect(lines).toHaveLength(3)
    const [first = '', ownerLine = '', tail = ''] = lines
    expect(recorded).toContain(first)
    expect(first.startsWith(finding)).toBe(true)
    expect(ownerLine).toBe(`owners: ${owners}`)
    const count = recorded.length
    expect(tail).toBe(count === 1 ? 'exit 1' : `and ${count - 1} more, exit 1`)
    if (id === 'owner') {
      expect(count).toBeGreaterThan(100)
    }

    const [named = ''] = first.split(':')
    await expect(island(page)).toHaveText(
      count === 1 ? named : `${named}, and ${count - 1} more`
    )
    await expect(page.locator('.island-dot')).toHaveAttribute(
      'data-tone',
      'fail'
    )
    await expect(buildLine(page)).toContainText(
      `${id === 'stray' ? tokenCount + 1 : tokenCount} tokens, 3 layers, ${count} ${count === 1 ? 'finding' : 'findings'}, exit 1.`
    )
    await expect(
      row.locator(`.rule-diagram[data-rule="${id}"] .when-on`).first()
    ).not.toHaveCSS('display', 'none')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(output).toHaveText('')
    await expect(island(page)).toHaveText(
      'Rule restored, exit 0',
      CHECK_TIMEOUT
    )
    await expect(buildLine(page)).toContainText(
      `${tokenCount} tokens, 3 layers, 0 findings, exit 0.`
    )
    await expect(html(page)).not.toHaveAttribute(
      'data-breaks',
      new RegExp(`\\b${id}\\b`, 'u')
    )
    await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })
}

test('the dial switches and the rule switches stay in step', async ({
  page,
}) => {
  await openHome(page)

  for (const { code, label } of breaks.slice(0, 2)) {
    await crownSwitch(page, label).click()
    await expect(crownSwitch(page, label)).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(ruleSwitch(page, code)).toHaveAttribute('aria-checked', 'true')
    await expect(ruleRow(page, code).locator('.rule-output')).toContainText(
      'exit 1',
      CHECK_TIMEOUT
    )

    await crownSwitch(page, label).click()
    await expect(ruleSwitch(page, code)).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(buildLine(page)).toContainText('0 findings, exit 0.')
  }
})

test('two broken rules count together and clear one at a time', async ({
  page,
}) => {
  await openHome(page)

  await ruleSwitch(page, 'PT1001').click()
  await expect(buildLine(page)).toContainText(
    '1 finding, exit 1.',
    CHECK_TIMEOUT
  )
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(buildLine(page)).toContainText(
    '2 findings, exit 1.',
    CHECK_TIMEOUT
  )
  await expect(island(page)).toContainText(', and 1 more')

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(buildLine(page)).toContainText(
    '1 finding, exit 1.',
    CHECK_TIMEOUT
  )
  await expect(ruleRow(page, 'PT1003').locator('.rule-output')).toHaveText('')
  await expect(ruleRow(page, 'PT1001').locator('.rule-output')).toContainText(
    'PT1001 brand.accent'
  )

  await ruleSwitch(page, 'PT1001').click()
  await expect(buildLine(page)).toContainText(
    '0 findings, exit 0.',
    CHECK_TIMEOUT
  )
})

test('a hard-coded accent stays behind while a link follows the dial', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 2400 })
  await openHome(page)
  const frozen = brandAt(BRAND_HUE, '45').hex
  const button = heroButton(page)
  const link = ruleLink(page)
  const close = page.locator('.close')
  await expectPaints(button, 'background-color', frozen)
  await expectPaints(link, 'color', frozen)

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )

  await presetButton(page, 'Ultramarine').click()
  await expect(hueDial(page)).toHaveValue('265')
  await expect(island(page)).toHaveText('Hue 265, and the button stayed behind')
  await expectPaints(link, 'color', brandAt(265, '45').hex)
  await expectPaints(button, 'background-color', frozen)
  await expectPaints(close, 'background-color', frozen)
  await expectPaints(
    ruleRow(page, 'PT1003').locator('.button-primary'),
    'background-color',
    frozen
  )

  await hueDial(page).focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(hueDial(page)).toHaveValue('250')
  await expectPaints(link, 'color', brandAt(250, '45').hex)
  await expectPaints(button, 'background-color', frozen)

  await crownSwitch(page, 'Hard-code the accent').click()
  await expectPaints(button, 'background-color', brandAt(250, '45').hex)
  await expectPaints(close, 'background-color', brandAt(250, '45').hex)
})

test('the hero switch sweeps the hue and leaves the dial where it lands', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const frozen = brandAt(BRAND_HUE, '45').hex
  const sweep = BRAND_HUE + 70

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(hueDial(page)).toHaveValue(String(sweep))
  await expectPaints(heroButton(page), 'background-color', frozen)
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(hueDial(page)).toHaveValue(String(sweep))
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(sweep, '45').hex
  )
})

test('a rule row break switched off from the hero restores the hue and the theme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 2400 })
  await openHome(page)

  await ruleSwitch(page, 'PT1003').click()
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE + 70))
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
  await expect(ruleSwitch(page, 'PT1003')).toHaveAttribute(
    'aria-checked',
    'false'
  )

  await ruleSwitch(page, 'PT1004').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await crownSwitch(page, 'Skip a layer').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(ruleSwitch(page, 'PT1004')).toHaveAttribute(
    'aria-checked',
    'false'
  )
})

test('the hard-code switch in its rule row turns the hue to show the cost', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 2400 })
  await openHome(page)
  const row = ruleRow(page, 'PT1003')
  const sweep = BRAND_HUE + 70

  await ruleSwitch(page, 'PT1003').click()
  await expect(hueDial(page)).toHaveValue(String(sweep))
  await expectPaints(ruleLink(page), 'color', brandAt(sweep, '45').hex)
  await expectPaints(
    row.locator('.button-primary'),
    'background-color',
    brandAt(BRAND_HUE, '45').hex
  )
})

test('a skipped layer leaves the link on the primitive, under AA, and says so', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 2400 })
  await openHome(page)
  const link = ruleLink(page)

  await ruleSwitch(page, 'PT1004').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expect(ruleRow(page, 'PT1004').locator('.rule-output')).toContainText(
    'PT1004 component.link.text',
    CHECK_TIMEOUT
  )
  await expectPaints(link, 'color', brandAt(BRAND_HUE, '45').hex)
  expect(await rootVariable(page, '--component-link-text')).toBe(
    await rootVariable(page, BRAND_45)
  )

  // A phone rotation remounts the graph, and the break stays on the root.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#token-graph-narrow')).toBeVisible()
  expect(await rootVariable(page, '--component-link-text')).toBe(
    await rootVariable(page, BRAND_45)
  )
  await expect(ruleSwitch(page, 'PT1004')).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await page.setViewportSize({ width: 1440, height: 2400 })

  const printed = await printedRatio(page, 'Link text')
  expect(printed).toBeLessThan(4.5)
  await expect(readout(page, 'Link text')).toContainText(':1 fails AA')
  await expect(readout(page, 'Link text')).toHaveAttribute('data-fail', '')
  const real = await paintedContrast(
    link,
    'color',
    page.locator('body'),
    'background-color'
  )
  expect(real).toBeLessThan(4.5)

  await ruleSwitch(page, 'PT1004').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expectPaints(link, 'color', brandAt(BRAND_HUE, '45').hex)
  await expect(readout(page, 'Link text')).toContainText(':1 AA')
})

test('a broken rule shows in the graph', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const graph = page.locator('.graph-svg-wide')
  const broken = graph.locator('.graph-break[data-break="skip"]')
  const linkEdges = graph.locator(
    '.graph-edge[data-from="component.link.text"]:not(.graph-break)'
  )
  const accentEdges = graph.locator(
    '.graph-edge[data-from="semantic.accent.solid"][data-only="light"]'
  )
  await expect(broken).toHaveCSS('display', 'none')
  await expect(graph.locator('.graph-stray')).toHaveCSS('display', 'none')
  await expect(accentEdges.first()).not.toHaveCSS('display', 'none')

  await crownSwitch(page, 'Skip a layer').click()
  await expect(broken).not.toHaveCSS('display', 'none')
  await expect(linkEdges.first()).toHaveCSS('display', 'none')

  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(accentEdges.first()).toHaveCSS('display', 'none')

  await ruleSwitch(page, 'PT1001').click()
  await expect(graph.locator('.graph-stray')).not.toHaveCSS('display', 'none')
})

test('a broken rule shows in the phone graph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const graph = page.locator('#token-graph-narrow')
  const broken = graph.locator('.graph-break[data-break="skip"]')
  await expect(graph).toBeVisible()
  await expect(broken).toHaveCSS('display', 'none')
  await expect(graph.locator('.graph-stray')).toHaveCSS('display', 'none')

  await crownSwitch(page, 'Skip a layer').click()
  await expect(graph).toHaveClass(/\bis-focusing\b/u)
  await expect(broken).toHaveClass(/\bis-lit\b/u)
  await expect(broken).not.toHaveCSS('display', 'none')
  await expect(broken).toHaveCSS('fill-opacity', '1')

  await ruleSwitch(page, 'PT1001').click()
  await expect(graph.locator('.graph-stray')).not.toHaveCSS('display', 'none')
})

test('the presets, switches, chooser, and links answer a hover', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const citrus = presetButton(page, 'Citrus')
  const rest = await computed(citrus, 'background-color')
  await citrus.hover()
  await expect.poll(() => computed(citrus, 'background-color')).not.toBe(rest)
  await expectPaints(citrus, 'background-color', neutralAt(BRAND_HUE, '94').hex)

  const yarn = page
    .locator('.hero')
    .getByRole('radio', { name: 'Yarn', exact: true })
    .locator('..')
  const yarnRest = await computed(yarn, 'color')
  await yarn.hover()
  await expect.poll(() => computed(yarn, 'color')).not.toBe(yarnRest)

  const more = page.locator('.section-more .text-link')
  await more.hover()
  await expect(more).toHaveCSS('text-decoration-thickness', '3px')
})

test('the switch track clears 3:1 on its control in both themes', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await openHome(page)
    const control = crownSwitch(page, 'Skip a layer')
    const ratio = await paintedContrast(
      control.locator('.crown-track'),
      'background-color',
      control,
      'background-color'
    )
    expect(ratio, `${colorScheme} track on its control`).toBeGreaterThanOrEqual(
      3
    )
  }
})

test('forced colors keep the swatches and draw an edge on every switch', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await openHome(page)
  const distinct = await page
    .locator('.theme-node-swatch')
    .evaluateAll(
      elements =>
        new Set(
          elements.map(element => getComputedStyle(element).backgroundColor)
        ).size
    )
  expect(distinct).toBeGreaterThan(1)
  await expect(ruleSwitch(page, 'PT1003')).toHaveCSS('border-top-width', '1px')
  await expect(crownSwitch(page, 'Skip a layer')).toHaveCSS(
    'border-top-width',
    '1px'
  )
  await expect(presetButton(page, 'Citrus')).toHaveCSS(
    'border-top-width',
    '1px'
  )
  // A code panel keeps its one edge, on the figure, with none doubled inside it.
  await expect(page.locator('.code-panel').first()).toHaveCSS(
    'border-top-width',
    '1px'
  )
  await expect(page.locator('.code-panel-pre').first()).toHaveCSS(
    'border-top-width',
    '0px'
  )
})

test('every text link is a 44px target', async ({ page }) => {
  await openHome(page)
  for (const link of await page.locator('.text-link').all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test('every inline binding paints the value of its custom property', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  // Fades only delay the value this test compares, so they sit out.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  })

  await expectBindingsHold(page)

  await presetButton(page, 'Ultramarine').click()
  await expect(hueDial(page)).toHaveValue('265')
  await expectBindingsHold(page)

  await presetButton(page, 'Citrus').click()
  await expect(readout(page, 'Label color')).toHaveText('Dark')
  await expectBindingsHold(page)

  await crownSwitch(page, 'Hard-code the accent').click()
  await crownSwitch(page, 'Skip a layer').click()
  await expect(buildLine(page)).toContainText('2 findings', CHECK_TIMEOUT)
  await expectBindingsHold(page)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectBindingsHold(page)
})

test('every bound token exists, and the graph draws a node for it', async ({
  page,
}) => {
  await openHome(page)
  const bound = await page
    .locator('[data-tokens]')
    .evaluateAll(elements =>
      elements.flatMap(element =>
        (element.getAttribute('data-tokens') ?? '').split(' ').filter(Boolean)
      )
    )
  expect(bound.length).toBeGreaterThan(30)

  const known = new Set(tokens.map(token => token.path))
  const drawn = new Set(
    await page
      .locator('.graph-svg-wide .graph-node')
      .evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-path') ?? '')
      )
  )
  expect(bound.filter(path => !known.has(path))).toEqual([])
  expect(bound.filter(path => !drawn.has(path))).toEqual([])
})

test('the page is set in Wotfard and MonoLisa, and the headline reads its tokens', async ({
  page,
}) => {
  await openHome(page)
  const headline = page.getByRole('heading', { level: 1 })

  for (const element of [headline, page.locator('.hero-lede')]) {
    expect(await computed(element, 'font-family')).toMatch(/^Wotfard\b/u)
  }
  for (const element of [
    page.locator('.install-code'),
    page.locator('.rule-code'),
    page.locator('code').first(),
  ]) {
    expect(await computed(element.first(), 'font-family')).toMatch(
      /^MonoLisa\b/u
    )
  }
  expect(await computed(headline, 'font-family')).toBe(
    await rootVariable(page, '--semantic-type-display-fontFamily').then(value =>
      value.replace(/'/gu, '"')
    )
  )
  expect(await computed(headline, 'font-weight')).toBe(
    await rootVariable(page, '--semantic-type-display-fontWeight')
  )
  // The binaries are gitignored, so a machine without them still lands on the
  // same family names. The faces have to be declared either way.
  const faces = await page.evaluate(() =>
    [...document.fonts].map(font => font.family.replaceAll('"', ''))
  )
  expect(faces).toContain('Wotfard')
  expect(faces).toContain('MonoLisa')
  expect(faces).not.toContain('Recursive')
  expect(await computed(headline, 'font-variation-settings')).toBe('normal')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`reduced motion skips the compile and resolves durations to zero in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await recordRootClasses(page)
    await page.goto('/')
    await expectHydrated(page)

    await expect(html(page)).toHaveAttribute('data-motion', 'reduced')
    expect(
      (await rootClasses(page)).filter(classes =>
        classes.includes('is-compiling')
      )
    ).toEqual([])
    await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u)

    const durations = tokens.filter(
      token => token.type === 'duration' && token.layer !== 'primitives'
    )
    expect(durations.length).toBeGreaterThan(3)
    for (const token of durations) {
      expect(
        Number.parseFloat(await rootVariable(page, cssVar(token.path))),
        token.path
      ).toBe(0)
    }

    const timings = await page
      .locator('[data-tokens], .graph-edge, .crown-button, .rule-switch')
      .evaluateAll(elements =>
        elements.flatMap(element => {
          const style = getComputedStyle(element)
          const seconds = (value: string) =>
            value.split(',').map(Number.parseFloat)
          return [
            ...seconds(style.transitionDuration),
            ...seconds(style.transitionDelay),
            ...seconds(style.animationDelay),
          ]
        })
      )
    expect(timings.length).toBeGreaterThan(30)
    // The kill switch in global.css holds durations at 0.01ms.
    expect(timings.filter(value => value > 0.00001)).toEqual([])
  })
}

test('reduced motion keeps every state and drops the wave', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openHome(page)

  await presetButton(page, 'Ultramarine').click()
  await expectPaints(
    heroButton(page),
    'background-color',
    brandAt(265, '45').hex
  )
  await expect(page.locator('.graph-edge.is-hot')).toHaveCount(0)

  await ruleSwitch(page, 'PT1001').click()
  await expect(buildLine(page)).toContainText('exit 1', CHECK_TIMEOUT)
  await expect(page.locator('.graph-svg-wide .graph-stray')).not.toHaveCSS(
    'display',
    'none'
  )
})

test('the root follows a change of the reduced motion setting', async ({
  page,
}) => {
  await openHome(page)
  await expect(html(page)).not.toHaveAttribute('data-motion', /.*/u)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(html(page)).toHaveAttribute('data-motion', 'reduced')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(html(page)).not.toHaveAttribute('data-motion', /.*/u)
})

for (const width of [1440, 390]) {
  test(`the first visit compiles band by band at ${width}px and stops`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await recordRootClasses(page)
    await page.goto('/')

    await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u, {
      timeout: 8000,
    })
    const log = await rootClasses(page)
    expect(log.some(classes => classes.includes('is-compiling'))).toBe(true)
    for (const stage of [
      'show-primitives',
      'show-semantic',
      'show-component',
    ]) {
      expect(
        log.some(classes => classes.includes(stage)),
        stage
      ).toBe(true)
    }
    await expect(html(page)).not.toHaveClass(/\bshow-/u)
    expect(
      await page.evaluate(key => sessionStorage.getItem(key), COMPILED_KEY)
    ).toBe('1')
    await expect(island(page)).toHaveText('0 findings, exit 0')
  })
}

test('the first compile line lands with its band', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const text = document.querySelector('.island-text')?.textContent ?? ''
      if (text.startsWith('Resolving primitives')) {
        const seen = window as unknown as { withBand?: boolean }
        seen.withBand ??=
          document.documentElement.classList.contains('show-primitives')
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { withBand?: boolean }).withBand
      )
    )
    .toBe(true)
})

/** What the headline and the copy wear at the moment the root is compiling. */
function duringCompile(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('.hero-title')
    const style = title === null ? null : getComputedStyle(title)
    return {
      compiling: document.documentElement.classList.contains('is-compiling'),
      family: style?.fontFamily ?? '',
      weight: style?.fontWeight ?? '',
      copy: ['.hero-lede', '.hero-body', '.hero-source', '.crown'].map(
        selector => {
          const element = document.querySelector(selector)
          return element === null ? '' : getComputedStyle(element).opacity
        }
      ),
    }
  })
}

test('the headline wears MonoLisa through the compile and cuts to Wotfard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('show-primitives')
  )

  const during = await duringCompile(page)
  expect(during.compiling).toBe(true)
  expect(during.family).toMatch(/^MonoLisa\b/u)
  expect(during.weight).toBe(
    await rootVariable(page, '--semantic-type-display-fontWeightFrom')
  )
  // The copy stays readable: only the headline and the graph take part.
  expect(during.copy).toEqual(['1', '1', '1', '1'])

  const title = page.locator('.hero-title')
  await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u, {
    timeout: 8000,
  })
  await expect(title).toHaveCSS('font-family', /^Wotfard\b/u)
  await expect(title).toHaveCSS(
    'font-weight',
    await rootVariable(page, '--semantic-type-display-fontWeight')
  )
})

test('a phone keeps Wotfard through the compile, so the headline never rewraps', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForFunction(
    () =>
      document.querySelector('.hero-title') !== null &&
      document.documentElement.classList.contains('is-compiling')
  )

  const during = await duringCompile(page)
  expect(during.compiling).toBe(true)
  expect(during.family).toMatch(/^Wotfard\b/u)
})

test('a pointer press skips the compile', async ({ page }) => {
  await recordRootClasses(page)
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('show-primitives')
  )

  await page.mouse.move(4, 4)
  await page.mouse.down()
  await page.mouse.up()

  await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u)
  await expect(html(page)).not.toHaveClass(/\bshow-/u)
  // Left alone the compile reaches its last band, so its absence proves the skip.
  expect(
    (await rootClasses(page)).filter(classes =>
      classes.includes('show-component')
    )
  ).toEqual([])
  expect(
    await page.evaluate(key => sessionStorage.getItem(key), COMPILED_KEY)
  ).toBe('1')
})

test('a key skips the compile, and Tab lets it run', async ({ page }) => {
  await recordRootClasses(page)
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('show-primitives')
  )

  await page.keyboard.press('Tab')
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains('is-compiling')
    )
  ).toBe(true)

  await page.keyboard.press('Escape')
  await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u)
  expect(
    (await rootClasses(page)).filter(classes =>
      classes.includes('show-component')
    )
  ).toEqual([])
})

test('a second load in the session has no compile', async ({ page }) => {
  await page.goto('/')
  await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u, {
    timeout: 8000,
  })

  await recordRootClasses(page)
  await page.reload()
  await expectHydrated(page)
  expect(
    (await rootClasses(page)).filter(classes =>
      classes.includes('is-compiling')
    )
  ).toEqual([])
  await expect(island(page)).toHaveText('0 findings, exit 0')
})

test('a return visit plays no animation', async ({ page }) => {
  await openHome(page)
  await expect(page.locator('.graph-svg-wide')).toBeVisible()

  expect(
    await page.evaluate(() =>
      document.getAnimations().flatMap(animation => {
        const target = (animation.effect as KeyframeEffect | null)?.target
        return animation.playState === 'running' &&
          target instanceof Element &&
          target.closest('main') !== null
          ? [`${target.tagName} ${target.getAttribute('class')}`]
          : []
      })
    )
  ).toEqual([])
})

test('homepage has no sticky scroll choreography', async ({ page }) => {
  await openHome(page)

  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter(element => getComputedStyle(element).position === 'sticky')
        .map(element => element.getAttribute('class'))
    )
  ).toEqual([])
})

test('the button answers a press with no causal delay', async ({ page }) => {
  await openHome(page)

  const pressDelay = await heroButton(page).evaluate(element => {
    const style = getComputedStyle(element)
    const properties = style.transitionProperty
      .split(',')
      .map(item => item.trim())
    const delays = style.transitionDelay.split(',').map(Number.parseFloat)
    const index = properties.indexOf('transform')
    return index === -1 ? null : delays[index % delays.length]
  })
  expect(pressDelay).toBe(0)
})

test('a rule code stays neutral until its own rule breaks', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const codeOf = (code: string) => ruleRow(page, code).locator('.rule-code')
  const expectNeutral = async (code: string) => {
    await expectPaints(
      codeOf(code),
      'color',
      await rootVariable(page, '--semantic-text-secondary')
    )
    await expectPaints(
      codeOf(code),
      'background-color',
      await rootVariable(page, '--semantic-surface-raised')
    )
  }
  for (const { code } of breaks) {
    await expect(codeOf(code)).toHaveText(code)
    await expectNeutral(code)
  }

  await ruleSwitch(page, 'PT1001').click()
  await expect(buildLine(page)).toContainText('exit 1', CHECK_TIMEOUT)
  await expectPaints(
    codeOf('PT1001'),
    'color',
    await rootVariable(page, '--component-finding-text')
  )
  await expectPaints(
    codeOf('PT1001'),
    'background-color',
    await rootVariable(page, '--component-finding-background')
  )
  for (const code of ['PT1003', 'PT1004', 'PT1005']) {
    await expectNeutral(code)
  }

  await ruleSwitch(page, 'PT1001').click()
  await expect(buildLine(page)).toContainText('exit 0', CHECK_TIMEOUT)
  await expectNeutral('PT1001')
})

test('the rules transcript names who owns the broken token', async ({
  page,
}) => {
  await openHome(page)
  const proof = page.locator('.rules-proof')
  const skip = siteCli['break-skip']
  const json = siteCli['break-skip-json']
  expect(skip.exitCode).toBe(1)
  expect(json.exitCode).toBe(1)
  expect(json.command).toContain('--format json')

  await expect(proof.locator('figcaption')).toContainText(
    'The JSON report names who owns the token. Below is its one finding, one field to a line.'
  )
  await expect(proof.locator('pre')).toContainText(skip.command)
  await expect(proof.locator('pre')).toContainText(
    skip.stderr.split('\n').filter(line => /^PT\d{4} /u.test(line))[0] ?? 'none'
  )
  await expect(proof.locator('pre')).toContainText(json.command)

  const [recorded] = JSON.parse(json.stdout).findings
  expect(recorded.ruleId).toBe('PT1004')
  expect(recorded.owners).toEqual(['design-systems'])
  for (const [field, value] of Object.entries(recorded)) {
    await expect(proof.locator('pre')).toContainText(
      `"${field}": ${JSON.stringify(value)}`
    )
  }
})

test('the workflow answers with four commands, in real transcripts', async ({
  page,
}) => {
  await openHome(page)
  const steps = page.locator('.workflow-steps > .workflow-step')
  await expect(steps).toHaveCount(4)
  await expect(steps.locator('h3')).toHaveText([
    'Fail on a broken rule',
    'Name the owner',
    'List what it reaches',
    'Keep the build current',
  ])

  for (const recording of ['check', 'inspect', 'build-check'] as const) {
    expect(siteCli[recording].exitCode, recording).toBe(0)
  }
  await expect(steps.nth(0).locator('pre')).toContainText(siteCli.check.stdout)
  await expect(steps.nth(1).locator('pre')).toContainText(
    siteCli.inspect.command
  )
  await expect(steps.nth(1).locator('pre')).toContainText(
    siteCli.inspect.stdout
  )
  await expect(steps.nth(2).locator('pre')).toContainText(
    siteCli['diff-theme'].stdout.split('\n').slice(0, 5).join(' ')
  )
  await expect(steps.nth(3).locator('pre')).toContainText(
    siteCli['build-check'].stdout
  )

  // The transcript names the owner this page's own config assigns.
  expect(siteCli.inspect.stdout).toContain('Owners: product-design')
  expect(siteCli.inspect.stdout).toContain(
    `Alias chain: ${chainOf('semantic.accent.solid').join(' -> ')}`
  )
  await expect(steps.nth(1).locator('pre')).toContainText(
    'Owners: product-design'
  )
  await expect(page.locator('.config-file')).toContainText('product-design')

  const ci = page.locator('.workflow-ci')
  await expect(ci.getByRole('heading', { level: 3 })).toHaveText(
    'Put all of it in CI'
  )
  await expect(ci).toContainText('Example workflow')
  for (const command of [
    'npx primitree check',
    'npx primitree build --check',
    'npx primitree diff base.tokens.json tokens.json',
  ]) {
    await expect(ci.locator('.code-panel-pre')).toContainText(command)
  }
})

test('the samples written for the page print plain on the raised card', async ({
  page,
}) => {
  await openHome(page)
  const plain = page.locator('.code-panel[data-plain]')
  await expect(plain).toHaveCount(2)
  await expect(plain.locator('.code-panel-title')).toHaveText([
    'Example workflow',
    'Reading a token in React',
  ])
  await expect(plain.locator('.code-panel-pre span')).toHaveCount(0)
  const surfaces = await page
    .locator('.code-panel')
    .evaluateAll(panels =>
      panels.map(panel => getComputedStyle(panel).backgroundColor)
    )
  expect(new Set(surfaces).size).toBe(2)
  await expectPaints(
    plain.first(),
    'background-color',
    neutralAt(BRAND_HUE, '97').hex
  )
})

test('every code panel prints at one size', async ({ page }) => {
  await openHome(page)
  const sizes = await page
    .locator('.code-panel-pre')
    .evaluateAll(panels =>
      panels.map(panel => getComputedStyle(panel).fontSize)
    )
  expect(sizes).toHaveLength(5)
  expect(new Set(sizes).size).toBe(1)
})

test('the reach section shows what the server returned for these tokens', async ({
  page,
}) => {
  await openHome(page)
  const reach = page.locator('.reach')
  await expect(reach.locator('.section-head p')).toHaveText(
    '@primitree/core holds the rules, @primitree/dtcg reads your tokens and emits the outputs, and the CLI calls them. Your scripts, your agents, and your React app read the same tokens.'
  )

  const library = reach.locator('.reach-library')
  await expect(library.getByRole('heading', { level: 3 })).toHaveText(
    'Run the check from a script'
  )
  await expect(library).toContainText('apps/docs/lib/tokens/page-check-core.ts')
  await expect(library).toContainText('evaluatePolicy')
  const source = readFileSync(
    new URL('../../apps/docs/lib/tokens/page-check-core.ts', import.meta.url),
    'utf8'
  )
  const excerpt =
    /^ {2}const fragment = [\s\S]*?^ {2}const report = .*$/mu.exec(source)?.[0]
  expect(excerpt, 'page-check-core.ts must hold the check calls').toBeTruthy()
  const shown = library.locator('.code-panel-pre')
  for (const line of (excerpt ?? '').split('\n').filter(Boolean)) {
    await expect(shown).toContainText(line.trim())
  }

  const lede = reach.locator('.reach-lede')
  await expect(lede).toContainText('@primitree/mcp')
  await expect(lede).toContainText('@primitree/hooks')
  const order = await reach.evaluate(section => {
    const position = (selector: string) =>
      [...section.querySelectorAll('*')].indexOf(
        section.querySelector(selector) as Element
      )
    return [
      position('.reach-library'),
      position('.reach-lede'),
      position('.reach-body'),
    ]
  })
  expect(order).toEqual([...order].sort((a, b) => a - b))

  const proof = reach.locator('.reach-proof')
  await expect(proof.locator('figcaption')).toContainText('get_token')
  await expect(proof.locator('pre')).toContainText(siteCli.mcp.command)
  await expect(proof.locator('pre')).toContainText(siteCli.mcp.stdout)
  expect(siteCli.mcp.exitCode).toBe(0)
  expect(siteCli.mcp.stdout).toContain('component.button.primary.background')
  expect(siteCli.mcp.stdout).toContain(brandAt(BRAND_HUE, '45').hex)

  await expect(reach).toContainText('Reading a token in React')
  await expect(reach.locator('.reach-body .code-panel-pre')).toContainText(
    /useToken\(\s*'component\.button\.primary\.background'\s*\)/u
  )
  tokenAt('component.button.primary.background')
})

for (const width of [1000, 1440]) {
  test(`the theme section holds the rerouted tokens in one row at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await openHome(page)
    const rerouted = tokens
      .filter(token => token.target.light !== token.target.dark)
      .map(token => token.path)
    const nodes = page.locator('.theme-semantic .theme-node')
    await expect(nodes).toHaveCount(rerouted.length)

    const placed = await nodes.evaluateAll(elements =>
      elements.map(element => ({
        path: element.getAttribute('data-tokens') ?? '',
        top: Math.round(element.getBoundingClientRect().top),
        swatch:
          element.querySelector('.theme-node-swatch')?.getAttribute('style') ??
          '',
      }))
    )
    expect(new Set(placed.map(node => node.top)).size).toBe(1)
    expect(placed.map(node => node.path).sort()).toEqual([...rerouted].sort())
    for (const node of placed) {
      expect(node.swatch).toContain(`var(${cssVar(node.path)})`)
    }
    await expectNoDocumentOverflow(page)
  })
}

test('the ramps show each primitive family, and the ribbons follow the theme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  const ramps = page.locator('.theme-ramps .ramp')
  await expect(ramps).toHaveCount(4)

  for (const [index, family] of [
    'neutral',
    'brand',
    'red',
    'amber',
  ].entries()) {
    await expect(ramps.nth(index)).toHaveAttribute('data-ramp', family)
    const steps = await ramps
      .nth(index)
      .locator('.ramp-step')
      .evaluateAll(elements =>
        elements.map(element => element.getAttribute('data-tokens'))
      )
    expect(steps.sort()).toEqual(
      tokens
        .filter(token => token.path.startsWith(`primitives.color.${family}.`))
        .map(token => token.path)
        .sort()
    )
  }

  const ribbons = (theme: 'light' | 'dark') =>
    page
      .locator(`.theme-ribbons .theme-ribbon[data-only="${theme}"]`)
      .evaluateAll(paths => paths.map(path => getComputedStyle(path).display))
  expect((await ribbons('light')).length).toBeGreaterThan(0)
  expect(new Set(await ribbons('dark'))).toEqual(new Set(['none']))
  expect(await ribbons('light')).not.toContain('none')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  expect(new Set(await ribbons('light'))).toEqual(new Set(['none']))
  expect(await ribbons('dark')).not.toContain('none')
})

test('the config sample carries the whole file and copies it', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await openHome(page)
  const sample = page.locator('.config-file')
  await expect(sample).toContainText('apps/docs/tokens/primitree.config.ts')
  await expect(sample).toContainText("id: 'component'")
  await expect(sample).toContainText('design-systems')

  const copy = sample.getByRole('button', {
    name: 'Copy apps/docs/tokens/primitree.config.ts',
  })
  await copy.click()
  await expect(copy).toHaveAttribute('data-state', 'copied')
  const file = readFileSync(
    new URL('../../apps/docs/tokens/primitree.config.ts', import.meta.url),
    'utf8'
  ).trimEnd()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(file)
})

test('each finding has a plain name, its code, and an anchor', async ({
  page,
}) => {
  await openHome(page)
  for (const { code, name } of breaks) {
    const finding = ruleRow(page, code)
    await expect(
      finding.getByRole('heading', { level: 3, name: `${name} ${code}` })
    ).toBeVisible()
    await expect(finding.locator('.rule-details dt')).toHaveText([
      'Meaning',
      'Example',
      'Cost',
      'Fix',
    ])
    await expect(finding.getByRole('definition')).toHaveCount(4)
  }
})

test('the ledger reads every token on demand', async ({ page }) => {
  await openHome(page)
  const summary = page.locator('.ledger-details summary')
  await expect(summary).toContainText(`Read all ${tokenCount} tokens.`)
  await expect(page.locator('.ledger-table')).toHaveCount(0)

  await summary.click()
  await expect(page.locator('.ledger-table tbody tr')).toHaveCount(
    tokenCount,
    CHECK_TIMEOUT
  )
  await expect(
    page.locator('.ledger-table tbody tr').filter({
      has: page.getByRole('rowheader', {
        name: 'semantic.accent.solid',
        exact: true,
      }),
    })
  ).toContainText('{primitives.color.brand.45}')
})

async function openLedger(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await openHome(page)
  await page.locator('.ledger-details summary').click()
  await expect(page.locator('.ledger-table')).toHaveCount(1, CHECK_TIMEOUT)
  return page.locator('.ledger-table tbody th code')
}

test('a wide ledger keeps every token path on one line', async ({ page }) => {
  const paths = await openLedger(page, 1440)
  const heights = await paths.evaluateAll(codes =>
    codes.map(code => code.getBoundingClientRect().height)
  )
  expect(new Set(heights).size).toBe(1)
})

test('a phone ledger breaks token paths at their dots', async ({ page }) => {
  const paths = await openLedger(page, 390)
  const brokenSegments = await paths.evaluateAll(
    codes =>
      codes.flatMap(code =>
        [...code.childNodes].filter(node => {
          const range = document.createRange()
          range.selectNode(node)
          const tops = [...range.getClientRects()].map(rect => rect.top)
          return new Set(tops).size > 1
        })
      ).length
  )
  expect(brokenSegments).toBe(0)
})

for (const width of [320, 390]) {
  test(`the ledger stays inside the page at ${width}px`, async ({ page }) => {
    await openLedger(page, width)
    const box = await page.locator('.ledger-table').boundingBox()
    expect((box?.x ?? width) + (box?.width ?? 0)).toBeLessThanOrEqual(
      width - 16
    )
  })
}

test('iPad touch contexts can use every switch without overflow', async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    ...devices['iPad Pro 11'],
    baseURL,
  })
  const page = await context.newPage()
  await openHome(page)
  await expect(page.locator('.graph-svg-wide')).toBeVisible()
  await expect(graphChain(page)).toHaveText(
    'Drag along a band to read each token.'
  )

  for (const { code } of breaks) {
    const toggle = ruleSwitch(page, code)
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(ruleRow(page, code).locator('.rule-output')).toContainText(
      'exit 1',
      CHECK_TIMEOUT
    )
    await expectNoDocumentOverflow(page)
  }
  await context.close()
})

for (const width of [720, 834, 1024, 1194, 1279, 1280, 1440]) {
  test(`the graph stays contained with 12px labels at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 2400 })
    await openHome(page)
    await expect(page.locator('.graph-svg-wide')).toBeVisible()
    await expectNoDocumentOverflow(page)
    // The page clips sideways overflow, so the ramp row needs its own check.
    const ramps = page.locator('.theme-ramps')
    await ramps.scrollIntoViewIfNeeded()
    expect(
      await ramps.evaluate(element => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)

    const sizes = await page
      .locator('.graph-band, .graph-types li, .graph-note, .rule-diagram text')
      .evaluateAll(elements =>
        elements.flatMap(element => {
          if (element.getClientRects().length === 0) {
            return []
          }
          const svg = (element as SVGTextElement).ownerSVGElement ?? null
          const scale = svg?.getScreenCTM()?.a ?? 1
          return [Number.parseFloat(getComputedStyle(element).fontSize) * scale]
        })
      )
    expect(sizes.length).toBeGreaterThan(10)
    // A node's Aa glyph samples a font inside a role=img node, and names nothing.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13)
  })
}

test('a wide display holds the page in one capped column', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await openHome(page)

  const header = await page.locator('.site-header-inner').boundingBox()
  const lede = await page.locator('.hero-lede').boundingBox()
  const dial = await page.locator('.crown-dial').boundingBox()
  const close = await page.locator('.close').boundingBox()
  expect(header?.width).toBe(1760)
  expect(lede?.x).toBe(header?.x)
  expect((dial?.x ?? 0) + (dial?.width ?? 0)).toBeLessThanOrEqual(
    (header?.x ?? 0) + 1760
  )
  expect(close?.width).toBe(2560)
})

test('Title type sets the leading its token names', async ({ page }) => {
  await openHome(page)
  const leading = Number.parseFloat(
    await computed(page.locator('html'), '--semantic-type-title-lineHeight')
  )
  for (const selector of [
    '.rule-name',
    '.workflow-copy h3',
    '.limits-list h3',
  ]) {
    const ratio = await page
      .locator(selector)
      .first()
      .evaluate(element => {
        const { fontSize, lineHeight } = getComputedStyle(element)
        return Number.parseFloat(lineHeight) / Number.parseFloat(fontSize)
      })
    expect(ratio, selector).toBeCloseTo(leading, 2)
  }
})

test('a short laptop window keeps the semantic row above the fold', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await openHome(page)

  await expect(
    page.locator('.graph-band[data-layer="semantic"]')
  ).toBeInViewport({ ratio: 1 })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`homepage text clears AA without fading in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)

    await expectReadableText(page.locator(readableText), 13)
  })
}

for (const width of [320, 390]) {
  test(`compact homepage stays readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await openHome(page)

    await expect(page.locator('#token-graph-narrow')).toBeVisible()
    await expect(page.locator('.graph-svg-wide')).toBeHidden()
    await expectReadableText(page.locator(readableText), 13)
    await expectNoDocumentOverflow(page)
  })
}

test('a phone holds every control and finding inside the page width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  await expectNoDocumentOverflow(page)

  for (const { code } of breaks) {
    await ruleSwitch(page, code).click()
    await expect(ruleRow(page, code).locator('.rule-output')).toContainText(
      'exit 1',
      CHECK_TIMEOUT
    )
    await expectNoDocumentOverflow(page)
  }
  await page.locator('.ledger-details summary').click()
  await expect(page.locator('.ledger-table')).toHaveCount(1, CHECK_TIMEOUT)
  await expectNoDocumentOverflow(page)
})

for (const width of [320, 375, 390]) {
  test(`the install stays inside the page margin at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await openHome(page)

    // The page clips sideways overflow, so a scroll-width check cannot see this.
    const edges = await page
      .locator('.hero .install-managers, .hero .install-command')
      .evaluateAll(elements =>
        elements.map(element => element.getBoundingClientRect().right)
      )
    expect(edges).toHaveLength(2)
    for (const right of edges) {
      expect(right).toBeLessThanOrEqual(width - 16)
    }
    const copy = await page.locator('.hero .copy-button').boundingBox()
    expect((copy?.x ?? width) + (copy?.width ?? 0)).toBeLessThanOrEqual(
      width - 16
    )
  })
}

test('phone controls keep 44px targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)

  const undersized = await page
    .locator(
      [
        '.crown-button',
        '.crown-switch',
        '.rule-switch',
        '.button-primary',
        '.copy-button',
        '.install-manager-input',
        '.close-links a',
        '.ledger-details summary',
        '.mobile-nav-trigger',
        '.text-link',
      ].join(', ')
    )
    .evaluateAll(elements =>
      elements.flatMap(element => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (
          style.display === 'none' ||
          box.width === 0 ||
          (box.width >= 44 && box.height >= 44)
        ) {
          return []
        }
        const name =
          element.getAttribute('aria-label') ??
          element.getAttribute('value') ??
          element.textContent?.trim()
        return [`${name}: ${box.width.toFixed(1)}x${box.height.toFixed(1)}`]
      })
    )
  expect(undersized).toEqual([])
})

test('a phone puts the dial and the install on the first screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  const fold = 844

  const dial = await page.locator('.crown-dial').boundingBox()
  expect((dial?.y ?? fold) + (dial?.height ?? 0)).toBeLessThanOrEqual(fold)
  const hero = page.locator('.hero')
  await expect(presetButton(page, 'Citrus')).toBeInViewport()
  // The install starts on the first screen, and its command sits one row past it.
  const install = await hero.locator('.install').boundingBox()
  expect(install?.y ?? fold).toBeLessThan(fold)
  expect((install?.y ?? fold) + (install?.height ?? 0)).toBeLessThan(
    fold * 1.15
  )
  // The graph follows the install, so one screen holds the dial and all three bands.
  const graph = await page.locator('#token-graph-narrow').boundingBox()
  expect(
    (graph?.y ?? fold) + (graph?.height ?? 0) - (dial?.y ?? 0)
  ).toBeLessThan(fold - 64)
})

test('a phone tabs through the hero in the order it shows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)

  const tops: number[] = []
  for (let stop = 0; stop < 14; stop++) {
    await page.keyboard.press('Tab')
    tops.push(
      await page.evaluate(() => {
        const element = document.activeElement
        return element === null || element === document.body
          ? -1
          : element.getBoundingClientRect().top + window.scrollY
      })
    )
  }
  expect(tops.filter(top => top < 0)).toEqual([])
  expect(tops).toEqual([...tops].sort((a, b) => a - b))
  expect(
    await page.evaluate(() => document.activeElement?.textContent)
  ).not.toContain('quickstart')
})

test('the npm command fits its box at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)

  expect(
    await page
      .locator('.hero .install-code')
      .evaluate(element => element.scrollWidth - element.clientWidth)
  ).toBe(0)
})

test('phones trace through the graph', async ({ baseURL, browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL,
  })
  const page = await context.newPage()
  await openHome(page)
  const graph = page.locator('#token-graph-narrow')
  await expect(graph).toBeVisible()
  await expect(graph.locator('.graph-node')).toHaveCount(tokenCount)

  const path = 'semantic.accent.solid'
  await graph.locator(`.graph-node[data-path="${path}"]`).tap()
  await expect(graph.locator('.graph-node.is-lit').first()).toBeAttached()
  await expect(graphChain(page)).toContainText(' → primitives.color.brand.')
  await expect(heroButton(page)).toHaveClass(/\bis-reached\b/u)

  // The finger has lifted, and the readout stays until a touch lands elsewhere.
  await page.waitForTimeout(500)
  await expect(graphChain(page)).toContainText(' → primitives.color.brand.')
  await graphChain(page).tap()
  await expect(graphChain(page)).toHaveText(
    'Drag along a band to read each token.'
  )
  await expectNoDocumentOverflow(page)
  await context.close()
})

test('the page has one h1 and its headings never skip a level', async ({
  page,
}) => {
  await openHome(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

  const headings = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll(elements =>
      elements.map(element => ({
        level: Number(element.tagName.slice(1)),
        text: element.textContent?.trim() ?? '',
      }))
    )
  expect(headings[0]?.level).toBe(1)
  expect(headings.filter(heading => heading.text === '')).toEqual([])
  for (const [index, heading] of headings.entries()) {
    const previous = headings[index - 1]
    if (previous !== undefined) {
      expect(
        heading.level - previous.level,
        `"${heading.text}" follows "${previous.text}"`
      ).toBeLessThanOrEqual(1)
    }
  }
})

test('the keyboard reaches every control and shows where it landed', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)

  const stops: { name: string; className: string; ring: boolean }[] = []
  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const active = document.activeElement
      if (
        active === null ||
        active === document.body ||
        active.localName === 'nextjs-portal'
      ) {
        return null
      }
      const hasOutline = (element: Element | null) => {
        if (element === null) {
          return false
        }
        const style = getComputedStyle(element)
        return (
          style.outlineStyle !== 'none' &&
          Number.parseFloat(style.outlineWidth) > 0
        )
      }
      const opaque = getComputedStyle(active).opacity !== '0'
      const ring =
        (opaque && hasOutline(active)) ||
        hasOutline(active.closest('.install-manager')) ||
        hasOutline(active.closest('.crown-dial')) ||
        hasOutline(active.closest('.code-panel')) ||
        [...active.children].some(
          child =>
            active.matches('.graph-node') &&
            getComputedStyle(child).strokeWidth === '2.5px'
        )
      return {
        name: (
          active.getAttribute('aria-label') ??
          active.getAttribute('value') ??
          active.textContent ??
          ''
        )
          .trim()
          .slice(0, 48),
        className: active.getAttribute('class') ?? active.tagName,
        ring,
      }
    })
    if (stop === null) {
      break
    }
    stops.push(stop)
  }

  const reached = (pattern: RegExp) =>
    stops.some(stop => pattern.test(`${stop.className} ${stop.name}`))
  for (const control of [
    /install-manager-input npm/u,
    /copy-button Copy npm install/u,
    /button-primary Read the quickstart/u,
    /crown-input Brand hue/u,
    /crown-button Greenshield/u,
    /crown-button Citrus/u,
    /crown-switch Hard-code the accent/u,
    /crown-switch Skip a layer/u,
    /graph-node\b.* component\./u,
    /rule-switch Hard-code the accent/u,
    /rule-switch Remove the default owner/u,
    /copy-button\b.* Copy apps\/docs\/tokens/u,
    /SUMMARY/u,
    /Source on GitHub/u,
  ]) {
    expect(reached(control), `Tab must reach ${control}`).toBe(true)
  }
  expect(stops.filter(stop => !stop.ring)).toEqual([])
})

test('a copy control keeps its focus ring inside the command panel', async ({
  page,
}) => {
  await openHome(page)
  const copy = page.locator('.hero .copy-button')
  await page
    .locator('.hero')
    .getByRole('radio', { name: 'npm', exact: true })
    .focus()
  await page.keyboard.press('Tab')
  await expect(copy).toBeFocused()

  const clipped = await copy.evaluate(element => {
    const style = getComputedStyle(element)
    const reach =
      Number.parseFloat(style.outlineWidth) +
      Number.parseFloat(style.outlineOffset)
    const box = element.getBoundingClientRect()
    const edges: string[] = []
    for (
      let parent = element.parentElement;
      parent !== null;
      parent = parent.parentElement
    ) {
      if (getComputedStyle(parent).overflowX === 'visible') {
        continue
      }
      const frame = parent.getBoundingClientRect()
      if (box.top - reach < frame.top) {
        edges.push(`${parent.className} top`)
      }
      if (box.bottom + reach > frame.bottom) {
        edges.push(`${parent.className} bottom`)
      }
      if (box.right + reach > frame.right) {
        edges.push(`${parent.className} right`)
      }
    }
    return edges
  })
  expect(clipped).toEqual([])
})

for (const width of [1440, 390]) {
  test(`nothing focusable sits under aria-hidden at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await openHome(page)
    await expect(activeGraph(page)).toBeVisible()

    const hiddenFocusable = await page.evaluate(() => {
      const focusable =
        'a[href], button, input, select, textarea, summary, [tabindex]'
      return [...document.querySelectorAll('[aria-hidden="true"]')].flatMap(
        hidden =>
          [hidden, ...hidden.querySelectorAll(focusable)]
            .filter(
              element =>
                element.matches(focusable) &&
                (element as HTMLElement).tabIndex >= 0 &&
                element.getClientRects().length > 0
            )
            .map(element => element.getAttribute('class') ?? element.tagName)
      )
    })
    expect(hiddenFocusable).toEqual([])
  })
}

test('status regions announce the check and the Island', async ({ page }) => {
  await openHome(page)

  await expect(page.locator('.island [role="status"]')).toHaveText(
    '0 findings, exit 0'
  )
  await ruleSwitch(page, 'PT1001').click()
  await expect(
    ruleRow(page, 'PT1001').locator('.rule-output[role="status"]')
  ).toContainText('PT1001 brand.accent', CHECK_TIMEOUT)
  await expect(page.locator('.island [role="status"]')).toHaveText(
    'PT1001 brand.accent'
  )
})

/* ---------- layout stability and load ---------- */

test('the document keeps one height through a scroll', async ({ page }) => {
  await openHome(page)
  const scrollHeight = () =>
    page.evaluate(() => document.documentElement.scrollHeight)
  const heights = new Set([await scrollHeight()])
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.wheel(0, 450)
    heights.add(await scrollHeight())
  }
  expect([...heights]).toHaveLength(1)
})

test('the fallback faces sit behind Wotfard and MonoLisa', async ({ page }) => {
  await openHome(page)
  expect(await computed(page.locator('.hero-lede'), 'font-family')).toMatch(
    /^Wotfard, "Wotfard fallback"/u
  )
  expect(
    await computed(page.locator('.install-code').first(), 'font-family')
  ).toMatch(/^MonoLisa, "MonoLisa fallback"/u)
  const faces = await page.evaluate(() =>
    [...document.fonts].map(font => font.family.replaceAll('"', ''))
  )
  expect(faces).toContain('Wotfard fallback')
  expect(faces).toContain('MonoLisa fallback')
})

test('each font preloads once', async ({ page }) => {
  await openHome(page)
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(link =>
      link.getAttribute('href')
    )
  )
  expect(hrefs).toHaveLength(3)
  expect(new Set(hrefs).size).toBe(3)
})

test('a late bundle still ends the compile in the engine', async ({ page }) => {
  const releaseAt = Date.now() + 3300
  await page.route(/\/_next\/static\/chunks\/.*\.js/u, async route => {
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, releaseAt - Date.now()))
    )
    await route.continue()
  })
  await page.goto('/')

  await expect(html(page)).toHaveClass(/\bshow-primitives\b/u, {
    timeout: 8000,
  })
  await expect(html(page)).not.toHaveAttribute('data-compile-timer', /.*/u)
  await expect(html(page)).not.toHaveClass(/\bis-compiling\b/u, {
    timeout: 8000,
  })
  await expect(html(page)).not.toHaveClass(/\bshow-/u)
  expect(
    await page.evaluate(key => sessionStorage.getItem(key), COMPILED_KEY)
  ).toBe('1')
  await expect(island(page)).toHaveText('0 findings, exit 0')
})

test('a stored hue outside the dial lands on the brand hue', async ({
  page,
}) => {
  await seedCompiled(page)
  await page.addInitScript(key => sessionStorage.setItem(key, '-50'), HUE_KEY)
  await page.goto('/')
  await expectHydrated(page)

  await expect(page.locator('.crown-value')).toHaveText(String(BRAND_HUE))
  await expect(hueDial(page)).toHaveValue(String(BRAND_HUE))
  expect((await html(page).getAttribute('style')) ?? '').not.toMatch(
    /--page-hue/u
  )
})

test('a stored hue turns the knob before the bundle arrives', async ({
  page,
}) => {
  const hue = 265
  const blob = (['neutral', 'brand'] as const).flatMap(family =>
    Object.entries(solved(hue)[family]).map(([step, color]) => [
      `--primitives-color-${family}-${step}`,
      cssColor(color),
    ])
  )
  await seedCompiled(page)
  await page.addInitScript(
    ([hueKey, storageKey, stored, overrides]) => {
      sessionStorage.setItem(hueKey, stored)
      sessionStorage.setItem(storageKey, overrides)
    },
    [HUE_KEY, STORAGE_KEY, String(hue), JSON.stringify(blob)] as const
  )
  await page.route(/\/_next\/static\/chunks\/.*\.js/u, route => route.abort())
  await page.goto('/')

  const knob = page.locator('.crown-knob')
  const [dial, box] = await Promise.all([
    page.locator('.crown-dial').boundingBox(),
    knob.boundingBox(),
  ])
  if (dial === null || box === null) {
    throw new Error('The dial did not render.')
  }
  const angle = ((hue - 90) * Math.PI) / 180
  const scale = 200 / dial.width
  expect((box.x + box.width / 2 - dial.x) * scale).toBeCloseTo(
    100 + 80 * Math.cos(angle),
    0
  )
  expect((box.y + box.height / 2 - dial.y) * scale).toBeCloseTo(
    100 + 80 * Math.sin(angle),
    0
  )
  await expect(page.locator('.crown-value')).toBeHidden()
})

test('the Island refits when its cell widens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page)
  await crownSwitch(page, 'Hard-code the accent').click()
  await expect(island(page)).toHaveText(
    'PT1003 semantic.accent.solid',
    CHECK_TIMEOUT
  )
  await page.setViewportSize({ width: 844, height: 390 })
  await expect
    .poll(() =>
      page
        .locator('.island')
        .evaluate(
          shell =>
            (shell.querySelector('.island-inner')?.getBoundingClientRect()
              .right ?? 0) - shell.getBoundingClientRect().right
        )
    )
    .toBeLessThanOrEqual(0)
})

test('without script the chooser and the caption read right', async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  })
  const page = await context.newPage()
  await page.goto('/')
  const hero = page.locator('.hero')

  await hero.getByText('pnpm', { exact: true }).click()
  await expect(
    hero.getByRole('radio', { name: 'pnpm', exact: true })
  ).toBeChecked()
  await expect(shownCommand(hero)).toHaveText('pnpm add -D @primitree/cli@next')
  await expect(graphChain(page)).toHaveText(IDLE_CHAIN)
  expect(await computed(graphChain(page), 'font-family')).toMatch(/^Wotfard\b/u)
  await context.close()
})
