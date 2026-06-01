# @figma-vars/core

Framework-agnostic foundation for working with Figma Variables: normalize any variables JSON shape, resolve alias graphs, diff exports semantically, and talk to the REST API with types.

```sh
npm i @figma-vars/core
```

## Normalize any export shape

```ts
import { normalizeVariables } from '@figma-vars/core'

const normalized = normalizeVariables(json) // REST response, bare meta,
// plugin-style { variables, collections }, or a raw JSON string
normalized.collections // [{ id, name, modes, defaultModeId, variableIds }]
normalized.variables // [{ id, name, resolvedType, valuesByMode, scopes, ... }]
normalized.warnings // anything skipped, explained
```

## Resolve alias graphs

```ts
import { resolveVariableValue, resolveAllVariableValues } from '@figma-vars/core'

const { value, aliasChain } = resolveVariableValue(normalized, 'VariableID:2:201', modeId)
// follows aliases across collections with Figma-accurate mode fallback,
// cycle detection, and dangling-target errors
```

## Diff exports like code

```ts
import { diffVariables, formatDiffMarkdown } from '@figma-vars/core'

const diff = diffVariables(oldJson, newJson) // matched by stable Figma IDs
diff.variables.renamed // renames detected as renames
diff.variables.valueChanged // per-mode value changes with mode names
diff.breaking // removals/renames/moves/type changes
console.log(formatDiffMarkdown(diff))
```

## Typed REST client (Enterprise)

```ts
import { fetcher, mutator, FIGMA_LOCAL_VARIABLES_ENDPOINT, withRetry } from '@figma-vars/core'

const data = await fetcher(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey), token)
```

Plus: `FigmaApiError` with status/retry-after, rate-limit helpers, runtime type guards, `filterVariables`, `redactToken`, and every Figma domain type (also exported from the `@figma-vars/core/types` subpath).

Part of [FigmaVars](https://github.com/marklearst/figma-vars-hooks) — see [`@figma-vars/cli`](https://www.npmjs.com/package/@figma-vars/cli) for the batteries-included pipeline.

MIT © Mark Learst
