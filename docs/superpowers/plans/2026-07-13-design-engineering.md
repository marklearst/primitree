# Design Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair responsive, keyboard, landmark, state-announcement, and stale-result behavior across the docs site, both playgrounds, and the Figma plugin without redesigning the established FigmaVars visual language.

**Architecture:** Browser-level tests protect narrow-layout and semantic behavior in the Next and Vite applications. Native disclosure, radio, button, and landmark semantics carry interaction behavior with minimal custom JavaScript. The plugin keeps its zero-framework UI but exposes a testable result-clearing state transition in jsdom.

**Tech Stack:** React 19, Next.js 16, Vite 8, CSS/Tailwind 4, Playwright 1.61.1, Vitest 4, jsdom 29.1.1.

## Global Constraints

- Preserve the current FigmaVars dark visual direction and information architecture.
- At 320 px and 375 px, pages have no document-level horizontal scrolling; wide data scrolls inside a labeled local region.
- Touch-layout interactive targets are at least 44 by 44 CSS pixels.
- Hover styles run only under `(hover: hover) and (pointer: fine)`; keyboard focus remains visibly distinct.
- Each application exposes one meaningful `main` landmark and one persistent page-level `h1` in the accessibility tree.
- Tabs expose tablist/tab/tabpanel state and arrow-key operation; context choice uses native radio semantics.
- File/export errors use an assertive live region.
- Starting, invalidating, or failing a plugin export removes stale download/copy data before actions can run.
- Respect `prefers-reduced-motion`; existing decorative hiding and reduced-motion behavior remain intact.
- No merge, push, tag, npm publication, deployment, or external npm/GitHub mutation.
- No new public package or runtime dependency; Playwright and jsdom are private test-only dependencies.

---

### Task 1: Browser regression harness and docs shell

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Create: `playwright.config.ts`
- Create: `tests/e2e/docs-shell.spec.ts`
- Modify: `apps/docs/components/landing/site-chrome.tsx`
- Modify: `apps/docs/components/brand-logo.tsx`
- Modify: `apps/docs/app/docs/[[...slug]]/page.tsx`
- Modify: `apps/docs/app/global.css`

**Interfaces:**

- Consumes: docs server at `http://127.0.0.1:3000`.
- Produces: `pnpm test:e2e`; native mobile navigation disclosure; one `main` on marketing and docs pages.

- [ ] **Step 1: Add the private Playwright dependency and scripts**

Run:

```bash
pnpm add -Dw @playwright/test@1.61.1
pnpm exec playwright install chromium
```

The release-hardening slice raises the private workspace/tooling floor to Node
20.19 before the final gate; public package consumer engines remain unchanged.

Add root scripts:

```json
{
  "test:e2e": "playwright test",
  "test:e2e:install": "playwright install --with-deps chromium"
}
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm --filter figmavars-docs dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

Add `/playwright-report/`, `/test-results/`, and `/.playwright-cli/` to
`.gitignore`; these are browser-test artifacts, including the current local
trace directory, and are never committed.

- [ ] **Step 2: Write failing mobile-shell and landmark tests**

Create `docs-shell.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const widths = [320, 375] as const

async function expectNoDocumentOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectTouchTarget(locator: import('@playwright/test').Locator) {
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
```

- [ ] **Step 3: Run the browser test and record RED**

```bash
pnpm exec playwright test tests/e2e/docs-shell.spec.ts --project=docs
```

Expected: the mobile disclosure and `main` landmarks do not exist; the 375 px shell may overflow/collapse the logo.

- [ ] **Step 4: Implement native mobile navigation and landmarks**

In `SiteHeader`, keep the current desktop nav under `hidden sm:flex` and add:

```tsx
<details
  className='mobile-nav sm:hidden'
  aria-label='Navigation'>
  <summary>Menu</summary>
  <nav aria-label='Mobile navigation'>
    {nav.map(item => (
      <Link
        key={item.key}
        href={item.href}
        target={item.external ? '_blank' : undefined}
        rel={item.external ? 'noopener noreferrer' : undefined}>
        {item.label}
      </Link>
    ))}
    <Link href='/docs/getting-started'>Get started</Link>
  </nav>
</details>
```

Use responsive header padding that leaves the linked wordmark a non-zero flex
basis. Give the linked logo a visible `focus-visible` outline.

Change `MarketingShell`'s content wrapper from `div` to:

```tsx
<main className='relative'>{children}</main>
```

Wrap `DocsPage` in a single `main` whose children are the current page
composition:

```tsx
<main className='contents'>
  <DocsPage>{pageContent}</DocsPage>
</main>
```

Use the page's current content expression in place of `pageContent`; do not add
a literal variable if the component currently renders the expression inline.

- [ ] **Step 5: Add touch/focus/fine-pointer CSS**

Give the mobile summary and links a minimum block size of 44 px. Add shared
`:focus-visible` outlines using `--color-fv-accent`. Replace Tailwind `hover:`
utilities in `site-chrome.tsx` and `brand-logo.tsx` with named classes. Put
their hover declarations and every current `.btn-primary`, `.btn-ghost`,
`.feature-row`, `.feature-row-arrow`, and `.workflow-link` hover selector in
`@media (hover: hover) and (pointer: fine)`. Do not move non-hover base
declarations into the media query.

- [ ] **Step 6: Verify GREEN and docs build**

```bash
pnpm exec playwright test tests/e2e/docs-shell.spec.ts --project=docs
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

Expected: 320/375 tests, landmark assertions, typecheck, and build pass.

- [ ] **Step 7: Commit the task**

```bash
git add package.json pnpm-lock.yaml .gitignore playwright.config.ts tests/e2e/docs-shell.spec.ts apps/docs/components/landing/site-chrome.tsx apps/docs/components/brand-logo.tsx apps/docs/app/docs/\[\[...slug\]\]/page.tsx apps/docs/app/global.css
git commit -m "fix(docs): restore mobile navigation and landmarks"
```

### Task 2: Embedded playground semantics and containment

**Files:**

- Create: `tests/e2e/docs-playground.spec.ts`
- Modify: `apps/docs/components/playground/playground-app.tsx`
- Modify: `apps/docs/components/playground/playground.css`

**Interfaces:**

- Consumes: sample-data action on `/playground`.
- Produces: persistent heading, semantic tabs/radios, announced errors, and contained wide tables.

- [ ] **Step 1: Write failing semantic and narrow-layout tests**

```ts
import { expect, test } from '@playwright/test'

const widths = [320, 375] as const

for (const width of widths) {
  test(`embedded playground is semantic at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/playground')
    await page.getByRole('button', { name: 'Try the sample' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    const tokens = page.getByRole('tab', { name: 'Tokens' })
    const files = page.getByRole('tab', { name: 'Generated files' })
    await expect(tokens).toHaveAttribute('aria-selected', 'true')
    await tokens.press('ArrowRight')
    await expect(files).toBeFocused()
    await expect(files).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel', { name: 'Generated files' })).toBeVisible()
    await files.press('ArrowLeft')
    await expect(tokens).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('radio').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Generated tokens' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
    for (const target of [tokens, files, page.locator('.pg-chip').first()]) {
      const box = await target.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('embedded playground announces malformed JSON', async ({ page }) => {
  await page.goto('/playground')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).not.toHaveText('')
})
```

- [ ] **Step 2: Run the test and record RED**

```bash
pnpm exec playwright test tests/e2e/docs-playground.spec.ts --project=docs
```

Expected: after preview there is no h1, tabs/radios lack roles/state, errors lack `role="alert"`, and the table has no contained region.

- [ ] **Step 3: Keep one page heading and use native context radios**

Render the page `h1` outside the preview conditional; apply a visually-hidden
class while the report is visible rather than unmounting it. Preserve a space
across the visual line break so the accessible name does not concatenate words.

Replace context buttons with a fieldset per axis:

```tsx
<fieldset className='pg-axis'>
  <legend className='pg-axis-name'>{axis}</legend>
  <div className='pg-axis-options'>
    {contexts.map(context => (
      <label
        className='pg-chip'
        key={context}>
        <input
          type='radio'
          name={`context-${axis}`}
          value={context}
          checked={selection[axis] === context}
          onChange={() => setSelection(previous => ({ ...previous, [axis]: context }))}
        />
        <span>{context}</span>
      </label>
    ))}
  </div>
</fieldset>
```

Reset `.pg-axis` fieldsets with `min-inline-size: 0`, `border: 0`, `margin: 0`,
and `padding: 0` before applying the current layout styles.

- [ ] **Step 4: Implement tab state and keyboard movement**

Use two refs and a small ordered tab array. Each button gets `role="tab"`,
`aria-selected`, `aria-controls`, `id`, and roving `tabIndex`. The tablist handles
ArrowLeft/ArrowRight/Home/End by updating the active tab and focusing its ref.
Each content section gets `role="tabpanel"`, `id`, `aria-labelledby`, and
`hidden` when inactive.

- [ ] **Step 5: Announce errors and contain wide output**

Set `role="alert"` on `.pg-error`. Wrap `.pg-token-table` in:

```tsx
<div
  className='pg-table-region'
  role='region'
  aria-label='Generated tokens'
  tabIndex={0}>
  {tokenTable}
</div>
```

Replace `tokenTable` with the current `.pg-token-table` element and its current
children; the wrapper is additive and must not duplicate the table.

At 320/375 px, allow actions, axes, and file layouts to wrap; make
`.pg-table-region` own horizontal overflow. Set touch targets to 44 px, add
`:focus-visible`, and put every `.pg-link`, `.pg-button`, and `.pg-footnote a`
hover selector behind the fine-pointer media query.

- [ ] **Step 6: Verify GREEN**

```bash
pnpm exec playwright test tests/e2e/docs-playground.spec.ts --project=docs
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

Expected: semantic state, live error, narrow containment, typecheck, and build pass.

- [ ] **Step 7: Commit the task**

```bash
git add tests/e2e/docs-playground.spec.ts apps/docs/components/playground/playground-app.tsx apps/docs/components/playground/playground.css
git commit -m "fix(docs): make the playground keyboard accessible"
```

### Task 3: Standalone playground parity

**Files:**

- Modify: `playwright.config.ts`
- Create: `tests/e2e/standalone-playground.spec.ts`
- Modify: `apps/playground/src/App.tsx`
- Modify: `apps/playground/src/styles.css`

**Interfaces:**

- Consumes: standalone Vite server at `http://127.0.0.1:4173`.
- Produces: the same heading/tab/radio/error/table contract as the embedded playground.

- [ ] **Step 1: Add the Vite web server to Playwright**

Change `webServer` to an array and add:

```ts
{
  command: 'pnpm --filter figmavars-playground dev --host 127.0.0.1 --port 4173',
  url: 'http://127.0.0.1:4173',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

- [ ] **Step 2: Write the standalone RED test**

Repeat the complete Task 2 tab/radio/error/table assertions against
`http://127.0.0.1:4173` for both 320 and 375 px. Before and after loading the
sample, assert one `main`, one `h1`, no document overflow, and at least 44 px
bounds for visible buttons, tabs, and context labels. Use this helper for the
brand, header links, report actions, and context controls:

```ts
async function expectInsideViewport(
  locator: import('@playwright/test').Locator,
  viewportWidth: number
) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1)
}
```

Add the same exact malformed JSON upload used in Task 2. Add a reduced-motion
case with `page.emulateMedia({ reducedMotion: 'reduce' })`; after loading the
sample, parse the computed `transitionDuration` and `animationDuration` for a
button and assert both are at most `0.001` seconds.

- [ ] **Step 3: Run and record RED**

```bash
pnpm exec playwright test tests/e2e/standalone-playground.spec.ts --project=standalone-playground
```

Expected: semantic and overflow assertions fail.

- [ ] **Step 4: Port the same semantic structure and responsive rules**

Replace the two conditional `<main>` elements with one persistent `<main>`
around the landing/report state. Keep the h1 mounted in that main and visually
hide it during the report. Use the same native radio fieldsets (including
fieldsets resets), tab/tabpanel IDs and keyboard handler, `role="alert"`, and
labeled table region as Task 2. In standalone CSS, wrap `.header`, `.brand`,
`.header-links`, `.report-actions`, and `.axis` at content-driven breakpoints.
Do not hide GitHub/npm links. Put header/footer/button/chip/file hover selectors
behind the fine-pointer media query and add a `prefers-reduced-motion: reduce`
rule that reduces all animation/transition durations to `0.01ms` and disables
smooth scrolling.

- [ ] **Step 5: Verify GREEN and package gates**

```bash
pnpm exec playwright test tests/e2e/standalone-playground.spec.ts --project=standalone-playground
pnpm --filter figmavars-playground test
pnpm --filter figmavars-playground typecheck
pnpm --filter figmavars-playground build
```

Expected: browser test and all private app gates pass.

- [ ] **Step 6: Commit the task**

```bash
git add playwright.config.ts tests/e2e/standalone-playground.spec.ts apps/playground/src/App.tsx apps/playground/src/styles.css
git commit -m "fix(playground): harmonize responsive interaction states"
```

### Task 4: Plugin stale-result invalidation

**Files:**

- Modify: `apps/figma-plugin/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/figma-plugin/src/ui.ts`
- Modify: `apps/figma-plugin/src/ui.css`
- Create: `apps/figma-plugin/tests/ui-state.test.ts`

**Interfaces:**

- Consumes: plugin `ready`, `exported`, and `error` messages.
- Produces: `clearExportResult()` state transition that invalidates JSON, filename, stats, actions, and copy feedback.

- [ ] **Step 1: Add jsdom to the private plugin app**

```bash
pnpm --filter figmavars-plugin add -D jsdom@29.1.1
```

- [ ] **Step 2: Write the failing success-to-retry/error test**

Create `ui-state.test.ts` with `// @vitest-environment jsdom`. Capture the
original `navigator.clipboard` property descriptor at module scope. In
`beforeEach`, call `vi.resetModules()`, install this complete fixture, then mock
`window.parent.postMessage`, `URL.createObjectURL`, `URL.revokeObjectURL`, and
`navigator.clipboard.writeText` before dynamically importing `../src/ui`:

```ts
document.body.innerHTML = `
  <p id="file-name"></p>
  <label><input id="exclude-hidden" type="checkbox">Exclude hidden</label>
  <button id="export-btn" type="button">Export JSON</button>
  <div id="stats"></div>
  <div id="actions" class="hidden">
    <button id="download-btn" type="button">Download</button>
    <button id="copy-btn" type="button">Copy</button>
  </div>
  <p id="error"></p>
`
vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
})
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
})
await import('../src/ui')
```

In `afterEach`, call `vi.restoreAllMocks()` and `vi.unstubAllGlobals()`, then
restore the original clipboard descriptor (or delete the test property when it
was originally absent). Clear `document.body`. The DOM and browser API stubs
must not leak into another plugin test.

The first test sequence is:

```ts
window.dispatchEvent(
  new MessageEvent('message', {
    data: {
      pluginMessage: {
        type: 'exported',
        json: '{"meta":{}}',
        summary: { collections: 1, variables: 1, modes: 1, fileName: 'tokens.json' },
      },
    },
  })
)
expect(actions.classList.contains('hidden')).toBe(false)

exportButton.click()
expect(actions.classList.contains('hidden')).toBe(true)

window.dispatchEvent(
  new MessageEvent('message', {
    data: { pluginMessage: { type: 'error', message: 'Export failed' } },
  })
)
expect(actions.classList.contains('hidden')).toBe(true)
expect(error.textContent).toBe('Export failed')
downloadButton.click()
expect(URL.createObjectURL).not.toHaveBeenCalled()
```

The post-error click is required because `setExporting(true)` temporarily
disables Download and a click on a disabled button proves nothing. Add a second
case: after success, dispatch `change` on `exclude-hidden`, assert actions are
hidden, click the now-enabled Copy button, and assert
`navigator.clipboard.writeText` was never called.

- [ ] **Step 3: Run and record RED**

```bash
pnpm --filter figmavars-plugin exec vitest run tests/ui-state.test.ts
```

Expected: actions remain visible and stale JSON can still be downloaded/copied.

- [ ] **Step 4: Centralize result and busy state**

Implement:

```ts
function clearExportResult() {
  latestJson = ''
  latestFileName = 'variables.json'
  statsEl.textContent = ''
  actionsEl.classList.add('hidden')
  copyBtn.textContent = 'Copy'
}

function setExporting(exporting: boolean) {
  exportBtn.disabled = exporting
  excludeHidden.disabled = exporting
  downloadBtn.disabled = exporting
  copyBtn.disabled = exporting
  exportBtn.textContent = exporting ? 'Exporting…' : 'Export JSON'
}
```

Call `clearExportResult()` before posting a new export, on every error, and on
`excludeHidden` change. Call `setExporting(true)` only while a request is in
flight and reset it for exported/error responses.

- [ ] **Step 5: Apply interaction styling**

Make buttons and the checkbox-label row at least 44 px tall, add a visible
`:focus-visible` outline, give disabled ghost buttons a clear state, and gate
hover-only link/button decoration behind fine-pointer media queries.

- [ ] **Step 6: Verify GREEN and build artifacts**

```bash
pnpm --filter figmavars-plugin exec vitest run tests/ui-state.test.ts
pnpm --filter figmavars-plugin typecheck
pnpm --filter figmavars-plugin build
pnpm --filter figmavars-plugin test
```

Expected: stale output is unusable after retry/error/options change; typecheck, build, and tests pass.

- [ ] **Step 7: Commit the task**

```bash
git add apps/figma-plugin/package.json pnpm-lock.yaml apps/figma-plugin/src/ui.ts apps/figma-plugin/src/ui.css apps/figma-plugin/tests/ui-state.test.ts
git commit -m "fix(plugin): invalidate stale export results"
```
