# Homepage governance proof redesign

Date: 2026-08-20. Status: approved direction, spec for implementation.

## Problem

The live homepage at primitree.com shows these defects, confirmed against
screenshots and source:

- `living-canopy.tsx` positions SVG `<text>` nodes at fixed coordinates inside
  fixed-width `<rect>` nodes. `component.nav.active.bg` and the format list
  overflow their boxes. SVG text neither wraps nor clips.
- The proposal control truncates its token path mid-name.
- Connector paths use sharp elbow segments at arbitrary angles.
- The demo section spans 230vh with a sticky frame. An IntersectionObserver
  flips a stage attribute as hidden sentinels pass, and the per-stage visual
  change stays near invisible. Visitors read the frozen frame as a broken
  page. This defect drives the most confusion reports.
- Large empty regions: the hero right column, the void under the sticky
  frame, and the lower left quadrant of the argument section.

The page also omits the install command, the diff report, and any statement
of DTCG conformance.

## Positioning

Primitree is a token governance standards library. The homepage leads with
governance of local DTCG sources. Figma appears once, in a source adapter
list, and nowhere else.

## Goals

- Demonstrate the check, trace, and build loop with output from the real
  engine.
- Remove all scroll-driven choreography. Motion follows clicks.
- State DTCG 2025.10 conformance in concrete nouns.
- Keep the committed brand system: root-black, lichen, bone, Inter,
  Geist Mono, and the tokens in `apps/docs/DESIGN.md`.
- All copy passes `check:prose` and `check:brand`.

## Non-goals

- No rebrand, no new typefaces, no new color tokens.
- No changes to the docs section, the playground, or the header and footer
  chrome.
- No client-side execution of the token engine. The build step precomputes
  every demo outcome.

## Page structure

Normal document flow, five sections, no sticky regions, no scroll observers.

| #   | Section       | Content                                                                                                     |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Hero          | Existing headline and support copy, install command with copy button, two CTAs                              |
| 2   | Proof panel   | Signature interaction: proposal chips, verdict, token tree, emitted code                                    |
| 3   | Change review | Terminal block with real `primitree diff` report output                                                     |
| 4   | Config        | Existing `primitree.config.ts` block with copy button, three-step trio, standards line, source adapter list |
| 5   | Final CTA     | Existing closing section, unchanged                                                                         |

## Section 1: hero

Keep the headline and support paragraph. Fix the layout: support copy and
CTAs align to the headline baseline grid instead of floating in the right
column. Add an install row under the CTAs:

```
npx primitree@next check
```

The row renders as monospace text with a copy button. Copy buttons follow
the docs convention of visible feedback on activation.

## Section 2: proof panel, the signature interaction

One panel, near one viewport tall, visible edge to edge while in view.
Two regions: the token tree on the left, the evidence column on the right.
On narrow viewports the evidence column stacks above the tree.

### Proposal chips

Three buttons across the top of the evidence column. Each applies a proposed
change to `semantic.color.bg.brand`:

1. Compliant alias change to `{primitives.color.green.500}`
2. Layer violation: alias to `{component.color.brand}`
3. Rename to `semantic.color.bg.primary`

Chip activation updates, with no scroll dependence:

- The verdict line: `PASS · 0 findings`, or `BLOCK · PT1004` with the rule
  reason, or the rename report line with a breaking flag.
- The affected tree edge, which draws along its path once per activation.
- The emitted code pane: the exact `tokens.css` and `tokens.ts` lines for
  the resolved value, or an empty state for a blocked change stating that
  no files ship.

A fourth resting state, active on load, shows the current passing graph.
State transitions run on `aria-live="polite"` for the verdict line, matching
the current implementation.

### Data flow

`lib/landing/governance-demo.ts` grows from one demo object to a set of
precomputed outcomes. The module composes the graph, evaluates policy, and
builds outputs through `@primitree/core` and `@primitree/dtcg` for each
proposal at build time. The client component receives plain serializable
data and switches between outcomes. Zero engine code reaches the client
bundle.

## Token tree

HTML nodes in a CSS grid, with one inline SVG layer behind them for
connectors. Node boxes size to their text content, which removes the
overflow class of defects. Connector geometry derives from the grid rows,
with orthogonal segments and rounded corners.

Three labeled horizontal bands encode the layer architecture from the
config:

```
canopy   component    component.button.bg · component.focus.ring · component.nav.active.bg
trunk    semantic     semantic.color.bg.brand
roots    primitives   primitives.color.blue.500
```

An output strip above the canopy lists the configured formats. The
Primitree mark sits at the root band, at rest, without animation. Band
labels use the Geist Mono label style from `DESIGN.md`.

Edge treatments:

- Alias edges: solid, lichen on the active path.
- Dependency edges: solid, rule color.
- Output edges: dashed, rule color.

The one animation: on chip activation, the affected edge draws along its
path over 300ms with an ease-out curve. `prefers-reduced-motion` disables
the draw and swaps to an opacity change.

## Section 3: change review terminal

A terminal-styled block presenting real `primitree diff` output for the
rename proposal:

```
$ primitree diff backup/tokens.json tokens.json --fail-on-breaking

Variables: 1 renamed, 1 value change.
The diff contains breaking changes.

Renamed (breaking)
- semantic.color.bg.brand -> semantic.color.bg.primary (Semantic)
```

The block content comes from the same precomputed demo module, with the
report text checked against actual CLI output during implementation.
Supporting copy states that the diff matches tokens by stable IDs and that
a renamed token keeps its identity in the report.

## Section 4: config, standards, sources

The existing config block and three-step trio merge into one section, which
removes the empty quadrant. Additions:

- Copy button on the config block.
- Standards line: DTCG 2025.10 output, Resolver contexts in
  `tokens.resolver.json`, documented extensions under
  `$extensions['com.primitree']`.
- Source adapter list: local DTCG files, Figma variables export, Variables
  REST API. The single Figma mention on the page.

## Motion rules

- No scroll-triggered animation, no sticky choreography, no parallax, no
  observers.
- Click-driven transitions with visible feedback at the click location.
- `prefers-reduced-motion` swaps every transition to opacity or instant
  state change.

## Removals

- The IntersectionObserver stage machinery, the stage track sentinels, the
  230vh section, and the sticky frame in `living-canopy.tsx` and
  `global.css`.
- `living-canopy.tsx` itself, superseded by `token-tree.tsx` and
  `proof-panel.tsx`. `scripts/brand-rules.mjs` lists this file in
  `LICHEN_CONTRACT_PATHS`, so the list entry moves to the replacement file
  that carries the lichen color.

## New and changed files

| File                                               | Change                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/docs/lib/landing/governance-demo.ts`         | Precompute all proposal outcomes and emitted output excerpts         |
| `apps/docs/components/landing/token-tree.tsx`      | New. Server-renderable tree: HTML nodes, SVG connectors, band labels |
| `apps/docs/components/landing/proof-panel.tsx`     | New. Client component: chips, verdict, emitted code pane             |
| `apps/docs/components/landing/governance-home.tsx` | Rewrite sections per this spec                                       |
| `apps/docs/components/landing/living-canopy.tsx`   | Delete                                                               |
| `apps/docs/app/global.css`                         | Remove canopy scroll styles, add proof panel and tree styles         |
| `scripts/brand-rules.mjs`                          | Update `LICHEN_CONTRACT_PATHS`                                       |
| `apps/docs/tests/*`                                | Update any homepage coverage                                         |

## Accessibility

- Chips form a `radiogroup` with arrow-key movement, matching the keyboard
  pattern in the current tablist.
- The verdict line keeps `role="status"` with `aria-live="polite"`.
- The tree carries a `sr-only` description of nodes and edges, updated per
  outcome.
- Focus outlines follow the existing global focus style.

## Responsive

- Under 64rem: evidence column stacks above the tree, tree bands compress
  to the stacked card list pattern from the current mobile fallback.
- Node text never truncates. Long token paths wrap within their HTML boxes.

## Copy constraints

All new strings in TSX, including comments, pass `scripts/check-prose.mjs`.
All color usage passes `scripts/check-brand.mjs`. New copy reuses the
existing compliant register: concrete nouns, active voice, no quality
adjectives.

## Verification

- `pnpm --filter primitree-docs run typecheck` and `run test`.
- `node scripts/check-prose.mjs` and `node scripts/check-brand.mjs` from
  the repo root.
- Playwright screenshots at 1440x900 and 390x844, at rest and per chip
  state, reviewed against this spec.
- Keyboard pass: chips, copy buttons, CTAs reachable and operable.
- Reduced-motion pass with emulated `prefers-reduced-motion`.
