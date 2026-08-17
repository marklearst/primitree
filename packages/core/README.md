# @primitree/core

`@primitree/core` provides the Figma Variables types, normalization, alias
resolution, comparison, and REST API functions shared across Primitree.

```sh
npm install @primitree/core@next
```

## Requirements

- Node.js 24 or newer

## Normalize a variables export

```ts
import { normalizeVariables } from '@primitree/core'

const normalized = normalizeVariables(json)

normalized.collections
normalized.variables
normalized.collectionsById
normalized.variablesById
normalized.warnings
```

`normalizeVariables` accepts:

- a Figma REST local variables response
- a bare `{ variables, variableCollections }` object
- a plugin-style `{ variables, collections }` object
- a JSON string containing one of those shapes

It rejects published-variable responses because those records do not contain
the mode values needed for conversion.

## Resolve aliases

```ts
import { resolveAllVariableValues, resolveVariableValue } from '@primitree/core'

const result = resolveVariableValue(normalized, 'VariableID:2:201', '1:0')

console.log(result.value, result.aliasChain)

const resolved = resolveAllVariableValues(normalized)
console.log(resolved.values, resolved.errors)
```

The resolver follows variable aliases across collections. It reports cycles,
missing targets, and values that cannot resolve for a requested mode.

## Compare two exports

```ts
import { diffVariables, formatDiffMarkdown } from '@primitree/core'

const diff = diffVariables(previousExport, nextExport)

console.log(diff.variables.renamed)
console.log(diff.variables.valueChanged)
console.log(diff.breaking)
console.log(formatDiffMarkdown(diff))
```

The comparison matches collections and variables by Figma ID. Its breaking
flag covers removals, renames, moves, and type changes.

## Call the Variables REST API

```ts
import { fetcher, FIGMA_LOCAL_VARIABLES_ENDPOINT, mutator, withRetry } from '@primitree/core'

const variables = await fetcher(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey), token)
```

The package exports endpoint builders, `FigmaApiError`, retry helpers, runtime
type guards, mutation payload types, and Figma domain types. Import the domain
types from the package root or `@primitree/core/types`.

`redactToken` returns a shortened display value. The result exposes token
characters, so do not log it.

## Related packages

- [`@primitree/dtcg`](https://www.npmjs.com/package/@primitree/dtcg) converts normalized data into token files.
- [`@primitree/cli`](https://www.npmjs.com/package/@primitree/cli) writes a token pipeline to disk.
- [`@primitree/hooks`](https://www.npmjs.com/package/@primitree/hooks) provides React hooks.

Read the [Primitree documentation](https://primitree.com) or review the
[1.0.0-next.1 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
