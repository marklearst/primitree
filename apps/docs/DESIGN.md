---
name: Primitree Living Governance
description: A living token graph that makes governance, consequence, and proof visible.
colors:
  root-black: '#030304'
  canopy-black: '#08080A'
  lichen: '#A8C95F'
  lichen-deep: '#5F7F2F'
  bone: '#FAFAFA'
  ash: '#9CA3AF'
  graphite: '#16161A'
  rule: 'rgba(255, 255, 255, 0.1)'
  blocked: '#F27575'
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(3.25rem, 7.2vw, 6rem)'
    fontWeight: 560
    lineHeight: 0.92
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(2rem, 4.5vw, 4.5rem)'
    fontWeight: 540
    lineHeight: 1
    letterSpacing: '-0.045em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 430
    lineHeight: 1.65
    letterSpacing: '-0.01em'
  label:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '0.75rem'
    fontWeight: 520
    lineHeight: 1.4
    letterSpacing: '0.02em'
rounded:
  control: '6px'
  surface: '10px'
  pill: '999px'
spacing:
  xs: '6px'
  sm: '12px'
  md: '20px'
  lg: '32px'
  xl: '64px'
  section: 'clamp(96px, 14vw, 176px)'
components:
  button-primary:
    backgroundColor: '{colors.lichen}'
    textColor: '{colors.root-black}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '14px 18px'
    height: '48px'
  button-secondary:
    backgroundColor: '{colors.canopy-black}'
    textColor: '{colors.bone}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '14px 18px'
    height: '48px'
---

# Design System: Primitree Living Governance

## Overview

**Creative North Star: “The Living Specification”**

Primitree behaves like a botanical specimen crossed with a standards instrument: one rooted token change branches into policy, dependency, and build evidence. The visual system is black, quiet, and exact so the electric lichen signal can carry meaning. The mark is not an ornament; it becomes the structural root of the graph.

The composition is spacious but never vague. Typography establishes the claim, the living graph proves it, and each subsequent section deepens the same causal story. Motion is finite and stateful: it traces an active dependency, resolves a policy decision, or reveals an output. There is no ambient orbiting, pulsing, drifting, or parallax to make the page feel expensive.

**Key Characteristics:**

- One dominant living graph rather than a collection of product screenshots.
- Asymmetric editorial scale with rigorous baseline alignment.
- Thin structural rules, flat surfaces, and rare electric lichen emphasis.
- Real governance language: layers, owners, policy, aliases, dependents, and outputs.
- Full touch, keyboard, screen-reader, and reduced-motion equivalence.

## Colors

The palette favors monochrome surfaces; electric lichen marks active, governed, or ready-to-ship states.

### Primary

- **Electric Lichen:** The single active signal for selected branches, valid outcomes, primary actions, and the logo root.
- **Root Black:** The page ground and deepest text-on-accent color.

### Secondary

- **Blocked Coral:** Reserved for policy violations and blocked changes. Never use it as decoration.
- **Deep Lichen:** A quieter supporting signal for secondary graph structure and pressed states.

### Neutral

- **Bone:** Primary text and high-contrast focus treatment.
- **Ash:** Explanatory copy and secondary labels.
- **Graphite:** Structural connectors and inactive controls.
- **Canopy Black:** Raised evidence surfaces that must remain connected to the page rather than float above it.

**The Signal Rule.** Electric Lichen occupies less than ten percent of a screen. Its rarity makes governance state legible at a glance.

**The Consequence Rule.** Coral means blocked or unsafe. It never means “interesting,” “new,” or “hovered.”

## Typography

**Display Font:** Inter (with system sans fallback)
**Body Font:** Inter (with system sans fallback)
**Label/Mono Font:** Geist Mono (with system monospace fallback)

**Character:** The sans voice is direct and legible; assertive display scale and disciplined spacing provide character without borrowing a novelty font. Mono is functional metadata, not a costume.

### Hierarchy

- **Display** (560, fluid 52–96px, 0.92 line-height): Reserved for the short homepage claim.
- **Headline** (540, fluid 32–72px, 1 line-height): Section arguments and major proof statements.
- **Title** (540, 20–28px, 1.15 line-height): Named governance branches and evidence outcomes.
- **Body** (430, 17px, 1.65 line-height): Explanations capped near 65 characters per line.
- **Label** (520, 12px, slight tracking): Token paths, statuses, commands, and interface controls. Sentence case; never a decorative eyebrow.

**The One Claim Rule.** One display-scale statement appears in a viewport. Supporting copy uses a subordinate scale.

**The Metadata Rule.** Mono text must describe real state or code. Never use it to simulate a terminal aesthetic.

## Elevation

The system is flat by default. Depth comes from occlusion, line weight, tone, and active state, not diffuse glow or floating glass cards. A narrow inset highlight may clarify a selected evidence surface; drop shadows are otherwise prohibited.

**The Rooted Surface Rule.** Every evidence panel touches a rule, branch, or parent surface. Nothing floats without a visible relationship.

## Components

### Buttons

- **Shape:** Compact rectangular controls with subtle 6px corners, never pill-shaped except for a small status chip.
- **Primary:** Electric Lichen with Root Black text, 48px tall, reserved for the quickstart.
- **Hover / Focus:** Hover deepens the lichen tone without translation. Focus uses a 2px Bone outline with 3px offset.
- **Secondary:** Transparent or Canopy Black with a one-pixel Graphite border and Bone text.

### Chips

- **Style:** Small mono status labels attached to nodes or evidence, with one-pixel structural borders.
- **State:** Active uses Electric Lichen; blocked uses Blocked Coral; inactive remains neutral. Chips are not decorative badges.

### Cards / Containers

- **Corner Style:** Use controlled 10px corners where a contained reading surface is necessary.
- **Background:** Canopy Black against Root Black.
- **Shadow Strategy:** No default shadow.
- **Border:** One-pixel Graphite rules, often open on one edge where a branch enters.
- **Internal Padding:** 20–32px depending on density.

### Inputs / Fields

- **Style:** Root Black fill, Graphite stroke, 6px corners, Bone text, at least 48px tall.
- **Focus:** Bone outline, never neon glow.
- **Error / Disabled:** Blocked Coral communicates invalid state; disabled content remains readable and its non-interactive state stays unambiguous.

### Navigation

The logo and wordmark sit at the left. Docs and Playground sit on the right beside compact search and GitHub icon controls. Desktop and iPad keep these actions visible when space permits; mobile collapses when 44px targets cannot fit without collision. Text and a precise rule convey active state, not a filled pill.

### Living Canopy

The logo mark is the structural root. Three semantic branches, Govern, Trace, and Ship, share one token node and one state model. Branch controls use real buttons with visible selected state. The visualization remains comprehensible as a textual hierarchy without SVG or motion.

## Do's and Don'ts

### Do:

- **Do** make every animated path correspond to a selected dependency or policy result.
- **Do** keep Electric Lichen rare and reserve Blocked Coral for unsafe outcomes.
- **Do** use the same token change to explain Govern, Trace, and Ship.
- **Do** preserve 44px touch targets, visible focus, reduced-motion parity, and portrait iPad composition.
- **Do** expose real project concepts and byte-stable outputs as proof.

### Don't:

- **Don't** recreate the generic dark dev-tool template: no faint grid/noise backdrop, orbit rings, pulsing dot eyebrow, decorative oversized mark, or fake Mac terminal.
- **Don't** use generic AI-tool marketing, interchangeable bento cards, dashboard collage, glassmorphism, purple cyber gradients, or 3D pastel illustration.
- **Don't** draw an ornamental tree that does not explain governance.
- **Don't** run continuous animation. No ambient drift, parallax, shimmer, or glow loops.
- **Don't** use rounded pills as the default shape or put every idea inside a card.
