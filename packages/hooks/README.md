<div align="center">

# @figmavars/hooks

React hooks for built design tokens and the Figma Variables REST API.

[![CI](https://github.com/marklearst/figmavars/actions/workflows/ci.yml/badge.svg)](https://github.com/marklearst/figmavars/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

</div>

```sh
npm install @figmavars/hooks react swr
```

## Requirements

- Node.js 24 or newer
- React `^19.0.0`
- SWR `^2.3.7`

## Read built tokens

Run `npx @figmavars/cli build variables.json`, then pass the generated token
documents and Resolver to `TokensProvider`.

```tsx
import { TokensProvider, useTheme, useToken } from '@figmavars/hooks'
import primitives from './design-tokens/tokens/primitives.tokens.json'
import semantic from './design-tokens/tokens/semantic.tokens.json'
import semanticDark from './design-tokens/tokens/semantic.dark.tokens.json'
import resolver from './design-tokens/tokens/tokens.resolver.json'

export function App() {
  return (
    <TokensProvider
      tokens={{
        'primitives.tokens.json': primitives,
        'semantic.tokens.json': semantic,
        'semantic.dark.tokens.json': semanticDark,
      }}
      resolver={resolver}>
      <Toolbar />
    </TokensProvider>
  )
}

function Toolbar() {
  const brand = useToken('semantic.color.bg.brand')
  const { contexts, setContext } = useTheme()

  return (
    <button
      style={{ background: brand.css ?? undefined }}
      onClick={() => setContext('semantic', contexts.semantic === 'dark' ? 'light' : 'dark')}>
      Theme: {contexts.semantic}
    </button>
  )
}
```

`TokensProvider` accepts:

- one DTCG document
- an array of DTCG documents, merged in order
- a file map and Resolver from `figma-vars build`

The local-token API includes:

- `useToken(path)` for one token, its resolved value, CSS value, and `var()` accessor
- `useTokens()` for flattened tokens under the active contexts
- `useTheme()` for Resolver contexts and `setContext`

These hooks read supplied artifacts and can render during SSR. They do not
need a Figma Personal Access Token or a network request.

## Use the Variables REST API

The live hooks require a Full seat in a Figma Enterprise organization. Use a
token with `file_variables:read` for queries and `file_variables:write` for
mutations.

A token passed to `FigmaVarsProvider` is readable in that browser session. Use
the live hooks in an access-controlled internal application. Keep tokens out of
source control and public browser environment variables. For server work, use
`@figmavars/core`.

```tsx
import {
  FigmaVarsProvider,
  useInvalidateVariables,
  useUpdateVariable,
  useVariables,
} from '@figmavars/hooks'

interface InternalVariablesAppProps {
  token: string
  fileKey: string
}

function InternalVariablesApp({ token, fileKey }: InternalVariablesAppProps) {
  return (
    <FigmaVarsProvider
      token={token}
      fileKey={fileKey}>
      <VariablesDashboard />
    </FigmaVarsProvider>
  )
}

function VariablesDashboard() {
  const { data, error } = useVariables()
  const { mutate: update, isLoading: saving } = useUpdateVariable()
  const { invalidate } = useInvalidateVariables()

  async function renameVariable() {
    const result = await update({
      variableId: 'VariableID:123:456',
      payload: { name: 'color/bg/brand' },
    })

    if (result) {
      invalidate()
    }
  }

  if (error) {
    return <p role='alert'>{error.message}</p>
  }

  return (
    <button
      disabled={saving || !data}
      onClick={renameVariable}>
      Rename variable
    </button>
  )
}
```

Query hooks:

- `useVariables`
- `usePublishedVariables`
- `useVariableCollections`
- `useVariableModes`
- `useVariableById`
- `useCollectionById`
- `useModesByCollection`

Mutation and cache hooks:

- `useCreateVariable`
- `useUpdateVariable`
- `useDeleteVariable`
- `useBulkUpdateVariables`
- `useInvalidateVariables`

Context hooks:

- `useFigmaToken`
- `useFigmaTokenContext`

Pass `swrConfig` to `FigmaVarsProvider` to configure the shared SWR provider.

## Read an export through the live hooks

Pass a local variables response as `fallbackFile`:

```tsx
<FigmaVarsProvider
  token={null}
  fileKey={null}
  fallbackFile={variablesJson}>
  <VariablesDashboard />
</FigmaVarsProvider>
```

Read hooks use the supplied export in this mode. Mutation hooks still require
the REST API.

## Non-React API

Use [`@figmavars/core`](https://www.npmjs.com/package/@figmavars/core) for
normalization, comparison, REST calls, and shared types outside React.

`@figmavars/hooks/core` re-exports that package for compatibility with earlier
FigmaVars code.

## CLI export

The package includes the `figma-vars-export` command for existing users.
[`@figmavars/cli`](https://www.npmjs.com/package/@figmavars/cli) provides the
current `figma-vars export` command with the rest of the token workflow.

## Migrating from 4.x

Replace `@figma-vars/hooks` with `@figmavars/hooks` in dependencies and imports.
The legacy npm package ends at version 4.0.0.

Read the [migration guide](https://figmavars.com/docs/hooks/migration) and the
[5.0.0 changelog](CHANGELOG.md).

## License

MIT © [Mark Learst](https://github.com/marklearst)
