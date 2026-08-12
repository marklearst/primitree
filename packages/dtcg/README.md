# @primitree/dtcg

`@primitree/dtcg` reads supported DTCG 2025.10 token values and converts Figma
variables JSON into DTCG plus a documented boolean extension. It creates token
documents, a Resolver document, CSS custom properties, a Tailwind CSS v4 theme,
and TypeScript token accessors.

```sh
npm install @primitree/dtcg
```

## Requirements

- Node.js 24 or newer

The conversion functions perform no file I/O, so browser applications can use
them in a bundle.

## Read DTCG tokens into Core

`createDTCGGraphFragment` reads a parsed token document that uses Primitree's
supported DTCG value subset. It returns a Core graph fragment or source
diagnostics.

```ts
import { createDTCGGraphFragment } from '@primitree/dtcg'

const result = createDTCGGraphFragment(
  {
    scale: {
      $type: 'number',
      base: { $value: 4 },
      control: { $value: '{scale.base}' },
    },
  },
  { source: 'brand', uri: 'tokens.json' }
)

if (!result.ok) {
  throw new Error(result.diagnostics[0]?.message ?? 'DTCG input failed')
}

const fragment = result.value
```

The reader supports:

- group `$type` inheritance and `$root`
- `color` values in any of the 14 color spaces checked by the package, including
  missing components marked with `none`
- `cubicBezier` values with four finite coordinates and both x coordinates from
  0 through 1
- `dimension` values with `px` or `rem`, and finite `duration` values with `ms`
  or `s`
- `fontFamily` values with one font name or an ordered list of names
- `fontWeight` values from 1 through 1000 or one of the 18 names in DTCG
  2025.10
- finite `number` values and text `string` values
- Primitree's documented `boolean` extension
- whole-token brace references in the same document
- alias type inference through a chain that reaches a typed token
- `$description`, `$deprecated`, and `$extensions` shape checks

The reader checks that `$description` is text, `$deprecated` is boolean or text,
and `$extensions` is a plain object. It then omits those fields because Core
graph records do not store them.

The reader requires an alias and its immediate target to have the same effective
type whenever that target exists. A typed alias may keep a missing target for
Core `composeGraph` to report. A cycle whose aliases share one effective type
remains in the fragment. Core `resolveToken` reports the cycle when it resolves
that token. The reader rejects a cycle if it cannot infer the type.

The reader rejects `$extends`, JSON Pointer references, references nested inside
literal values, unknown reserved properties, and token types outside the list
above.

Limits for each call:

- 64 path segments for a group or token
- 256 characters for a dot-joined group or token path
- 64 nested levels inside a token value
- one shared 100,000-item work budget that counts document entries,
  brace-reference segments, each literal value scan, token-value object keys,
  and token-value array entries

## Convert an export

```ts
import { toDTCG } from '@primitree/dtcg'

const { files, resolver, resolverFileName, warnings } = toDTCG(variablesJson)
```

Call `toDTCG` to create:

- one base token file for each Figma collection
- one override file for each extra mode in a collection
- token references for Figma aliases
- a Resolver modifier for each collection with more than one mode
- Figma IDs, collection data, scopes, and code syntax under
  `$extensions['com.primitree']`

DTCG 2025.10 does not define a boolean token type. Primitree keeps Figma
boolean values as `$type: "boolean"` and records the Figma type in the
extension data.

## Resolve contexts and references

```ts
import {
  applyResolver,
  flattenTokens,
  listContexts,
  listPermutations,
  resolveTokenValues,
  resolveTokenValuesSafe,
} from '@primitree/dtcg'

const dark = applyResolver(files, resolver, { semantic: 'dark' })
const flat = flattenTokens(dark)
const values = resolveTokenValues(flat)
```

`resolveTokenValues` throws on a missing target or reference cycle.
`resolveTokenValuesSafe` returns resolved values and collected errors.

## Build in-memory pipeline files

Use `buildDTCGOutputs` when token files and a Resolver have already passed
their input checks.

```ts
import { buildDTCGOutputs } from '@primitree/dtcg'

const result = buildDTCGOutputs({
  files,
  resolver,
  resolverFileName: 'tokens.resolver.json',
})

for (const file of result.files) {
  console.log(file.path, file.contents)
}
```

The function returns token JSON, the Resolver, CSS custom properties, a
Tailwind CSS v4 theme, and TypeScript token accessors. It does not read or write
files. Set `css`, `tailwind`, or `typescript` to `false` to omit that file.

`buildDTCGOutputs` rejects file names with absolute paths or `..` segments. It
requires a Resolver basename and rejects names that collide after lowercasing
and Unicode normalization. Its JSON sorter accepts up to 1,000 token files, 64
levels, 100,000 items, and 20 MiB of names and text values.

The result summary reads up to 64 token-group levels. Its 1,000,000-unit work
limit counts Resolver reads and token merges.

CSS output reads up to 64 token-group levels and returns up to 20 MiB. Its
1,000,000-unit work limit counts Resolver reads, token merges, value comparisons,
declarations, token paths, and token text. CSS strings and selectors escape text
that would break the file. CSS and Tailwind custom property names keep
non-ASCII token text. TypeScript accessors use the same CSS names. CSS and
TypeScript output reject token paths that map to the same CSS custom property
name. Tailwind applies the same check to the values it emits. Tailwind reads at
most 64 token-group levels and 100,000 items. Its 1,000,000-unit work limit
counts Resolver reads and token merges.

Use `buildPipeline` when the input is a Figma variables response:

```ts
import { buildPipeline } from '@primitree/dtcg'

const result = buildPipeline(variablesJson)

for (const file of result.files) {
  console.log(file.path, file.contents)
}
```

`buildPipeline` can return:

- `tokens/*.tokens.json`
- `tokens/tokens.resolver.json`
- `css/tokens.css`
- `css/tokens.tailwind.css`
- `ts/tokens.ts`
- a Style Dictionary or Terrazzo configuration
- a GitHub Actions workflow template
- a README for the generated token project

The CSS emitter writes default values in `:root`. Extra contexts use a selector
based on the Resolver axis, such as `[data-semantic='dark']`.

CSS custom properties keep boolean values and ordered font fallback lists.
Color values keep their DTCG color space, components, missing markers, and
alpha. A `hex` fallback stays in token JSON and does not replace those
coordinates in CSS.
Cubic Bezier values become `cubic-bezier()` in CSS. Tailwind maps them to its
`--ease-*` namespace. TypeScript output keeps the four-number tuple.
Tailwind output follows group type inheritance and alias type inference. It adds
a number suffix to the later name when two paths produce the same Tailwind name.

Use [`@primitree/cli`](https://www.npmjs.com/package/@primitree/cli) when you
want Primitree to write these files to disk.

Read the [Primitree documentation](https://primitree.com) or review the
[1.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
