---
name: Primitree
description: A page compiled from its own token file, with solved color, two faces at two weights, and a graph that shows every reference it resolves.
colors:
  neutral-1: '#020403'
  neutral-4: '#0c0f0c'
  neutral-8: '#131914'
  neutral-20: '#2c322d'
  neutral-35: '#4e544f'
  neutral-45: '#666c67'
  neutral-60: '#8b928c'
  neutral-72: '#abb2ac'
  neutral-80: '#c2c8c3'
  neutral-90: '#dfe4e0'
  neutral-94: '#ebefec'
  neutral-97: '#f4f7f5'
  neutral-100: '#ffffff'
  brand-15: '#092c14'
  brand-35: '#006029'
  brand-45: '#007b37'
  brand-72: '#2cca65'
  brand-85: '#70ed91'
  brand-95: '#e0f7e3'
  red-15: '#401a17'
  red-45: '#cc2827'
  red-72: '#ff9287'
  red-97: '#fff4f3'
  amber-15: '#342200'
  amber-45: '#8c6300'
  amber-72: '#e6a500'
  blue-72: '#82b2ff'
typography:
  display:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: 'clamp(2.75rem, 6.2vw, 5.75rem)'
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: '-0.03em'
  heading:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '2.25rem'
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: '-0.015em'
  title:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 500
    lineHeight: 1.4
  lede:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
  label:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 500
  caption:
    fontFamily: 'Wotfard, Wotfard fallback, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
  glyph:
    fontFamily: 'MonoLisa, MonoLisa fallback, ui-monospace, monospace'
    fontSize: '0.625rem'
  code:
    fontFamily: 'MonoLisa, MonoLisa fallback, ui-monospace, monospace'
    fontSize: '0.875rem'
    fontWeight: 400
rounded:
  control: '6px'
  card: '10px'
  pill: '999px'
spacing:
  4: '0.25rem'
  8: '0.5rem'
  12: '0.75rem'
  16: '1rem'
  32: '2rem'
  40: '2.5rem'
  56: '3.5rem'
  72: '4.5rem'
  128: '8rem'
components:
  button-primary:
    backgroundColor: '{colors.brand-45}'
    textColor: '{colors.neutral-100}'
    typography: '{typography.control}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
    height: '44px'
  button-primary-hover:
    backgroundColor: '{colors.brand-35}'
    textColor: '{colors.neutral-100}'
  link:
    textColor: '{colors.brand-45}'
  nav-link:
    textColor: '{colors.neutral-35}'
  nav-link-hover:
    textColor: '{colors.neutral-8}'
  card:
    backgroundColor: '{colors.neutral-97}'
    textColor: '{colors.neutral-8}'
    rounded: '{rounded.card}'
    padding: '1rem'
  code-panel:
    backgroundColor: '{colors.neutral-8}'
    textColor: '{colors.neutral-97}'
    typography: '{typography.code}'
    rounded: '{rounded.card}'
    padding: '1rem'
  island:
    backgroundColor: '{colors.neutral-4}'
    textColor: '{colors.neutral-97}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    height: '36px'
  chooser:
    backgroundColor: '{colors.neutral-94}'
    textColor: '{colors.neutral-35}'
    typography: '{typography.small}'
    rounded: '{rounded.control}'
    padding: '0.25rem'
  chooser-selected:
    backgroundColor: '{colors.neutral-100}'
    textColor: '{colors.neutral-8}'
  crown-center:
    backgroundColor: '{colors.brand-45}'
    textColor: '{colors.neutral-100}'
    typography: '{typography.title}'
  crown-knob:
    backgroundColor: '{colors.neutral-100}'
  rule-switch:
    backgroundColor: '{colors.neutral-97}'
    textColor: '{colors.neutral-8}'
    rounded: '{rounded.control}'
    height: '44px'
  finding:
    backgroundColor: '{colors.red-97}'
    textColor: '{colors.red-45}'
  close:
    backgroundColor: '{colors.brand-45}'
    textColor: '{colors.neutral-100}'
---

# Design System: Primitree

## Overview

**Creative North Star: "The Page Compiles Itself"**

The homepage runs on its own token file. Three layers under `tokens/` (`primitives.tokens.json`, `semantic.tokens.json`, `component.tokens.json`) resolve through `tokens.resolver.json` into `tokens/generated/tokens.css`, and every color, font, size, space, radius, and duration on the page reads one of those custom properties. `@primitree/core` checks the layers: primitives hold literals, semantic tokens reference primitives, component tokens reference semantic tokens. Elements declare what they read through `bind()` in `lib/tokens/bind.ts`, so the graph on the page and the paint in the browser come from the same call.

Code solves the color; nobody picks it. `lib/tokens/solver.ts` takes one hue from `tokens/theme.config.json` (150, the brand green) and produces every neutral and brand step; a step number is CIE L\*, so two steps hold the same WCAG ratio at any hue, and red, amber, and blue stay locked at their own hues so a failure always looks like a failure. A theme (`theme/light.tokens.json`, `theme/dark.tokens.json`) re-aliases the semantic layer and changes no primitive; a motion context (`motion/full`, `motion/reduced`) does the same for durations.

The signature is the token graph: tapered ribbons, each colored with its resolved value, joining three labeled bands and rising as threads into the headline and controls above. The Crown is a rotary hue dial whose segments are the solver's own output. The Island is one pill capsule in the site bar that states the real result of the last check. Rule switches run the real check in the browser and show what breaks. Wotfard sets prose and MonoLisa sets code, commands, and token paths.

**Key Characteristics:**

- Three token layers, one resolver, one generated stylesheet; site CSS reads semantic and component tokens and nothing else.
- Solved OKLCH color from one hue, with steps named by CIE L\*; warn and fail hues locked.
- A theme swaps aliases, never values; reduced motion zeroes durations the same way.
- Two faces: Wotfard for prose, MonoLisa for code, commands, and token paths; weights 400 and 500.
- No shadows: depth comes from neutral steps and 1px borders, because composite tokens are not supported.
- A pass prints as plain text; warn and fail alone carry a color.
- Governance is visible: a hovered token names its owners and reach, and a broken rule prints the owners the check returned.
- Motion is causal: a preset or a rule switch recolors the page 210ms after the click, one `duration.causal` per layer. A drag cuts every color on the frame it lands, and so does a jump across the ink arc; the wave runs 400ms after the dial rests.

## Colors

Every color is a step on a solved ramp; the frontmatter lists the full primitive layer as the hex each step carries in `primitives.tokens.json`, and `tokens.css` emits the same steps as `oklch()`. Names below are semantic aliases; light values are the resolver default, dark values follow in parentheses.

### Primary

- **Brand 45** (`semantic.accent.solid`, `accent.text` in light; dark uses Brand 72): the primary button, the Crown hub, the close section, the current nav link, text links, the dashed ring on an element the graph reaches, and the threads that draw up to it. Chroma is the most sRGB allows at that luminance.
- **Brand 35** (`accent.solidHover` in light; Brand 85 in dark): the primary button on hover.
- **Brand 72** (`syntax.reference` in both themes): a DTCG alias string in sample code, the thing Primitree checks.
- **Brand 85 / Brand 15** (`accent.edge` light / `accent.subtle` dark): the link underline; the brand wash.
- **Brand 95** (`accent.subtle` light): the brand wash on the light page.

### Secondary

- **Red 45 / Red 72** (`status.fail`, `graph.fail`, `finding.text`): a failing check, a broken ribbon in the graph, and the fail zone on the Crown. Locked at hue 27.
- **Red 97 / Red 15** (`status.failSubtle`, `finding.background`): the wash behind a printed finding. Red 15 is also `status.failOnIsland` in both themes, the Island's wash while a check fails.
- **Amber 45 / Amber 72** (`status.warn`): a warning and the warn zone on the Crown. Locked at hue 80.
- **Amber 15** (`status.warnOnIsland` in both themes): the Island's wash while a hue reads too close to the warn signal or the check cannot run. Locked at hue 80.

### Tertiary

- **Syntax on the code surface** (`surface.code`, Neutral 8 light, Neutral 1 dark): base Neutral 97, keys Neutral 90, comments and punctuation Neutral 72, strings Amber 72, numbers Blue 72 (locked at hue 260), keywords Red 72, references Brand 72. One palette serves both themes because the code surface stays dark.

### Neutral

- **Neutral 100 / Neutral 4** (`surface.page`): the page, the chooser's selected segment, the Crown knob.
- **Neutral 97 / Neutral 8** (`surface.raised`): cards, rule switches, the footer, and a code sample written for the page rather than read from this repo or printed by a run.
- **Neutral 94 / Neutral 1** (`surface.sunken`): the install chooser well.
- **Neutral 4 / Neutral 1** (`surface.island`): the Island, dark in both themes, with `text.onIsland` at Neutral 97.
- **Neutral 8 / Neutral 97** (`text.primary`, `border.focus`, `graph.lit`, `crown.knobBorder`): headings, body, a lit ribbon, and the focus ring, which stays neutral at every hue; a control on an ink panel draws it in `syntax.base`, inset.
- **Neutral 35 / Neutral 80** (`text.secondary`): nav links, chooser labels.
- **Neutral 45 / Neutral 72** (`text.muted`, `graph.edge`, `graph.label`): a ribbon at rest, band labels, and the switch track; holds 4.5:1 on page and raised.
- **Neutral 90 / Neutral 20** (`border.subtle`, `graph.nodeBorder`): card and node hairlines.
- **Neutral 60 / Neutral 45** (`border.strong`): the chooser's selected ring; holds 3:1 on the page.

**The Step Is Luminance Rule.** A step number is CIE L\*. Steps 51 apart reach 4.5:1 at any hue, so step arithmetic decides contrast, not sampling.

**The One Hue Rule.** The solver derives neutrals and brand steps from the one hue in `tokens/theme.config.json`; changing the hue changes every value and no name. Red 27, amber 80, and blue 260 never follow it.

**The Theme Re-aliases Rule.** A theme file touches `semantic.*` aliases and nothing else. No theme declares a primitive.

**The No Primitive Read Rule.** Site CSS (`home.css`, `global.css`) reads `--semantic-*` and `--component-*`; `--primitives-*` appears in neither. `global.css` maps the legacy `--color-primitree-*` names onto semantic tokens.

**The No Literal Rule.** `home.css` holds no hex, rgb, hsl, or raw `oklch()` color and no raw duration. The one computed color is a relative `oklch(from var(--edge-color) ...)` that clamps a ribbon's lightness from a token.

**The Pass Is Plain Text Rule.** A pass prints as plain text in the current text color. `status.warn` and `status.fail` alone carry a hue.

## Typography

**Display Font:** Wotfard (with `Wotfard fallback`, ui-sans-serif, system-ui)
**Body Font:** Wotfard (with `Wotfard fallback`, ui-sans-serif, system-ui)
**Label/Mono Font:** MonoLisa (with `MonoLisa fallback`, ui-monospace)

**Character:** Wotfard gives prose a firm, plain voice at 400 and 500. MonoLisa sets everything a reader could paste or search for: code, commands, token paths, and the graph's type labels. Both carry commercial licenses: the repository ignores the binaries, and `scripts/fetch-webfonts.mjs` pulls them from Vercel Blob at build time. Each stack names a local face sized to the licensed face's metrics (`Wotfard fallback` over Arial at 102.75%, `MonoLisa fallback` over Courier New or Menlo at 106.7%), so the hero keeps its line breaks while the webfonts load.

### Hierarchy

- **Display** (500, clamp(2.75rem, 6.2vw, 5.75rem), 0.98, -0.03em): the hero headline on two forced lines at full page width. While the page compiles it wears MonoLisa at 400 (`fontFamilyFrom`, `fontWeightFrom`), and cuts to Wotfard as the family token lands. Phones skip the MonoLisa cut, because its width would rewrap the lines. A window 1000px or wider and under 720px tall drops the headline to the clamp's floor and tightens the hero gaps, so the graph's semantic row clears the fold at 1280 by 600.
- **Heading** (500, 2.25rem, 1.15, -0.015em): one per section. The close heading takes Display leading and tracking on clamp(2.25rem, 5vw, 5.75rem).
- **Title** (500, 1.25rem, 1.4): workflow steps, rule names, the Crown's hue value in tabular figures.
- **Lede** (400, 1.25rem, 1.4): the hero paragraph, 49rem max, the measure the install row and the invite share.
- **Body** (400, 1.0625rem, 1.55): section copy.
- **Small** (400, 0.9375rem, 1.55): chooser segments, the hero invite, notes.
- **Control** (500, 1rem): buttons.
- **Label** (500, 0.8125rem): the Island text and graph band labels, tabular figures on the Island.
- **Caption** (400, 0.8125rem): source lines and graph type labels.
- **Glyph** (0.625rem): labels inside the graph SVG, scaled by its viewBox.
- **Code** (0.875rem): code samples, commands, token paths.

**The Two Faces Rule.** Wotfard sets prose and MonoLisa sets code. Neither face has a role outside that split.

**The Weight Ladder Rule.** Two weights: 400 for reading, 500 for headings, controls, and labels. Wotfard ships nothing heavier that this site loads.

## Layout

The page is one column at the full width of the site wrap (`--site-wrap`, the viewport minus two gutters, capped at 1760px; past the cap the gutters grow and the column stays centered, while the close section and the ramps keep their bleed). The gutter is fluid between `space.16` and `space.40` (`--site-gutter`), and each section pads `clamp(4.5rem, 9vw, 8rem)` above (`sectionMin`, `sectionMax`). The hero stacks the headline, the lede, the Crown, the install chooser with the quickstart action, the invite, and the graph across the rest of the viewport, in that markup order at every width; from 1000px the hero body splits into a copy column and the Crown (`minmax(0, 1fr) auto`) with a `space.56` column gap, and below 720px the graph moves up under the install, so a screen scrolled to the dial holds all three bands. The install chooser flexes from 22rem to 34rem and switches to a container query below 460px. Below 720px the wide graph SVG hides and a narrow graph (`narrow-graph.tsx`) mounts at a 358 by 308 aspect. Secondary breakpoints at 1100px widen the lower sections.

Sections read in order: hero and graph, rules ("Break a rule and see what it costs."), theme ("A theme changes one layer.", ending on the CSS emitCss wrote for it), config, workflow (check, inspect, diff, build, and a CI excerpt), reach, limits, the ledger of every token, close. Spacing stays on the token ladder: 4, 8, 12, 16, 32, 40, 56, 72, 128 (rem at a 16px root). Inline gaps are `inline.tight` 4, `inline.default` 8, `inline.loose` 16; stacks are 8, 16, 32, 56; insets are controls 8 by 16, code 16. Numbers that set layout alone (track widths, breakpoints, hairlines) stay as raw px in `home.css` by declared exception.

## Elevation & Depth

No shadows. Primitree reads no composite token types, so the token file has no shadow token and the page draws none; two 1px inset rings use `box-shadow` as a border: the selected chooser segment in `home.css` (`inset 0 0 0 1px var(--component-chooser-selectedBorder)`), which the close section's chooser sets to none, and the phone menu in `global.css` (`var(--semantic-border-subtle)`). Depth comes from neutral steps: page, raised, sunken, with the code surface and the Island darker than the page in both themes. Edges are 1px `border.subtle` hairlines; the ink panels carry a 1px `border.panel` that matches their ink on the light page and gives them an edge on the dark one, and the Island carries a 1px `border.island` that disappears on the light page and shows on the dark one. Nothing blurs or filters.

**The No Composite Rule.** No drop shadow, gradient fill, or filter anywhere on the page. The one gradient is the mask that fades the component stubs (`.graph-stub`). A surface that needs to lift moves one neutral step, not up.

## Shapes

Three radii: controls at 6px (buttons, switches, the chooser well, band labels), cards and code panels at 10px, and the pill at 999px (the Island, switch tracks). Segments inside the chooser derive their radius from the well (`6px - 2px`). The Crown is a circle: a 176px dial with a 3-unit knob stroke and 3-unit warn and fail zone arcs. Graph ribbons take the shape of tapered filled paths, with a 1.2 stroke that appears when lit; in the graph a broken reference is a ribbon filled with `graph.fail`, and in a rule diagram it is a dashed stroke (`4 5`, round caps) in the same color. An element the graph reaches outlines itself in a 2px dashed `accent.solid` ring at a 4px offset.

## Components

### Buttons

Solid brand on the page. The site has one button style.

- **Shape:** 6px corners, 44px minimum height, padding `space.8` by `space.16`, Control type (500, 1rem).
- **Primary:** `accent.solid` fill with `text.onAccent`; hover moves to `accent.solidHover` over `duration.feedback` (140ms) on `ease.enter`, in and out. A retheme arrives on the wave instead: the store marks the root `data-settling` while it writes, so that recolor takes `duration.reveal` after `3 × causal`, and a hover in flight keeps its own timing. Press scales to 0.96.
- **Focus:** 2px solid `focus.ring` outline at 3px offset, everywhere on the page. The ring is neutral (`border.focus`), so it reads apart from the accent at every hue; a control on an ink panel draws it in `syntax.base` at a 3px inset, and a focused code panel draws it around its figure.
- **Text link:** `accent.text` with a 2px underline in `accent.edge` offset `space.4`, in a 44px box; the underline grows to 3px on hover.

### Switches

- **Rule switch:** a 44px control on `surface.raised` with 6px corners, pressing to `surface.sunken` on hover; a 30 by 18 pill track in `text.muted` carries a 12px `surface.page` thumb that slides over `duration.feedback`, and the track turns `status.fail` while the rule stays broken. The hue presets and the two hero switches share the shape and the hover. Flipping a rule switch on breaks the rule: it applies the edit to a copy of this page's tokens or config, runs the real check in the tab, and prints the first finding under the switch in `finding.text`, with the rule's code on `finding.background`; flipping it off restores the hue and theme the row changed.

### Cards / Containers

- **Card:** `surface.raised`, 1px `border.subtle`, 10px corners, `space.16` inset.
- **Code panel:** `surface.code` (dark in both themes) with a 1px `border.panel`, 10px corners, `space.16` inset, Code type with the `$` prompt in `syntax.reference`; `home.css` and the `border.panel` description call a panel in this state an ink panel, and a control on it draws its focus ring in `syntax.base`, inset. A sample written for the page rather than read from this repo or printed by a run sits plain on `surface.raised` with a `border.subtle` hairline and `text.primary`, and nothing highlights it.

### Radio groups

- **Install chooser:** a radio group of package managers in a `surface.sunken` well with 6px corners and `space.4` padding; segments are 44px tall in Small type at Control weight. The selected segment takes `surface.page`, a 1px inset `border.strong` ring, and `text.primary`; an unselected segment's label moves to `text.primary` on hover. Focus draws the 2px ring at 2px offset.

### Navigation

Site chrome sits on the page surface with links in `nav.text` (`text.secondary`), `nav.textHover` (`text.primary`) on hover and on the current page, which also takes an `accent.text` underline. The Island sits at the center of the bar.

Under 640px the links fold into a popover menu behind a Menu button; a tap outside or Escape closes it and hands focus back to the button. The menu needs the Popover API (Chrome 114, Safari 17, Firefox 125). A browser without it hides the button and the menu, and the footer keeps the links.

### Island (Signature)

One pill, 36px tall, `surface.island` with `text.onIsland` and a 1px `border.island`, Label type with tabular figures. It holds words, with no status dot or icon. A failing check fills the capsule and its edge with `status.failOnIsland` and a warning with `status.warnOnIsland`, so the verdict reads before the words; a pass, a hue, and a hovered token stay plain ink. The fill crossfades with the words over `duration.handoff`, and `text.onIsland` holds AA on both washes. At rest it reads `0 findings, exit 0`, the result the build recorded. A hue, a hovered token, a warning, and a failing check each print as a sentence, and a failing check names the first finding's rule and path; once a hover clears, the failing rest reads `primitree check, exit 1`. A restored rule reads `Rule restored, exit 0`. The words sit 1px above the line box's center: Wotfard's line box centers capitals, and most of each message is lowercase, so the lift centers the lowercase letters. The capsule animates its width over `duration.handoff` (440ms) as the message changes, and a hidden status region speaks the text once the dial rests, so a drag never floods a screen reader.

### Crown (Signature)

A 176px rotary dial whose ring segments are the solver's output for each hue. The hub fills with `accent.solid` and prints the hue in Title type with `text.onAccent`; the knob is `surface.page` with a 3-unit `text.primary` stroke; warn and fail zones mark the hues that read too close to those signals with 3-unit arcs in their locked colors. Turning the Crown rewrites the primitive band; the wave runs when the dial rests. Two switches under the presets break the first two rules on the page itself: Hard-code the accent freezes `accent.solid` at its current color and turns the hue 70 degrees, so the button stays behind while the page moves on; Skip a layer points `link.text` straight at `brand.45`. A hero switch records nothing: a break it makes leaves the theme alone, and turning that break off leaves the dial where it stands. The matching rule row records the hue and theme it changes (Skip a layer there also flips the page dark), and whichever switch turns that break off puts them back; leaving the page takes every break with it.

### Token Graph (Signature)

Three labeled bands (primitives, semantic, component) joined by tapered ribbons, each filled with the value it carries at a rest opacity that fades with its run from 0.72 (0.78 on a phone), and 1 when lit, with its lightness clamped by relative color so a near-white or near-black step stays visible (0.22 to 0.68 on the light page, 0.56 to 0.9 on the dark). Pointing at a token lights its chain and dims the rest to 0.14; the elements it reaches outline themselves on the page, threads in `accent.solid` draw up to them over `duration.reveal`, and a MonoLisa tooltip on `surface.island` names the token above its node. A broken rule shows in the graph for as long as it stays broken. Hard-code the accent and Skip a layer edit one token, so the graph holds that token's chain lit and dims the rest, and the finding takes over the hero: the hard-coded accent loses the ribbon under `accent.solid` and rings that node in `graph.fail`; the skipped layer swaps the link's ribbon for one in `graph.fail` straight down to `brand.45`. A stray token appears ringed at the right end of the component band, and a missing owner rings every component and primitive node in `graph.fail`. Band labels sit on `surface.page` in `graph.label`.

**The Causal Motion Rule.** Motion explains resolution and nothing else. Each layer adds one `duration.causal` (70ms) of delay, so a page element recolors `3 × causal` (210ms) after a preset moves the primitives or a rule switch edits a token, and settles over `duration.reveal` (280ms) on `ease.enter`. A moving dial sets `data-dragging`, which turns off every bound transition so each frame cuts to its value, and a jump across the ink arc cuts its colors the same way while the Island capsule keeps its width ease; the graph wave runs when the dial rests, 400ms after the last move. Under `data-motion='reduced'` every semantic duration reads `duration.0` and every state stays.

## Do's and Don'ts

### Do:

- **Do** read every color, font, size, space, radius, and duration from `--semantic-*` or `--component-*` in `tokens/generated/tokens.css`, and declare what an element reads with `bind()` or `reads()`.
- **Do** add a new color as a step on a solved ramp in `primitives.tokens.json`, alias it in `semantic.tokens.json`, and theme it by re-aliasing.
- **Do** print a pass as plain text; give a color to warn and fail and nothing else.
- **Do** set code in MonoLisa and prose in Wotfard, and keep weights to 400 and 500.
- **Do** run the real check for any state the page claims, and print what it returned.
- **Do** keep 44px targets, the 2px `focus.ring` outline, and a still page under reduced motion.

### Don't:

- **Don't** write a hex, rgb, hsl, or raw oklch color or a raw millisecond value in `home.css`.
- **Don't** read a `--primitives-*` variable from site CSS or declare a primitive in a theme file.
- **Don't** add a shadow, gradient, filter, or any composite token. The stub mask is the one gradient on the page.
- **Don't** change the hue of red, amber, or blue, or let the brand hue leak into them.
- **Don't** ship the theme lab: `/lab/theme` returns not found outside development.
- **Don't** put a pass in a pill or badge, add a kicker above a heading, or bring in a third type family.
