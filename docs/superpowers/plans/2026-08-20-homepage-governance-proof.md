# Homepage Governance Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scroll-choreographed Living Canopy with a click-driven proof panel, a diff terminal, and a merged config section, per the spec at `docs/superpowers/specs/2026-08-20-homepage-governance-proof-design.md`.

**Architecture:** `governance-demo.ts` gains a precomputed proposal deck built through `@primitree/core` and `@primitree/dtcg` at build time. A client `ProofPanel` switches between deck outcomes. A presentational `TokenTree` renders HTML nodes with CSS connectors. `governance-home.tsx` composes five sections in normal flow. Brand validators and tests retarget from the canopy to the new components.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 with handwritten classes in `apps/docs/app/global.css`, node:test, Playwright.

## Global Constraints

- Every string in TSX, including comments, passes `node scripts/check-prose.mjs`. Write zero comments in new components. Banned in copy, from `scripts/prose/rules.mjs`: em dashes, passive voice, `ensure`, `you can`, `lets you`, `only`, most `ly` adverbs, sentence-initial `If`, `Then`, or Wh-words, `simple`, `easy`, `consistent`, `flexible`, `seamless`, `powerful`.
- Color values in UI sources pass `node scripts/check-brand.mjs`. Use `--color-primitree-*` variables from `global.css:5-26`. No former brand hex values.
- No scroll observers, no sticky choreography, no `pointermove` listeners, no infinite animations. Brand rules enforce the last two on every `apps/docs/components/landing/` file.
- Node >= 24, pnpm >= 11. Run docs commands as `pnpm --filter primitree-docs run <script>` from the repo root.
- Commit after each task on branch `feat/homepage-governance-proof`.

## Verified engine facts

Values below come from running the packages in this workspace on 2026-08-20. Tests in the tasks pin them.

- Green primitive `{ colorSpace: 'srgb', components: [0.372549, 0.498039, 0.184314], alpha: 1 }` resolves to hex `#5f7f2f` and passes policy with 0 findings when `semantic.color.bg.brand` aliases it.
- `buildDTCGOutputs` emits `css/tokens.css` containing `  --semantic-color-bg-brand: var(--primitives-color-blue-500);` and `ts/tokens.ts` containing `  ["semantic.color.bg.brand"]: "color(srgb 0.2 0.4 1)",` for the baseline document.
- `diffGraphViews(before, after)` for the rename returns five changes in this order: `changed component.button.bg`, `changed component.focus.ring`, `changed component.nav.active.bg`, `removed semantic.color.bg.brand`, `added semantic.color.bg.primary`. The removed and added changes each list the three component consumers as impacted. `GraphChange` reads `{ kind, tokenId, impactedTokenIds }`.
- The blocked finding stays `PT1004` with message `Layer semantic cannot reference layer component.`

---

### Task 1: Proposal deck in governance-demo.ts

**Files:**

- Modify: `apps/docs/lib/landing/governance-demo.ts`
- Test: `apps/docs/tests/governance-demo.test.ts`

**Interfaces:**

- Consumes: existing module internals: `compliantDocument`, `blockedDocument`, `policyInput`, `outputSet`, `buildSnapshot`, `requireBuildValue`, `resolveSrgbHex`.
- Produces: `createProposalDeck(): ProposalDeck` and the exported types below. Task 3 reads `ProposalOutcome.tokenPath`, `.proposedValue`, `.resolvedValue`, `.description`, `.id`. Task 4 reads `.label`, `.verdict`, `.verdictTone`, `.detail`, `.emitted`. Task 5 reads `ProposalDeck.diffReport`.

- [ ] **Step 1: Write the failing test**

Append to `apps/docs/tests/governance-demo.test.ts`:

```ts
test('proposal deck derives every outcome from the engine', () => {
  const deck = createProposalDeck()

  assert.deepEqual(
    deck.outcomes.map(outcome => outcome.id),
    ['baseline', 'alias', 'violation', 'rename']
  )

  const [baseline, alias, violation, rename] = deck.outcomes
  assert.equal(baseline.verdict, 'PASS · 0 findings')
  assert.equal(baseline.resolvedValue, '#3366ff')
  assert.match(
    baseline.emitted?.css ?? '',
    /--semantic-color-bg-brand: var\(--primitives-color-blue-500\);/u
  )

  assert.equal(alias.verdict, 'PASS · 0 findings')
  assert.equal(alias.resolvedValue, '#5f7f2f')
  assert.match(
    alias.emitted?.css ?? '',
    /--semantic-color-bg-brand: var\(--primitives-color-green-500\);/u
  )
  assert.match(alias.emitted?.ts ?? '', /color\(srgb 0\.372549/u)

  assert.equal(violation.verdict, 'BLOCK · PT1004')
  assert.equal(violation.detail, 'Layer semantic cannot reference layer component.')
  assert.equal(violation.emitted, null)
  assert.equal(violation.resolvedValue, null)

  assert.equal(rename.tokenPath, 'semantic.color.bg.primary')
  assert.equal(rename.verdict, '5 changes · 3 tokens affected')
  assert.equal(deck.diffReport.includes('removed semantic.color.bg.brand'), true)
  assert.equal(
    deck.diffReport.includes(
      '  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg'
    ),
    true
  )
})
```

Add `createProposalDeck` to the import at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter primitree-docs run test`
Expected: FAIL, `createProposalDeck` has no export.

- [ ] **Step 3: Implement the deck**

In `apps/docs/lib/landing/governance-demo.ts`:

3a. Add `diffGraphViews` to the `@primitree/core` import.

3b. Add the green primitive inside `compliantDocument.primitives.color`, beside `blue`:

```ts
green: {
  '500': {
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: [0.372549, 0.498039, 0.184314],
      alpha: 1,
    },
  },
},
```

3c. Add the two documents after `blockedDocument`:

```ts
const aliasDocument = {
  ...compliantDocument,
  semantic: {
    color: {
      bg: {
        ...compliantDocument.semantic.color.bg,
        brand: { $type: 'color', $value: '{primitives.color.green.500}' },
      },
    },
  },
} as const

const renameDocument = {
  primitives: compliantDocument.primitives,
  semantic: {
    color: {
      bg: {
        primary: { $type: 'color', $value: '{primitives.color.blue.500}' },
        support: compliantDocument.semantic.color.bg.support,
      },
    },
  },
  component: {
    button: {
      bg: { $type: 'color', $value: '{semantic.color.bg.primary}' },
    },
    nav: {
      active: {
        bg: { $type: 'color', $value: '{semantic.color.bg.primary}' },
      },
    },
    focus: {
      ring: { $type: 'color', $value: '{semantic.color.bg.primary}' },
    },
    color: compliantDocument.component.color,
  },
} as const
```

3d. Add the types beside `GovernanceDemo`:

```ts
export interface ProposalOutcome {
  readonly id: 'baseline' | 'alias' | 'violation' | 'rename'
  readonly label: string
  readonly tokenPath: string
  readonly proposedValue: string
  readonly verdict: string
  readonly verdictTone: 'pass' | 'block' | 'review'
  readonly detail: string
  readonly resolvedValue: string | null
  readonly emitted: { readonly css: string; readonly ts: string } | null
  readonly description: string
}

export interface ProposalDeck {
  readonly outcomes: readonly ProposalOutcome[]
  readonly diffReport: readonly string[]
}
```

3e. Add the helpers after `buildOutputLabels`:

```ts
function emittedExcerpt(document: unknown, cssNeedle: string, tsNeedle: string) {
  const built = buildDTCGOutputs(
    { ...outputSet, files: { 'living-canopy.tokens.json': document as DTCGDocument } },
    {}
  )
  const findLine = (path: string, needle: string) => {
    const file = built.files.find(item => item.path === path)
    const line = file?.contents.split('\n').find(item => item.includes(needle))
    if (line === undefined) {
      throw new Error(`Governance demo expected ${needle} in ${path}.`)
    }
    return line.trim()
  }
  return Object.freeze({
    css: findLine('css/tokens.css', cssNeedle),
    ts: findLine('ts/tokens.ts', tsNeedle),
  })
}

function inspectResolvedHex(
  snapshot: ReturnType<typeof buildSnapshot>,
  path: readonly string[]
): string {
  const inspection = requireBuildValue(
    inspectToken(snapshot, { kind: 'path', path: [...path] }),
    'proposal inspection'
  )
  return resolveSrgbHex(inspection.resolution.value)
}

function buildDiffReport(
  before: ReturnType<typeof buildSnapshot>,
  after: ReturnType<typeof buildSnapshot>
): readonly string[] {
  const paths = new Map<TokenId, string>()
  for (const token of [...before.view.tokens, ...after.view.tokens]) {
    paths.set(token.tokenId, token.path.join('.'))
  }
  const diff = requireBuildValue(diffGraphViews(before, after), 'rename diff')
  const describe = (tokenId: TokenId) => {
    const path = paths.get(tokenId)
    if (path === undefined) {
      throw new Error('Governance demo expected a path for every diff token.')
    }
    return path
  }
  const lines: string[] = [
    '$ primitree diff tokens.before.json tokens.json --config primitree.config.ts',
    '',
    `Diff found ${diff.changes.length} token changes.`,
  ]
  for (const change of diff.changes) {
    lines.push(`${change.kind} ${describe(change.tokenId)}`)
    lines.push(
      `  Affected tokens: ${
        change.impactedTokenIds.length === 0
          ? 'none'
          : change.impactedTokenIds.map(describe).join(', ')
      }`
    )
  }
  lines.push('New findings: 0', 'Resolved findings: 0')
  return Object.freeze(lines)
}
```

3f. Add the deck builder at the end of the file:

```ts
/** Builds the click-driven proposal outcomes for the homepage proof panel. */
export function createProposalDeck(): ProposalDeck {
  const policy = requireBuildValue(createPolicy(policyInput), 'policy creation')
  const baselineSnapshot = buildSnapshot(compliantDocument)
  const aliasSnapshot = buildSnapshot(aliasDocument)
  const renameSnapshot = buildSnapshot(renameDocument)

  const aliasReport = requireBuildValue(
    evaluatePolicy(aliasSnapshot, policy),
    'alias policy evaluation'
  )
  if (aliasReport.summary.active !== 0) {
    throw new Error('Governance demo expected the alias proposal to pass.')
  }
  const blockedReport = requireBuildValue(
    evaluatePolicy(buildSnapshot(blockedDocument), policy),
    'blocked policy evaluation'
  )
  const blockedFinding = blockedReport.findings.find(finding => finding.ruleId === 'PT1004')
  if (blockedFinding === undefined) {
    throw new Error('Governance demo expected the PT1004 finding.')
  }

  const dependentList = expectedDependents.join(', ')
  const baselineHex = inspectResolvedHex(baselineSnapshot, ['semantic', 'color', 'bg', 'brand'])
  const aliasHex = inspectResolvedHex(aliasSnapshot, ['semantic', 'color', 'bg', 'brand'])
  if (aliasHex !== '#5f7f2f') {
    throw new Error('Governance demo expected the green alias to resolve to #5f7f2f.')
  }
  const diffReport = buildDiffReport(baselineSnapshot, renameSnapshot)
  if (!diffReport.includes('removed semantic.color.bg.brand')) {
    throw new Error('Governance demo expected the rename diff to remove the old path.')
  }

  const brandCss = '--semantic-color-bg-brand:'
  const brandTs = '["semantic.color.bg.brand"]: "color('
  const outcomes: readonly ProposalOutcome[] = Object.freeze([
    Object.freeze({
      id: 'baseline' as const,
      label: 'Current graph',
      tokenPath,
      proposedValue: `{${aliasTarget}}`,
      verdict: 'PASS · 0 findings',
      verdictTone: 'pass' as const,
      detail: 'Each layer references the layer beneath it. The graph ships.',
      resolvedValue: baselineHex,
      emitted: emittedExcerpt(compliantDocument, brandCss, brandTs),
      description: `${tokenPath} references ${aliasTarget}, resolves to ${baselineHex}, and feeds ${dependentList}.`,
    }),
    Object.freeze({
      id: 'alias' as const,
      label: 'Compliant alias',
      tokenPath,
      proposedValue: '{primitives.color.green.500}',
      verdict: 'PASS · 0 findings',
      verdictTone: 'pass' as const,
      detail: 'semantic references primitives, within policy. The change ships.',
      resolvedValue: aliasHex,
      emitted: emittedExcerpt(aliasDocument, brandCss, brandTs),
      description: `${tokenPath} references primitives.color.green.500, resolves to ${aliasHex}, and feeds ${dependentList}.`,
    }),
    Object.freeze({
      id: 'violation' as const,
      label: 'Layer violation',
      tokenPath,
      proposedValue: '{component.color.brand}',
      verdict: 'BLOCK · PT1004',
      verdictTone: 'block' as const,
      detail: blockedFinding.message,
      resolvedValue: null,
      emitted: null,
      description: `${tokenPath} proposes a reference to component.color.brand. Policy PT1004 blocks the change: ${blockedFinding.message}`,
    }),
    Object.freeze({
      id: 'rename' as const,
      label: 'Rename',
      tokenPath: 'semantic.color.bg.primary',
      proposedValue: `{${aliasTarget}}`,
      verdict: '5 changes · 3 tokens affected',
      verdictTone: 'review' as const,
      detail: 'The rename reaches every consumer of the old path.',
      resolvedValue: baselineHex,
      emitted: emittedExcerpt(
        renameDocument,
        '--semantic-color-bg-primary:',
        '["semantic.color.bg.primary"]: "color('
      ),
      description: `semantic.color.bg.brand becomes semantic.color.bg.primary. The diff lists ${dependentList} as affected consumers.`,
    }),
  ])

  return Object.freeze({ outcomes, diffReport })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter primitree-docs run test`
Expected: PASS, including the two existing governance-demo tests.

- [ ] **Step 5: Prose and format gates, commit**

```bash
node scripts/check-prose.mjs
pnpm exec prettier --write apps/docs/lib/landing/governance-demo.ts apps/docs/tests/governance-demo.test.ts
git add apps/docs/lib/landing/governance-demo.ts apps/docs/tests/governance-demo.test.ts
git commit -m "feat(docs): precompute homepage proposal deck from the engine"
```

---

### Task 2: CopyCommand component

**Files:**

- Create: `apps/docs/components/landing/copy-command.tsx`
- Modify: `apps/docs/app/global.css` (append styles)

**Interfaces:**

- Produces: `CopyCommand({ text, label }: { text: string; label: string })`, a client component button. Task 5 renders it in the hero and the config section.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyCommand({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      clearTimeout(timer.current)
    }
  }, [])

  return (
    <button
      type='button'
      className='copy-command'
      aria-label={label}
      data-copied={copied || undefined}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2000)
        })
      }}>
      {copied ? (
        <Check
          aria-hidden='true'
          size={14}
        />
      ) : (
        <Copy
          aria-hidden='true'
          size={14}
        />
      )}
    </button>
  )
}
```

- [ ] **Step 2: Append styles to global.css**

Place after the `/* ---------- shared actions ---------- */` block:

```css
.copy-command {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-primitree-border-strong);
  color: var(--color-primitree-muted);
  transition:
    color 150ms var(--ease-out-expo),
    border-color 150ms var(--ease-out-expo);
}

.copy-command:hover {
  color: var(--color-primitree-text);
  border-color: rgba(255, 255, 255, 0.2);
}

.copy-command[data-copied] {
  color: var(--color-primitree-accent);
  border-color: var(--color-primitree-accent);
}

.copy-command:focus-visible {
  outline: 2px solid var(--color-primitree-text);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Gates and commit**

```bash
pnpm --filter primitree-docs run typecheck
node scripts/check-prose.mjs
node scripts/check-brand.mjs
pnpm exec prettier --write apps/docs/components/landing/copy-command.tsx apps/docs/app/global.css
git add apps/docs/components/landing/copy-command.tsx apps/docs/app/global.css
git commit -m "feat(docs): add copy command control for landing sections"
```

---

### Task 3: TokenTree component

**Files:**

- Create: `apps/docs/components/landing/token-tree.tsx`
- Modify: `apps/docs/app/global.css` (append styles)

**Interfaces:**

- Consumes: `GovernanceDemo` and `ProposalOutcome` from Task 1.
- Produces: `TokenTree({ demo, outcome }: { demo: GovernanceDemo; outcome: ProposalOutcome })`. Task 4 renders it. The brand contract in Task 5 pins `tree-mark-body`, `tree-root-node`, `tree-trunk`, and `tree-token-node`.

Layout, bottom-up like the config layers: mark, roots band with the alias node, trunk band with the governed token, canopy band with the three consumers, output strip on top. CSS connectors replace all SVG paths except the mark. HTML nodes size to their text, so long paths wrap instead of overflowing.

- [ ] **Step 1: Create the component**

Move `MARK_PATH` here from `living-canopy.tsx` (same string, `M36.76 85.34...`).

```tsx
import type { GovernanceDemo, ProposalOutcome } from '@/lib/landing/governance-demo'

const MARK_PATH =
  'M36.76 85.34L41.7 58.07L37.3 60.88C20.85 71.1 -1.72 58.7 0.1 38.87C1.36 25.27 10.05 13.33 21.66 6.62C48.59 -8.95 89.6 3.69 94.62 36.67C97.83 57.79 76.07 71.48 58.03 60.92L53.42 58.06L58.23 85.33H36.76V85.34ZM42.44 8.69C38.52 8.99 34.65 9.87 31.04 11.39L30.99 34.53L42.45 41.4V8.69H42.44ZM52.56 8.88V19.19L64.9 12.09C64.95 11.83 64.8 11.92 64.65 11.85C61.71 10.44 57.91 9.45 54.68 8.98C54.13 8.9 53.34 8.74 52.81 8.75C52.7 8.75 52.59 8.77 52.56 8.88ZM22.44 16.59L20.22 18.25C18.14 20.3 16.03 22.37 14.54 24.91L22.44 29.42V16.58V16.59ZM52.56 41.28L80.7 24.81C79.28 22.73 77.66 20.56 75.77 18.88C75.56 18.69 74.41 17.69 74.28 17.64C74.06 17.54 73.89 17.72 73.71 17.81L52.72 30.33L52.57 41.28H52.56ZM10.35 32.88C9.18 37.97 8.35 43.02 11.07 47.77C14.73 54.18 22.78 56.77 29.67 54.35C32.54 53.34 35.47 51.47 37.63 49.35L10.36 32.87L10.35 32.88ZM84.46 32.89L57.62 49.48C63.17 55.44 71.96 57.46 79.08 52.93C85.1 49.1 86.82 43.04 85.45 36.21C85.38 35.86 84.63 32.88 84.46 32.88V32.89Z'

export function TokenTree({ demo, outcome }: { demo: GovernanceDemo; outcome: ProposalOutcome }) {
  return (
    <div
      className='tree'
      data-outcome={outcome.id}>
      <p className='sr-only'>{outcome.description}</p>
      <div
        className='tree-outputs'
        aria-hidden='true'>
        <span className='tree-band-label'>Ships</span>
        <code>{demo.outputs.join(' · ')}</code>
      </div>
      <div
        className='tree-band tree-band-canopy'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Canopy<em>component</em>
        </span>
        <ul className='tree-consumers'>
          {demo.directDependents.map(dependent => (
            <li
              key={dependent.path}
              className='tree-node'>
              <code>{dependent.path}</code>
            </li>
          ))}
        </ul>
      </div>
      <div
        className='tree-band tree-band-trunk'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Trunk<em>semantic</em>
        </span>
        <div className='tree-node tree-token-node'>
          <span className='tree-node-kicker'>Governed token</span>
          <code>{outcome.tokenPath}</code>
          <span className='tree-root-node' />
        </div>
      </div>
      <div
        className='tree-band tree-band-roots'
        aria-hidden='true'>
        <span className='tree-band-label'>
          Roots<em>primitives</em>
        </span>
        <div className='tree-alias-slot'>
          <span
            className='tree-spine tree-spine-alias'
            key={outcome.id}
          />
          <div className='tree-node tree-source-node'>
            <span className='tree-node-kicker'>Proposed alias</span>
            <code>{outcome.proposedValue}</code>
            {outcome.resolvedValue === null ? null : (
              <span
                className='tree-swatch'
                style={{ background: outcome.resolvedValue }}
              />
            )}
          </div>
        </div>
      </div>
      <div
        className='tree-mark'
        aria-hidden='true'>
        <span className='tree-trunk' />
        <svg viewBox='0 0 95 86'>
          <path
            className='tree-mark-body'
            d={MARK_PATH}
          />
        </svg>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append styles to global.css**

Add a `/* ---------- token tree ---------- */` block:

```css
/* ---------- token tree ---------- */
.tree {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-primitree-border);
  border-radius: 10px;
  background: var(--color-primitree-surface);
  overflow: hidden;
}

.tree-outputs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px dashed var(--color-primitree-border-strong);
}

.tree-outputs code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-primitree-muted);
}

.tree-band {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 16px;
  padding: 20px;
}

.tree-band + .tree-band {
  border-top: 1px solid var(--color-primitree-border);
}

.tree-band-label,
.tree-outputs .tree-band-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 520;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primitree-dim);
}

.tree-band-label em {
  display: block;
  font-style: normal;
  margin-top: 2px;
  color: var(--color-primitree-muted);
}

.tree-band-trunk {
  background: var(--color-primitree-accent-wash);
}

.tree-consumers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.tree-consumers > li {
  position: relative;
  margin-bottom: 24px;
}

.tree-consumers > li::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 1px;
  height: 12px;
  background: var(--color-primitree-border-strong);
}

.tree-consumers > li::after {
  content: '';
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  height: 1px;
  background: var(--color-primitree-border-strong);
}

.tree-consumers > li:first-child::after {
  left: 50%;
}

.tree-consumers > li:last-child::after {
  right: 50%;
}

.tree-node {
  position: relative;
  width: fit-content;
  max-width: 100%;
  border: 1px solid var(--color-primitree-border-strong);
  border-radius: 6px;
  background: var(--color-primitree-raised);
  padding: 10px 14px;
}

.tree-node code {
  display: block;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-primitree-text);
  overflow-wrap: anywhere;
}

.tree-node-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primitree-dim);
  margin-bottom: 4px;
}

.tree-token-node {
  border-color: var(--color-primitree-accent);
  padding-right: 34px;
}

.tree-root-node {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--color-primitree-accent);
}

.tree-source-node {
  padding-right: 34px;
}

.tree-swatch {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  transform: translateY(-50%);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.tree-alias-slot {
  position: relative;
}

.tree-spine {
  position: absolute;
  left: 24px;
  width: 1px;
  background: var(--color-primitree-accent);
}

.tree-spine-alias {
  top: -21px;
  height: 20px;
  transform-origin: top;
  animation: tree-spine-draw 300ms var(--ease-out-expo);
}

.tree[data-outcome='violation'] .tree-spine-alias {
  background: var(--color-primitree-error);
}

.tree[data-outcome='violation'] .tree-source-node {
  border-color: var(--color-primitree-error);
}

@keyframes tree-spine-draw {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tree-spine-alias {
    animation: none;
  }
}

.tree-mark {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20px 24px;
}

.tree-trunk {
  width: 1px;
  height: 20px;
  background: var(--color-primitree-accent);
}

.tree-mark svg {
  width: 44px;
  height: 40px;
  margin-top: 6px;
}

.tree-mark-body {
  fill: var(--color-primitree-text);
}

@media (max-width: 719px) {
  .tree-band {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .tree-consumers {
    grid-template-columns: minmax(0, 1fr);
  }

  .tree-consumers > li {
    margin-bottom: 0;
  }

  .tree-consumers > li::before,
  .tree-consumers > li::after {
    content: none;
  }

  .tree-spine {
    display: none;
  }
}
```

- [ ] **Step 3: Gates and commit**

```bash
pnpm --filter primitree-docs run typecheck
node scripts/check-prose.mjs
node scripts/check-brand.mjs
pnpm exec prettier --write apps/docs/components/landing/token-tree.tsx apps/docs/app/global.css
git add apps/docs/components/landing/token-tree.tsx apps/docs/app/global.css
git commit -m "feat(docs): add token tree with layer bands and css connectors"
```

Note: `check-brand` still validates the old canopy contract at this point, and `living-canopy.tsx` still exists, so both pass.

---

### Task 4: ProofPanel component

**Files:**

- Create: `apps/docs/components/landing/proof-panel.tsx`
- Modify: `apps/docs/app/global.css` (append styles)

**Interfaces:**

- Consumes: `TokenTree` from Task 3; `GovernanceDemo`, `ProposalDeck` from Task 1.
- Produces: `ProofPanel({ demo, deck }: { demo: GovernanceDemo; deck: ProposalDeck })`, a client component. Task 5 renders it in section 2.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { GovernanceDemo, ProposalDeck, ProposalOutcome } from '@/lib/landing/governance-demo'
import { TokenTree } from '@/components/landing/token-tree'

export function ProofPanel({ demo, deck }: { demo: GovernanceDemo; deck: ProposalDeck }) {
  const [activeId, setActiveId] = useState<ProposalOutcome['id']>('baseline')
  const outcome = deck.outcomes.find(item => item.id === activeId) ?? deck.outcomes[0]
  if (outcome === undefined) {
    return null
  }

  function moveTo(index: number) {
    const next = deck.outcomes[(index + deck.outcomes.length) % deck.outcomes.length]
    if (next !== undefined) {
      setActiveId(next.id)
      document.getElementById(`proof-chip-${next.id}`)?.focus()
    }
  }

  function onChipKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(deck.outcomes.length - 1)
    }
  }

  return (
    <div className='proof'>
      <div className='proof-evidence'>
        <div
          role='radiogroup'
          aria-label='Governance proposals'
          className='proof-chips'>
          {deck.outcomes.map((item, index) => (
            <button
              key={item.id}
              id={`proof-chip-${item.id}`}
              type='button'
              role='radio'
              aria-checked={item.id === outcome.id}
              tabIndex={item.id === outcome.id ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={event => onChipKeyDown(event, index)}>
              {item.label}
            </button>
          ))}
        </div>
        <p
          role='status'
          aria-live='polite'
          className='proof-verdict'
          data-tone={outcome.verdictTone}>
          {outcome.verdict}
        </p>
        <p className='proof-detail'>{outcome.detail}</p>
        <div className='proof-emitted'>
          {outcome.emitted === null ? (
            <p className='proof-blocked'>No files ship. The build stops at the policy gate.</p>
          ) : (
            <>
              <p className='proof-emitted-label'>tokens.css</p>
              <pre>
                <code>{outcome.emitted.css}</code>
              </pre>
              <p className='proof-emitted-label'>tokens.ts</p>
              <pre>
                <code>{outcome.emitted.ts}</code>
              </pre>
            </>
          )}
        </div>
        <p className='proof-owner'>
          <span>Owner</span>
          <code>{demo.owner}</code>
        </p>
      </div>
      <TokenTree
        demo={demo}
        outcome={outcome}
      />
    </div>
  )
}
```

- [ ] **Step 2: Append styles to global.css**

Add a `/* ---------- proof panel ---------- */` block:

```css
/* ---------- proof panel ---------- */
.proof {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 24px;
  align-items: start;
}

.proof-evidence {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--color-primitree-border);
  border-radius: 10px;
  background: var(--color-primitree-surface);
  padding: 20px;
}

.proof-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.proof-chips button {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 520;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-primitree-border-strong);
  color: var(--color-primitree-muted);
  transition:
    color 150ms var(--ease-out-expo),
    border-color 150ms var(--ease-out-expo),
    background-color 150ms var(--ease-out-expo);
}

.proof-chips button:hover {
  color: var(--color-primitree-text);
}

.proof-chips button[aria-checked='true'] {
  background: var(--color-primitree-accent-wash);
  border-color: var(--color-primitree-accent);
  color: var(--color-primitree-accent);
}

.proof-chips button:focus-visible {
  outline: 2px solid var(--color-primitree-text);
  outline-offset: 2px;
}

.proof-verdict {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 520;
  color: var(--color-primitree-accent);
  border-left: 2px solid var(--color-primitree-accent);
  padding-left: 12px;
}

.proof-verdict[data-tone='block'] {
  color: var(--color-primitree-error);
  border-left-color: var(--color-primitree-error);
}

.proof-verdict[data-tone='review'] {
  color: var(--color-primitree-warn);
  border-left-color: var(--color-primitree-warn);
}

.proof-detail {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-primitree-muted);
}

.proof-emitted {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--color-primitree-border);
  border-radius: 6px;
  background: var(--color-primitree-bg);
  padding: 14px 16px;
  min-height: 132px;
  justify-content: center;
}

.proof-emitted-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primitree-dim);
}

.proof-emitted pre {
  overflow-x: auto;
}

.proof-emitted code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--color-primitree-text);
  white-space: pre;
}

.proof-blocked {
  font-size: 14px;
  color: var(--color-primitree-muted);
}

.proof-owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--color-primitree-border);
  padding-top: 14px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.proof-owner span {
  color: var(--color-primitree-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
}

.proof-owner code {
  color: var(--color-primitree-text);
}

@media (max-width: 1023px) {
  .proof {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 3: Gates and commit**

```bash
pnpm --filter primitree-docs run typecheck
node scripts/check-prose.mjs
node scripts/check-brand.mjs
pnpm exec prettier --write apps/docs/components/landing/proof-panel.tsx apps/docs/app/global.css
git add apps/docs/components/landing/proof-panel.tsx apps/docs/app/global.css
git commit -m "feat(docs): add click-driven proof panel"
```

---

### Task 5: Homepage swap, canopy removal, brand contract retarget

One atomic task: the page rewires to the new components, `living-canopy.tsx` leaves, its styles leave, and every validator and unit test that references it retargets. The suite stays green at the commit boundary.

**Files:**

- Modify: `apps/docs/components/landing/governance-home.tsx`
- Delete: `apps/docs/components/landing/living-canopy.tsx`
- Modify: `apps/docs/app/global.css`
- Modify: `scripts/brand-rules.mjs`
- Modify: `scripts/check-brand.test.mjs`
- Modify: `apps/docs/tests/color-system.test.ts`

**Interfaces:**

- Consumes: `ProofPanel` (Task 4), `CopyCommand` (Task 2), `createGovernanceDemo`, `createProposalDeck` (Task 1).
- Produces: the final page. Task 6 writes e2e selectors against these class names: `.proof-chips`, `.proof-verdict`, `.tree`, `.terminal`, `.hero-install`.

- [ ] **Step 1: Rewrite governance-home.tsx**

Full replacement:

```tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CopyCommand } from '@/components/landing/copy-command'
import { ProofPanel } from '@/components/landing/proof-panel'
import { createGovernanceDemo, createProposalDeck } from '@/lib/landing/governance-demo'

const INSTALL_COMMAND = 'npx primitree@next check'

const CONFIG_SNIPPET = `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: { layers: [
        {
          id: 'primitives',
          roots: ['primitives'],
          values: 'literal'
        },
        {
          id: 'semantic',
          roots: ['semantic'],
          values: 'reference',
          references: ['primitives']
        },
        {
          id: 'component',
          roots: ['component'],
          values: 'reference',
          references: ['semantic']
        }
      ] },
      ownership: {
        default: ['design-systems'],
        paths: { semantic: ['product-design'] }
      },
      outputs: {
        directory: './generated',
        formats: ['dtcg', 'css', 'typescript', 'tailwind']
      }
    }
  }
}`

export function GovernanceHome() {
  const demo = createGovernanceDemo()
  const deck = createProposalDeck()

  return (
    <div className='governance-home'>
      <section className='governance-hero'>
        <div className='governance-wrap governance-hero-inner'>
          <h1 aria-label='Govern token change. Know every consequence.'>
            <span>Govern token change.</span>
            <span>Know every consequence.</span>
          </h1>
          <p className='governance-hero-lede'>
            Turn a token edit into reviewable evidence: what it resolves to, which components depend
            on it, who owns it, and whether the configured policy allows the change to ship.
          </p>
          <div className='governance-actions'>
            <Link
              href='/docs/getting-started'
              className='btn-primary governance-cta'>
              Run the quickstart
              <ArrowRight
                aria-hidden='true'
                size={16}
                strokeWidth={1.8}
              />
            </Link>
            <Link
              href='/playground'
              className='btn-ghost governance-cta'>
              Open the playground
            </Link>
          </div>
          <div className='hero-install'>
            <code>{INSTALL_COMMAND}</code>
            <CopyCommand
              text={INSTALL_COMMAND}
              label='Copy the install command'
            />
          </div>
        </div>
      </section>

      <section className='governance-proof-section'>
        <div className='governance-wrap'>
          <div className='section-intro'>
            <p className='section-kicker'>Evidence</p>
            <h2>Propose a change. Read the verdict.</h2>
            <p>
              Pick a proposal for the governed token. The panel shows the policy verdict, the
              affected consumers, and the emitted code. The engine computes every outcome at build
              time from the same graph the CLI checks.
            </p>
          </div>
          <ProofPanel
            demo={demo}
            deck={deck}
          />
        </div>
      </section>

      <section className='governance-diff-section'>
        <div className='governance-wrap governance-diff-grid'>
          <div className='section-intro'>
            <p className='section-kicker'>Change review</p>
            <h2>The diff names every affected token.</h2>
            <p>
              primitree diff compares two revisions of one source through the graph. The report
              lists each change beside the tokens that inherit it, before a merge lands.
            </p>
            <Link
              href='/docs/cli/diff'
              className='governance-text-link'>
              Read the diff command
              <ArrowRight
                aria-hidden='true'
                size={15}
              />
            </Link>
          </div>
          <div className='terminal'>
            <p className='terminal-title'>primitree diff · brand source</p>
            <pre>
              <code>{deck.diffReport.join('\n')}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className='governance-quickstart'>
        <div className='governance-wrap governance-proof'>
          <div className='governance-proof-copy'>
            <h2>Rules close to the tokens.</h2>
            <p>
              Define architecture and ownership beside the source. Check the exact graph in
              development and CI before generating files.
            </p>
            <div className='governance-argument-flow'>
              <article>
                <h3>Govern the proposal</h3>
                <p>
                  Encode allowed layers, references, and owners as policy. A proposal either passes
                  with evidence or stops with the exact rule it crossed.
                </p>
              </article>
              <article>
                <h3>Trace the blast radius</h3>
                <p>
                  Follow resolved aliases and direct dependents through the same graph. Reviewers
                  see what changed and which consumers inherit it.
                </p>
              </article>
              <article>
                <h3>Ship one contract</h3>
                <p>
                  After the graph passes, one configured build emits the selected DTCG, CSS,
                  Tailwind, and TypeScript files from the same resolved values.
                </p>
              </article>
            </div>
          </div>
          <div className='governance-code-proof'>
            <div className='governance-code-block'>
              <div className='governance-code-head'>
                <p>primitree.config.ts</p>
                <CopyCommand
                  text={CONFIG_SNIPPET}
                  label='Copy the config example'
                />
              </div>
              <pre>
                <code>{CONFIG_SNIPPET}</code>
              </pre>
            </div>
            <div className='governance-command-row'>
              <code>pnpm exec primitree check --source brand</code>
              <span>{demo.compliant.status}</span>
            </div>
          </div>
        </div>
        <div className='governance-wrap governance-facts'>
          <p>
            <span>Standard</span>
            DTCG 2025.10 output · Resolver contexts in tokens.resolver.json · Extensions under
            $extensions[&apos;com.primitree&apos;]
          </p>
          <p>
            <span>Sources</span>
            Local DTCG files · Figma variables export · Variables REST API
          </p>
        </div>
      </section>

      <section className='governance-final'>
        <div className='governance-wrap governance-final-inner'>
          <h2>Make token change legible.</h2>
          <p>Start with one source, one policy, and evidence your team can review.</p>
          <div className='governance-actions'>
            <Link
              href='/docs/getting-started'
              className='btn-primary governance-cta'>
              Start with the docs
              <ArrowRight
                aria-hidden='true'
                size={16}
              />
            </Link>
            <Link
              href='/docs'
              className='btn-ghost governance-cta'>
              Browse the docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
```

Check the `/docs/cli/diff` route exists under `apps/docs/content/docs/cli/`. Point the link at `/docs/cli` when the page has another slug.

- [ ] **Step 2: Delete living-canopy.tsx**

```bash
git rm apps/docs/components/landing/living-canopy.tsx
```

- [ ] **Step 3: Update global.css**

3a. Remove every rule whose selector mentions `canopy` (the `/* ---------- living canopy ---------- */` block, the media-query overrides near lines 941-1160, and `.canopy-tabs button:focus-visible` plus `.canopy-proposal:focus-visible` from the shared focus list at lines 99-100).

3b. Replace the hero support layout. Remove `.governance-hero-copy`, `.governance-hero-copy::after`, `.governance-hero-support` rules and add:

```css
.governance-hero-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 28px;
}

.governance-hero-lede {
  max-width: 40rem;
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--color-primitree-muted);
}

.hero-install {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-primitree-border);
  border-radius: 6px;
  background: var(--color-primitree-surface);
  padding: 8px 8px 8px 16px;
}

.hero-install code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-primitree-text);
}
```

3c. Add section scaffolding:

```css
.section-intro {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 44rem;
  margin-bottom: 40px;
}

.section-kicker {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 520;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-primitree-accent);
}

.section-intro h2 {
  font-size: clamp(1.75rem, 3.4vw, 2.75rem);
  font-weight: 540;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--color-primitree-text);
  text-wrap: balance;
}

.section-intro > p:last-of-type {
  font-size: 1rem;
  line-height: 1.65;
  color: var(--color-primitree-muted);
}

.governance-proof-section,
.governance-diff-section {
  padding-block: clamp(72px, 10vw, 128px);
}

.governance-diff-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 40px;
  align-items: start;
}

.governance-diff-grid .section-intro {
  margin-bottom: 0;
}

.terminal {
  border: 1px solid var(--color-primitree-border);
  border-radius: 10px;
  background: var(--color-primitree-surface);
  overflow: hidden;
}

.terminal-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-primitree-dim);
  border-bottom: 1px solid var(--color-primitree-border);
  padding: 12px 18px;
}

.terminal pre {
  padding: 18px;
  overflow-x: auto;
}

.terminal code {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-primitree-text);
  white-space: pre;
}

.governance-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.governance-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 48px;
  border-top: 1px solid var(--color-primitree-border);
  margin-top: 56px;
  padding-top: 24px;
}

.governance-facts p {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-primitree-muted);
}

.governance-facts span {
  display: block;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primitree-dim);
  margin-bottom: 4px;
}

@media (max-width: 1023px) {
  .governance-diff-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Reconcile the existing `.governance-quickstart`, `.governance-proof`, `.governance-code-block`, and `.governance-command-row` rules with the merged section: keep them, and move the `.governance-argument-flow` rules from the removed consequences section into the quickstart context (stacked column, gap 24px). Remove `.governance-consequences`, `.governance-argument`, and `.governance-argument-intro` rules with the section.

Add the focus-visible selectors for the new controls to the shared focus list at `global.css:89-100`: `.proof-chips button:focus-visible`, `.copy-command:focus-visible` already has its own rule, so list membership stays optional for it.

- [ ] **Step 4: Retarget brand rules**

In `scripts/brand-rules.mjs`:

4a. In `LICHEN_CONTRACT_PATHS`, replace `'apps/docs/components/landing/living-canopy.tsx'` with `'apps/docs/components/landing/token-tree.tsx'`.

4b. In `addLivingCanopyMarkupViolations` (line ~385): change the path guard to `'apps/docs/components/landing/token-tree.tsx'`. Replace the body-fill check with a class-based check, and keep the root-node check:

```js
function addLivingCanopyMarkupViolations(violations, path, content) {
  if (path !== 'apps/docs/components/landing/token-tree.tsx') return

  if (!/\bclassName=['"]tree-mark-body['"]/u.test(content)) {
    violations.push({
      path,
      line: null,
      match: 'token tree mark: missing Bone body class',
    })
  }

  if (!/\bclassName=['"]tree-root-node['"]/u.test(content)) {
    violations.push({
      path,
      line: null,
      match: 'token tree mark: missing structural Lichen root node',
    })
  }
}
```

4c. In `addLivingCanopyStyleViolations` (line ~451), replace `expectedTreatments` with:

```js
const expectedTreatments = [
  {
    label: 'Bone logo body',
    property: 'fill',
    selector: '.tree-mark-body',
    value: 'var(--color-primitree-text)',
  },
  {
    label: 'Lichen root node',
    property: 'background',
    selector: '.tree-root-node',
    value: 'var(--color-primitree-accent)',
  },
  {
    label: 'Lichen structural trunk',
    property: 'background',
    selector: '.tree-trunk',
    value: 'var(--color-primitree-accent)',
  },
  {
    label: 'Lichen governed-token border',
    property: 'border-color',
    selector: '.tree-token-node',
    value: 'var(--color-primitree-accent)',
  },
]
```

4d. `addHomepageRegressionViolations` needs no change: its path guard covers every landing file.

4e. Search `scripts/check-brand.test.mjs` for `living-canopy` and `living canopy` and update each fixture path and message expectation to the new file and the `token tree mark:` prefix. The regression fixture at line ~531 changes its `path` to `'apps/docs/components/landing/token-tree.tsx'`.

- [ ] **Step 5: Update color-system.test.ts**

Retarget the four tests that read `living-canopy.tsx`:

- `living canopy never fades text-bearing stages or graph nodes`: rename to `token tree keeps node text at full opacity` and assert `global.css` contains no `opacity` declaration inside `.tree-node` or `.proof-` rules. Read the file and use a regex over the relevant blocks.
- `living canopy provides a legible compact graph below tablet width`: rename to `token tree stacks below tablet width` and assert `global.css` matches `/@media \(max-width: 719px\)[\s\S]*?\.tree-band\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/u` and `token-tree.tsx` contains `className='tree'`.
- `documentation brand files contain no former Primitree purple treatment`: swap the read of `living-canopy.tsx` for `token-tree.tsx` and add `proof-panel.tsx` to the source list.
- `living canopy makes the Bone mark a structural Lichen root`: rename to `token tree makes the Bone mark a structural Lichen root` and assert `token-tree.tsx` matches `/className='tree-mark-body'/u` and `/className='tree-root-node'/u`, and `global.css` matches `/\.tree-mark-body\s*\{\s*fill: var\(--color-primitree-text\);/u` and `/\.tree-trunk\s*\{[\s\S]*?background: var\(--color-primitree-accent\);/u`.

- [ ] **Step 6: Run every gate**

```bash
pnpm --filter primitree-docs run typecheck
pnpm --filter primitree-docs run test
node scripts/check-prose.mjs
node scripts/check-brand.mjs
node --test scripts/check-brand.test.mjs
```

Expected: all pass. Fix regressions before committing.

- [ ] **Step 7: Visual smoke check**

```bash
pnpm --filter primitree-docs run dev
```

Screenshot `http://localhost:3000` at 1440x900 and 390x844 with the Playwright script pattern from the audit (`chromium.launch`, `page.screenshot`). Confirm: no text overflow in tree nodes, chips switch the verdict and emitted lines, no sticky behavior on scroll, hero reads as one column.

- [ ] **Step 8: Commit**

```bash
pnpm exec prettier --write apps/docs/components/landing/governance-home.tsx apps/docs/app/global.css scripts/brand-rules.mjs scripts/check-brand.test.mjs apps/docs/tests/color-system.test.ts
git add -A
git commit -m "feat(docs): replace scroll canopy with click-driven governance proof"
```

---

### Task 6: Rewrite the homepage e2e spec

**Files:**

- Modify: `tests/e2e/docs-home-governance.spec.ts`

**Interfaces:**

- Consumes: page selectors from Task 5: `.proof-chips button`, `.proof-verdict`, `.tree`, `.terminal`, `.hero-install`, plus existing `.governance-hero`.

- [ ] **Step 1: Rewrite the spec**

Keep the file's existing helpers for navigation and viewport setup where they exist. Replace canopy tests with:

```ts
test('homepage leads with truthful governance', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Govern token change/u })).toBeVisible()
  await expect(page.locator('.proof-verdict')).toHaveText('PASS · 0 findings')
  await expect(page.locator('.hero-install code')).toHaveText('npx primitree@next check')
})

test('proposal chips form a radiogroup with roving tabindex', async ({ page }) => {
  await page.goto('/')
  const group = page.getByRole('radiogroup', { name: 'Governance proposals' })
  const chips = group.getByRole('radio')
  await expect(chips).toHaveCount(4)
  await expect(chips.first()).toHaveAttribute('aria-checked', 'true')
  await expect(chips.first()).toHaveAttribute('tabindex', '0')
  await expect(chips.nth(1)).toHaveAttribute('tabindex', '-1')
})

test('arrow keys move through proposals', async ({ page }) => {
  await page.goto('/')
  const group = page.getByRole('radiogroup', { name: 'Governance proposals' })
  await group.getByRole('radio').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'Compliant alias' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(group.getByRole('radio', { name: 'Rename' })).toBeFocused()
})

test('layer violation reports the real policy result', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Layer violation' }).click()
  await expect(page.locator('.proof-verdict')).toHaveText('BLOCK · PT1004')
  await expect(page.locator('.proof-detail')).toHaveText(
    'Layer semantic cannot reference layer component.'
  )
  await expect(page.locator('.proof-blocked')).toBeVisible()
})

test('compliant alias updates the emitted code', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Compliant alias' }).click()
  await expect(page.locator('.proof-emitted')).toContainText('var(--primitives-color-green-500)')
})

test('diff terminal lists the rename blast radius', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.terminal')).toContainText('removed semantic.color.bg.brand')
  await expect(page.locator('.terminal')).toContainText(
    'component.button.bg, component.focus.ring, component.nav.active.bg'
  )
})

test('tree nodes never overflow their boxes', async ({ page }) => {
  await page.goto('/')
  const overflowing = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.tree-node code'))
    return nodes.filter(node => {
      const parent = node.closest('.tree-node')
      return (
        parent !== null && node.getBoundingClientRect().right > parent.getBoundingClientRect().right
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
})
```

Preserve the untouched navigation, search, and contrast tests. Update the iPad and reduced-motion tests to assert the proof panel renders with four chips and a visible tree, with no `data-stage` attribute anywhere.

- [ ] **Step 2: Run the e2e suite**

```bash
pnpm run test:e2e:install
pnpm run test:e2e
```

Expected: PASS. The Playwright config starts the docs server per its existing `webServer` setup.

- [ ] **Step 3: Commit**

```bash
pnpm exec prettier --write tests/e2e/docs-home-governance.spec.ts
git add tests/e2e/docs-home-governance.spec.ts
git commit -m "test(e2e): cover proposal panel, diff terminal, and static scroll"
```

---

### Task 7: Full verification sweep

**Files:** none new.

- [ ] **Step 1: Run the full repo suite**

```bash
pnpm run build
pnpm run test
pnpm run check:brand
node scripts/check-prose.mjs
```

Expected: all pass. `pnpm run test` includes `check-brand.test.mjs` and the docs tests.

- [ ] **Step 2: Screenshot review**

Capture desktop 1440x900, mobile 390x844, and desktop with reduced motion emulation, one screenshot per chip state. Review each against the spec section list: hero single column with install row, proof panel visible without scrolling tricks, terminal readable, config section without dead quadrants, facts row present.

- [ ] **Step 3: Keyboard pass**

Tab through the page in a real browser session: chips reachable with one tab stop, arrows move selection, copy buttons announce their labels, every focus state visible.

- [ ] **Step 4: Commit any fixes and report**

```bash
git add -A
git commit -m "fix(docs): polish from verification sweep"
```

Report results with screenshots and the final test output.
