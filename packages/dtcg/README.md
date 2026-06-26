# @figmavars/dtcg

`@figmavars/dtcg` converts Figma variables JSON into DTCG 2025.10 plus a
documented boolean extension. It creates token documents, a Resolver document,
CSS custom properties, a Tailwind CSS v4 theme, and TypeScript token accessors.

```sh
npm install @figmavars/dtcg
```

## Requirements

- Node.js 24 or newer

The conversion functions perform no file I/O, so browser applications can use
them in a bundle.

## Convert an export

```ts
import { toDTCG } from '@figmavars/dtcg'

const { files, resolver, resolverFileName, warnings } = toDTCG(variablesJson)
```

`toDTCG` produces:

- one base token file for each Figma collection
- one override file for each extra mode in a collection
- token references for Figma aliases
- a Resolver modifier for each collection with more than one mode
- Figma IDs, collection data, scopes, and code syntax under
  `$extensions['com.figma-vars']`

DTCG 2025.10 does not define a boolean token type. FigmaVars keeps Figma
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
} from '@figmavars/dtcg'

const dark = applyResolver(files, resolver, { semantic: 'dark' })
const flat = flattenTokens(dark)
const values = resolveTokenValues(flat)
```

`resolveTokenValues` throws on a missing target or reference cycle.
`resolveTokenValuesSafe` returns resolved values and collected errors.

## Build in-memory pipeline files

```ts
import { buildPipeline } from '@figmavars/dtcg'

const result = buildPipeline(variablesJson)

for (const file of result.files) {
  console.log(file.path, file.contents)
}
```

The returned files can include:

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

Use [`@figmavars/cli`](https://www.npmjs.com/package/@figmavars/cli) when you
want FigmaVars to write these files to disk.

Read the [FigmaVars documentation](https://figmavars.com) or review the
[5.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
