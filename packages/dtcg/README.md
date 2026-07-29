# @primitree/dtcg

`@primitree/dtcg` converts Figma variables JSON into DTCG 2025.10 plus a
documented boolean extension. It creates token documents, a Resolver document,
CSS custom properties, a Tailwind CSS v4 theme, and TypeScript token accessors.

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
- `color` values in any of the 14 color spaces checked by the package
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

Use [`@primitree/cli`](https://www.npmjs.com/package/@primitree/cli) when you
want Primitree to write these files to disk.

Read the [Primitree documentation](https://primitree.com) or review the
[1.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
