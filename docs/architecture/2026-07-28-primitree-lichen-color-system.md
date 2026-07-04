# Primitree Lichen Color System

Status: Approved

## Decision

Primitree will use Lichen as its brand accent. The hue sits between matcha and
yellow-green. It connects with the fig tree mark while the near-black interface
keeps the product focused on technical work.

Primitree will keep its tree mark black or white on most surfaces. Lichen will
identify links, selected states, code paths, and small details inside the mark.
Primary actions will stay black and white.

## Palette

| Role         | Value                   | Use                                          |
| ------------ | ----------------------- | -------------------------------------------- |
| Dark accent  | `#A8C95F`               | Links, selected text, code paths, mark nodes |
| Light accent | `#5F7F2F`               | Text and icons on white or pale surfaces     |
| Soft tint    | `#DDE9B9`               | Large decorative areas and printed material  |
| Accent wash  | `rgb(168 201 95 / 10%)` | Selected rows, chips, and drop zones         |
| Success      | `#45C98B`               | Successful checks and completed states       |
| Warning      | `#F2B84B`               | Warnings that do not block work              |
| Error        | `#F27575`               | Failed checks and invalid input              |

The existing dark foundation stays in place:

| Role             | Value     |
| ---------------- | --------- |
| Background       | `#030304` |
| Surface          | `#08080A` |
| Raised surface   | `#0F0F12` |
| Elevated surface | `#16161A` |
| Primary text     | `#FAFAFA` |

## Brand mark

The header, footer, README, and package artwork will use a white mark on dark
surfaces and a black mark on light surfaces.

The large homepage mark will use a white body with Lichen nodes. Its sheen will
remain neutral. One faint Lichen halo may sit behind the mark at 10% opacity.
The orbit rings will use neutral white at low opacity.

The mark will not use a green gradient. The tree shape carries the identity
without one.

Favicons must work against dark and light browser chrome. They will use the
light-surface accent, `#5F7F2F`, as a single solid fill.

## Interface use

The docs site and standalone playground will share the same values, even though
each app keeps its current CSS variable names.

- The Fumadocs shell maps its background, text, links, focus, and status colors
  to the Primitree palette.
- Links, code paths, selected labels, and active borders use the dark accent.
- Selected surfaces use the accent wash.
- Text selection uses `rgb(168 201 95 / 25%)`.
- Primary buttons use white with black text on dark surfaces.
- Keyboard focus uses a neutral white outline.

Headings will use a solid accent where color adds meaning. The docs playground
and standalone playground will drop their colored text gradients.

## Semantic colors

Lichen is a brand color. It does not mean success.

Success keeps its emerald hue, `#45C98B`. Every status also uses an icon or a
text label so color never carries the message alone. Warning and error keep
their own yellow and red families.

We ruled out Pine and verdigris because they sit too close to the success color.
Fig-leaf green leaned toward environmental-product branding. Acid green made
the interface feel like a terminal theme. Sage lost too much energy beside the
code examples.

## Accessibility

The approved text pairs meet WCAG AA for normal text:

| Pair                     | Contrast |
| ------------------------ | -------: |
| Dark accent on `#030304` |  10.98:1 |
| Light accent on white    |   4.60:1 |
| Success on `#030304`     |   9.80:1 |
| Warning on `#030304`     |  11.52:1 |
| Error on `#030304`       |   7.44:1 |

The soft tint will not carry body text. Colored fills must use text with tested
contrast instead of assuming white works.

## Implementation scope

Update the brand colors in these files:

- `README.md`
- `apps/docs/app/global.css`
- `apps/docs/components/landing/animated-mark.tsx`
- `apps/docs/components/landing/site-chrome.tsx`
- `apps/docs/components/playground/playground.css`
- `apps/docs/public/favicon.svg`
- `apps/docs/public/primitree-icon.svg`
- `apps/playground/public/favicon.svg`
- `apps/playground/src/assets/primitree-icon.svg`
- `apps/playground/src/styles.css`

Tests and brand checks will cover the palette. Sample token data may keep blue,
purple, or any other color when that value demonstrates library behavior.

## Acceptance checks

- The docs site and playground contain no former indigo or lavender brand
  values.
- Public badges use the light-surface accent.
- The static mark stays monochrome. Use Lichen for the homepage illustration's
  nodes and faint halo.
- The docs playground and standalone playground match.
- Focus, selected, success, warning, and error states remain distinct.
- All affected routes work at 390 and 1440 pixels without overflow.
- Formatting, prose, lint, type checks, unit tests, and browser tests pass.

## Out of scope

Keep typography, spacing, package behavior, release automation, Vercel
production settings, and domains unchanged.
