# Changelog

## 1.0.0-next.1 (2026-08-17)

### Patch Changes

- Accept npm's prerelease bootstrap dist-tags and complete the package-family
  release after the `1.0.0-next.0` attempt stopped after publishing
  `@primitree/core`.
- Updated dependencies
  - @primitree/core@1.0.0-next.1

## 1.0.0-next.0 (2026-08-17)

Release record: This version was not published. The package-family attempt
stopped after `@primitree/core` reached npm.

### Major Changes

- Launch the Primitree 1.0 package family.

  - `@primitree/core` normalizes Figma variables, resolves aliases, compares
    revisions, and evaluates token policy.
  - `@primitree/dtcg` reads DTCG 2025.10 tokens and builds DTCG, Resolver, CSS,
    Tailwind CSS, and TypeScript output.
  - `@primitree/cli` checks, inspects, compares, and builds configured token
    projects.
  - `@primitree/hooks` reads generated token output in React applications.
  - `@primitree/mcp` exposes loaded token graphs to MCP clients.
  - `primitree` provides the unscoped `primitree` command through
    `@primitree/cli`.

### Patch Changes

- Updated dependencies
  - @primitree/core@1.0.0-next.0

Initial release of `@primitree/dtcg`.

### Added

- `createDTCGGraphFragment` and `DTCGGraphFragmentOptions` at the package root.
- Group `$type` inheritance, `$root`, metadata shape checks, and metadata
  omission from Core graph records.
- Graph input for the supported `color`, `cubicBezier`, `dimension`, `duration`,
  `number`, `fontWeight`, `fontFamily`, `string`, and `boolean` value forms. This
  includes all 14 checked color spaces, four-number cubic Bezier curves, ordered
  font family lists, and named or numeric font weights.
- Same-file brace reference chains with alias type inference and immediate type
  checks. Core `resolveToken` reports cycles whose aliases share one effective
  type.
- Limits of 64 path segments, 256 joined-path characters, 64 nested value
  levels, and 100,000 shared work items per call.
- Conversion from REST responses, bare metadata objects, and plugin exports to DTCG 2025.10 plus a documented boolean extension.
- Base token files by collection and mode override files.
- Resolver documents that map Figma modes to contexts.
- Figma metadata under `$extensions['com.primitree']`.
- Reference resolution, context application, effective-type flattening,
  context listing, and shared-budget validation across every declared context.
- CSS custom properties, Tailwind CSS v4 themes, and TypeScript token accessors.
- `buildDTCGOutputs` for checked token files and a Resolver, with bounded JSON
  sorting, the required `tokens.resolver.json` name, lone-surrogate rejection,
  up to 64 nested directory levels and 16,639 UTF-8 bytes per emitted token
  path, including its fixed `tokens/` prefix, a 255-byte UTF-8 limit for each
  path segment, linear output-path collision checks, and one shared summary
  work limit across Resolver application and token flattening.
- CSS output for boolean values and font fallback lists. Tailwind names follow
  inherited and alias token types, and name collisions receive number suffixes.
- CSS output for all 14 DTCG color spaces, missing color components, and alpha.
  It keeps authored color coordinates instead of rounding sRGB values or using
  the optional hex fallback. Public color types and the DTCG reader use the
  same 14 space names and `none` component marker.
- CSS `cubic-bezier()` output, Tailwind `--ease-*` mappings, and four-number
  TypeScript values for DTCG cubic Bezier tokens.
- CSS output escapes strings and Resolver selectors. One work limit covers
  every context, including token paths and text. CSS output also limits group
  depth and returned text. It rejects U+0000 and lone UTF-16 surrogates in raw
  CSS text. Custom banners reject text that would close the generated comment.
  CSS and TypeScript reject CSS custom property collisions. Tailwind checks
  emitted values.
- In-memory pipeline output with Style Dictionary or Terrazzo configuration.

### Requirements

- Node.js 24 or newer.
