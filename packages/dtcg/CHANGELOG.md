# Changelog

## 1.0.0 (Unreleased)

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
  and output-path collision checks.
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
