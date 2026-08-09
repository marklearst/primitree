# Changelog

## 1.0.0 (Unreleased)

Initial release of `@primitree/dtcg`.

### Added

- `createDTCGGraphFragment` and `DTCGGraphFragmentOptions` at the package root.
- Group `$type` inheritance, `$root`, metadata shape checks, and metadata
  omission from Core graph records.
- Graph input for the supported `color`, `dimension`, `duration`, `number`,
  `fontWeight`, `fontFamily`, `string`, and `boolean` value forms, including all
  14 color spaces checked by the package.
- Same-file brace reference chains with alias type inference and immediate type
  checks. Core `resolveToken` reports cycles whose aliases share one effective
  type.
- Limits of 64 path segments, 256 joined-path characters, 64 nested value
  levels, and 100,000 shared work items per call.
- Conversion from REST responses, bare metadata objects, and plugin exports to DTCG 2025.10 plus a documented boolean extension.
- Base token files by collection and mode override files.
- Resolver documents that map Figma modes to contexts.
- Figma metadata under `$extensions['com.primitree']`.
- Reference resolution, context application, flattening, and context listing.
- CSS custom properties, Tailwind CSS v4 themes, and TypeScript token accessors.
- In-memory pipeline output with Style Dictionary or Terrazzo configuration.

### Requirements

- Node.js 24 or newer.
