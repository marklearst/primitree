# @figmavars/dtcg

Convert Figma variables JSON into **DTCG 2025.10 design tokens** with a standards-compliant **Resolver** for modes — as pure functions that run in Node, browsers, and edge runtimes.

```ts
import { toDTCG } from '@figmavars/dtcg'

const { files, resolver, warnings } = toDTCG(variablesJson)
// files:    { 'primitives.tokens.json': {...}, 'semantic.dark.tokens.json': {...}, ... }
// resolver: { version: '2025.10', sets, modifiers, resolutionOrder }
```

## What it does

- **One token file per collection** plus one override file per extra Figma mode, wrapped in a collection group so cross-collection references are unambiguous
- **Aliases stay references** — `{primitives.color.blue.500}`, never flattened
- **Type inference** — `COLOR` → color objects (sRGB components + hex), `FLOAT` → `dimension`/`number`/`fontWeight`/`duration` via scope and name heuristics, `STRING` → `string`/`fontFamily`, `BOOLEAN` preserved via extension type
- **Figma metadata preserved** — variable ids, collection, scopes, code syntax under `$extensions['com.figma-vars']`, enabling ID-based diffing and round-trips
- **Resolver generation** — every multi-mode collection becomes a modifier axis with its modes as contexts and the default mode as `default`

## Runtime utilities

```ts
import {
  applyResolver, // files + resolver + { semantic: 'dark' } -> merged document
  flattenTokens, // document -> [{ path, token }]
  resolveTokenValues, // follow {references} to concrete values (throwing)
  resolveTokenValuesSafe, // same, collecting errors instead
  listContexts, // resolver -> { semantic: ['light','dark'], ... }
  listPermutations, // every context combination
} from '@figmavars/dtcg'
```

## Pipeline emitters

```ts
import { buildPipeline, emitCss, emitTailwind, emitTypescript } from '@figmavars/dtcg'

const { files } = buildPipeline(variablesJson)
// [{ path: 'tokens/semantic.tokens.json', contents: '...' }, { path: 'css/tokens.css', ... }, ...]
```

`buildPipeline` returns everything as in-memory files — the CLI writes them to disk, the [playground](https://github.com/marklearst/figmavars) zips them in the browser.

Most people should use [`@figmavars/cli`](https://www.npmjs.com/package/@figmavars/cli) (`figma-vars build`); reach for this package when embedding the conversion in your own tools.

MIT © Mark Learst
