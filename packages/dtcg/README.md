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
