# figma-vars-hooks

A modern, type-safe React hooks & utilities library for the [Figma Variables API](https://www.figma.com/developers/api#variables). Fetch, update, and sync design tokens between Figma and your app, Storybook, or design system dashboard.

---

## 🚀 Features

- **React 19+ hooks** for fetching and updating Figma variables, collections, and modes
- **Mutation utilities** for creating, updating, and deleting variables
- **TypeScript-first**: strict, ergonomic types for all API surfaces
- **Storybook/Next.js ready** for live token dashboards
- **Experimental/advanced hooks** for power users

---

## 📦 Install

```bash
npm install figma-vars-hooks
# or
yarn add figma-vars-hooks
# or
pnpm add figma-vars-hooks
```

> **Peer dependency:** React 19+

---

## 🛠️ Setup: Figma API Token

Set your Figma Personal Access Token as an environment variable in your app (Vite example):

```env
VITE_FIGMA_TOKEN=your-figma-token-here
```

---

## ⚡ Quick Start Example

```tsx
import { useVariables } from 'figma-vars-hooks'

export function TokenList({ fileKey }: { fileKey: string }) {
  const { variables, loading, error, refresh } = useVariables(fileKey)

  if (loading) return <div>Loading…</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {variables?.map((v) => (
        <li key={v.id}>
          {v.name}: {v.value}
        </li>
      ))}
      <button onClick={refresh}>Refresh</button>
    </ul>
  )
}
```

---

## 🧩 API Reference

### Core Hooks

- `useFigmaToken()` – Get the current Figma API token
- `useVariables(fileKey, options?)` – Fetch variables for a Figma file (with polling/refresh)
- `useVariableCollections(fileKey)` – Fetch variable collections for a file
- `useVariableModes(collectionId)` – Fetch variable modes for a collection

### Mutations

- `createVariable(fileKey, variableData)` – Create a new variable
- `updateVariable(fileKey, variableId, newData)` – Update a variable
- `deleteVariable(fileKey, variableId)` – Delete a variable
- `updateVariableValues(variableId, values)` – Update variable values across modes

### Utilities

- `filterVariables(variables, { type?, name? })` – Filter variables by type/name
- `VariablesCache` – Simple in-memory cache for variable lists
- `fetchHelpers`, `authHelpers` – Internal helpers (advanced)

### Types

All types are exported from `figma-vars-hooks/types` (see `src/types/`).

---

## 🧪 Experimental/Advanced Hooks

- `useVariableAliases` – Manage local variable aliases (not in Figma API)
- `useVariableBindings` – Bind variables to UI components (not in Figma API)
- `usePublishVars`, `useSync` – Placeholders for future publish/sync features

> These are opt-in and may change—see `src/experimental/` for details.

---

## 📚 Storybook & Next.js Integration

Use these hooks in your Storybook stories or Next.js pages to build live design token dashboards. Example:

```tsx
// In a Storybook story
import { useVariables } from 'figma-vars-hooks'

export const TokensStory = () => {
  const { variables } = useVariables('YOUR_FILE_KEY')
  return <pre>{JSON.stringify(variables, null, 2)}</pre>
}
```

---

## 📝 Contributing

PRs and issues welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

---

## 🙏 Credits

Built by Mark Learst and contributors. Inspired by the Figma community and the need for seamless design token workflows.
