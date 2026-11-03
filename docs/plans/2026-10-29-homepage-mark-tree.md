# Homepage direction: the mark is the token graph

Decided on 2026-10-29 from a prototype picker at `apps/docs/app/proto/home`,
which this decision retires.

## The case for a change

Over 25 members of the W3C Design Tokens Community Group read the previous
homepage as generic, generated design. An independent review agreed. The hero
used the stock dark developer-tool layout, with a headline on the left and a
terminal card on the right. The "tree" was three columns of boxes. Brand green
doubled as the pass color, and six terminal cards filled the page. The
community asked for a tree beside the headline with tokens as dots on its
branches. The maintainer pointed out that the Primitree mark already is that
tree.

## Decision

- The hero draws the Primitree mark at 5× scale as the live token graph from
  `examples/brand`.
- The mark's five branch tips hold the five component tokens. The four
  semantic tokens ride strands up the trunk. Roots grow below a ground line to
  the six primitives.
- Governed references follow the mark's solid strokes. A layer skip (PT1004)
  cuts across the mark in coral and lands as a finding ring after its wire
  draws.
- Hover or focus previews a lineage trace. A click, Enter, or Space pins it,
  and Escape clears it. An `aria-live` readout restates the trace in full
  token paths, which covers phones, where the tree hides its labels.
- The tree grows once per session in resolution order, about 1.45s, and then
  holds still. Reduced motion skips the growth and keeps every state.
- The headline reads "Your token layers, enforced." The config defines the
  layers, so the headline does not promise three fixed tiers.
- Below the hero, three evidence rows reuse the mark as a legend. Each matrix
  row carries a mark glyph with its layer lit.
- The homepage uses the shared site header, footer, and Greenshield tokens,
  so it matches the docs and the playground.

## Rejected

- **Current:** the incumbent template. The community rejected it.
- **Specimen:** a printed proof sheet with proofreading marks. It had the
  strongest type, but no product appears in the first screen, and the
  editorial cream style is itself a common pattern in generated design.
- **Canopy:** a tree drawn from scratch beside the logo. It answered the
  request, but it built a second tree next to a logo that already is one.
- **Workbench:** real UI components restyled by each proposal. The review read
  it as a dashboard collage. The "looks fine, still fails" idea belongs in the
  playground.

## Follow-ups

- Run `pnpm test:e2e` with the dev server stopped.
- Reuse the mark tree in the playground's graph view.
