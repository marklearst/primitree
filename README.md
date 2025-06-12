# figma-vars-hooks

**figma-vars-hooks** is a React hook library for integrating [Figma Variables](https://help.figma.com/hc/en-us/articles/14230009824539) directly into your components and theme logic. Easily create, update, bind, and sync tokens with Figma's API in a fully typed, idiomatic way.

## 📦 Install

```bash
pnpm add figma-vars-hooks
# or
npm install figma-vars-hooks
```

> Requires React 19 or later.

## 🚀 Usage

```ts
import { useFigmaVars } from 'figma-vars-hooks'

const ThemeSync = () => {
  const { tokens, isLoading, error } = useFigmaVars()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading Figma variables</div>

  return (
    <ul>
      {tokens.map((token) => (
        <li key={token.name}>
          {token.name}: {token.value}
        </li>
      ))}
    </ul>
  )
}
```

## 🧩 Available Hooks

- `useFigmaVars`
- `useFigmaVarModes`
- `useFigmaVarValues`
- `useFigmaVarCollections`
- `useFigmaVarAliases`
- `useFigmaPublishVars`
- `useFigmaVarBindings`
- `useFigmaVarByType`
- `useFigmaVarsCache`
- `useFigmaAuth`
- `useCreateFigmaVar`
- `useUpdateFigmaVar`
- `useDeleteFigmaVar`
- `useFigmaSync`

## 🛠️ Utilities

These helper functions are also available:

```ts
import { fetchWithAuth } from 'figma-vars-hooks'
```

## 🧪 Coming Soon

- React Native support
- Token change subscriptions
- CLI to extract & sync variables

## 📄 License

MIT
