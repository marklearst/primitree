---
name: Primitree Living Governance
description: A living token graph that makes governance, consequence, and proof visible.
colors:
  forest-black: '#0B0F0D'
  panel: '#101512'
  emerald: '#34D399'
  emerald-deep: '#0B9464'
  emerald-ink: '#04251A'
  bone: '#F0F5F2'
  sage: '#8FA39A'
  rule: 'rgba(255, 255, 255, 0.09)'
  wire: 'rgba(255, 255, 255, 0.22)'
  blocked: '#F87171'
  changed: '#FBBF24'
typography:
  display:
    fontFamily: 'Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(2.125rem, 4.2vw, 3.375rem)'
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: '-0.028em'
  headline:
    fontFamily: 'Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '34px'
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: '-0.02em'
  body:
    fontFamily: 'Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14.5px'
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.08em'
rounded:
  chip: '6px'
  control: '8px'
  surface: '12px'
spacing:
  xs: '6px'
  sm: '12px'
  md: '20px'
  lg: '32px'
  xl: '64px'
  gutter: '48px'
components:
  button-primary:
    backgroundColor: '{colors.emerald}'
    textColor: '{colors.emerald-ink}'
    rounded: '{rounded.control}'
    padding: '10px 18px'
    minHeight: '44px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.bone}'
    border: '1px solid rgba(255, 255, 255, 0.13)'
    rounded: '{rounded.control}'
    padding: '10px 18px'
    minHeight: '44px'
---

# Design System: Primitree Living Governance

## Overview

**Creative North Star: “The Living Specification”**

Primitree behaves like a botanical specimen crossed with a standards instrument: one rooted token change branches into policy, dependency, and build evidence. The visual system is black, quiet, and exact so the electric lichen signal can carry meaning. The mark is not an ornament; it becomes the structural root of the graph.

The composition is spacious but never vague. Typography establishes the claim, the living graph proves it, and each subsequent section deepens the same causal story. Motion belongs to the graph: governed wires carry a slow marching-ants drift, the command line keeps a block cursor, and a check sweeps the graph once per proposal. Every loop stops under prefers-reduced-motion. Scroll effects, parallax, and orbiting decorations stay out.

**Key Characteristics:**

- One dominant living graph rather than a collection of product screenshots.
- Asymmetric editorial scale with rigorous baseline alignment.
- Thin structural rules, flat surfaces, and rare electric lichen emphasis.
- Real governance language: layers, owners, policy, aliases, dependents, and outputs.
- Full touch, keyboard, screen-reader, and reduced-motion equivalence.

## Colors

The palette favors deep forest surfaces; emerald marks active, governed, or ready-to-ship states. A light theme swaps every token through `data-theme='light'` on the root, with `#0B9464` as the light-surface emerald.

### Primary

- **Emerald:** The single active signal for selected proposals, valid outcomes, primary actions, prompt glyphs, and added diff lines.
- **Forest Black:** The page ground; **Emerald Ink** is the text color on emerald fills.

### Secondary

- **Blocked Coral (#F87171):** Reserved for policy violations, blocked changes, and removed diff lines. Never use it as decoration.
- **Changed Amber (#FBBF24):** Reserved for rename-affected consumers.

### Neutral

- **Bone:** Primary text and the high-contrast focus treatment.
- **Sage:** Explanatory copy and secondary labels.
- **Wire:** Idle graph connectors; **Rule** draws hairline borders and the hero dot grid.
- **Panel:** Raised evidence surfaces that stay connected to the page.

**The Consequence Rule.** Coral means blocked or unsafe. It never means “interesting,” “new,” or “hovered.” Amber means changed, never selected.

## Typography

**Display Font:** Schibsted Grotesk (with system sans fallback)
**Body Font:** Schibsted Grotesk (with system sans fallback)
**Label/Mono Font:** IBM Plex Mono (with system monospace fallback)

**Character:** The sans voice is direct and legible; assertive display scale and disciplined spacing provide character without borrowing a novelty font. Mono is functional metadata, not a costume.

### Hierarchy

- **Display** (500, fluid 34–54px, 1.04 line-height): Reserved for the homepage claim.
- **Headline** (500, 34px; the closing claim runs 40px): Section arguments and major proof statements.
- **Title** (600, 19px): Named comparison outcomes and card headings.
- **Body** (400, 14.5–15px, 1.65 line-height): Explanations capped near 50 characters per line.
- **Kicker** (600, 11px, .08em tracking, uppercase): Section eyebrows, step labels, and card headers.
- **Mono** (IBM Plex Mono, 10.5–14px): Token paths, commands, versions, and terminal output. Mono carries real code and state, nothing else.

**The One Claim Rule.** One display-scale statement appears in a viewport. Supporting copy uses a subordinate scale.

**The Metadata Rule.** Mono text must describe real state or code. Terminal blocks reproduce real command output.

## Elevation

The system is flat by default. Depth comes from occlusion, line weight, tone, and active state, not diffuse glow or floating glass cards. The hero install card carries the one long soft shadow in the system; nothing else floats.

**The Rooted Surface Rule.** Every evidence panel touches a rule, branch, or parent surface. Nothing floats without a visible relationship.

## Components

### Buttons

- **Shape:** Compact rectangular controls with 8px corners, never pill-shaped except for a small status chip.
- **Primary:** Emerald with Emerald Ink text, at least 44px tall.
- **Hover / Focus:** Hover lightens the emerald tone without translation. Focus uses a 2px Bone outline with 3px offset.
- **Secondary:** Transparent with a one-pixel border and Bone text.

### Chips

- **Style:** Small status labels attached to nodes or evidence, with one-pixel structural borders and 6–8px corners.
- **State:** The active proposal chip and PASS verdict fill with Emerald and Emerald Ink; FAIL fills with Coral; inactive chips stay neutral with a Sage label. Chips are not decorative badges.

### Cards / Containers

- **Corner Style:** Use controlled 12px corners where a contained reading surface is necessary.
- **Background:** Panel against Forest Black.
- **Shadow Strategy:** No default shadow.
- **Border:** One-pixel Graphite rules, often open on one edge where a branch enters.
- **Internal Padding:** 20–32px depending on density.

### Inputs / Fields

- **Style:** Root Black fill, Graphite stroke, 6px corners, Bone text, at least 48px tall.
- **Focus:** Bone outline, never neon glow.
- **Error / Disabled:** Blocked Coral communicates invalid state; disabled content remains readable and its non-interactive state stays unambiguous.

### Navigation

The logo and wordmark sit at the left. Docs and Playground sit on the right beside compact search and GitHub icon controls. Desktop and iPad keep these actions visible when space permits; mobile collapses when 44px targets cannot fit without collision. Text and a precise rule convey active state, not a filled pill.

### Token Graph

The homepage instrument is a three-column token graph (Roots · primitives, Trunk · semantic, Canopy · component) drawn from the same engine projection the CLI uses. Proposal chips select a document variant; wires and node borders carry the outcome. The governed chain uses Electric Lichen dashes, violations use Blocked Coral, rename-affected consumers use the warn tone. Emphasis changes connectors and borders, never text opacity. Every node is a keyboard-focusable button whose focus traces its dependency chain, and the verdict bar restates the graph state as text for assistive technology. On narrow screens the graph scrolls inside its own container at a legible scale.

## Do's and Don'ts

### Do:

- **Do** make every animated path correspond to a selected dependency or policy result.
- **Do** keep Electric Lichen rare and reserve Blocked Coral for unsafe outcomes.
- **Do** use the same token change to explain Govern, Trace, and Ship.
- **Do** preserve 44px touch targets, visible focus, reduced-motion parity, and portrait iPad composition.
- **Do** expose real project concepts and byte-stable outputs as proof.

### Don't:

- **Don't** recreate the generic dark dev-tool template: no orbit rings, pulsing dot eyebrow, decorative oversized mark, or fake Mac terminal. The hero dot grid is the one sanctioned backdrop.
- **Don't** use generic AI-tool marketing, interchangeable bento cards, dashboard collage, glassmorphism, purple cyber gradients, or 3D pastel illustration.
- **Don't** draw an ornamental tree that does not explain governance.
- **Don't** loop motion outside the graph. Wire drift and the command cursor are the two sanctioned loops, and both stop under reduced motion.
- **Don't** use rounded pills as the default shape or put every idea inside a card.
