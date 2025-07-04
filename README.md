# @figma-vars/hooks

A modern, type-safe, and flexible React hooks library for the [Figma Variables API](https://www.figma.com/developers/api#variables).

Built for the modern web, this library provides a suite of hooks and utilities to fetch, manage, and mutate your design tokens, making it easy to sync them between Figma and your React applications, Storybooks, or design system dashboards.

---

## 🚀 Features

- **✅ Token Agnostic for the Best DX**: Our library doesn't care _how_ you get your Figma token. Use environment variables, `localStorage`, a state management library, or even a simple input field. This framework-agnostic approach means it works seamlessly with Vite, Next.js, Create React App, and more, without locking you into a specific build tool.
- **⚛️ Modern React Hooks**: A full suite of hooks for fetching Figma variables, collections, and modes, built on top of `swr` for efficient caching, revalidation, and performance.
- **✍️ Mutation Utilities**: Simple, promise-based functions for creating, updating, and deleting variables.
- **🔒 TypeScript-first**: Strictly typed for an ergonomic and safe developer experience. Get autocompletion for all API responses.
- **📖 Storybook & Next.js Ready**: Perfect for building live design token dashboards or style guides.

---

## 📦 Install

```bash
npm install @figma-vars/hooks
# or
yarn add @figma-vars/hooks
# or
pnpm add @figma-vars/hooks
```

> **Peer dependencies:** You'll need `react`, `react-dom`, and `swr`.

---

## 🛠️ Setup & Usage

The library is designed to be as flexible as possible. You provide the Figma token and file key, and the hooks handle the rest.

Wrap your application (or the relevant component tree) with the `FigmaVarsProvider`. This makes the Figma token and file key available to all the hooks.

```tsx
// src/main.tsx or App.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { FigmaVarsProvider } from '@figma-vars/hooks'
import App from './App'

// The token can come from anywhere: .env, localStorage, state, etc.
const FIGMA_TOKEN = import.meta.env.VITE_FIGMA_TOKEN
const FIGMA_FILE_KEY = 'your-figma-file-key'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FigmaVarsProvider
      token={FIGMA_TOKEN}
      fileKey={FIGMA_FILE_KEY}>
      <App />
    </FigmaVarsProvider>
  </React.StrictMode>
)
```

Now, you can use the hooks anywhere in your app:

```tsx
// src/components/TokenList.tsx
import { useVariables } from '@figma-vars/hooks'

export function TokenList() {
  const { data, isLoading, error } = useVariables()

  if (isLoading) return <div>Loading tokens...</div>
  if (error) return <div>Error: {error.message}</div>

  // The 'data' object contains variables, collections, and modes
  const variables = Object.values(data?.variables ?? {})

  return (
    <ul>
      {variables.map((variable) => (
        <li key={variable.id}>
          {variable.name}: {JSON.stringify(variable.valuesByMode)}
        </li>
      ))}
    </ul>
  )
}
```

---

## 🧩 API Reference

### Core Hooks

- `useVariables()`: Fetches all local variables, collections, and modes for the file key provided to the `FigmaVarsProvider`.
- `useVariableCollections()`: A convenience hook that returns just the variable collections from the main `useVariables` data.
- `useVariableModes()`: A convenience hook that returns just the variable modes from the main `useVariables` data.
- `useFigmaToken()`: A simple hook to access the token and file key from the context.

### Mutations

- `createVariable(token, fileKey, variableData)`
- `updateVariable(token, fileKey, variableId, newData)`
- `deleteVariable(token, fileKey, variableId)`
- `bulkUpdateVariables(token, fileKey, variables)`

### Types

All types are exported from `@figma-vars/hooks`. The core response type from Figma is `Variables_LocalVariablesResponse`.

---

## 📚 Storybook & Next.js Integration

The provider model makes integration trivial. Simply wrap your Storybook stories or Next.js pages with the `FigmaVarsProvider`.

```tsx
// In a Storybook story
import { FigmaVarsProvider, useVariables } from '@figma-vars/hooks'

export const TokensStory = () => (
  <FigmaVarsProvider
    token="YOUR_TOKEN"
    fileKey="YOUR_FILE_KEY">
    <TokenList />
  </FigmaVarsProvider>
)

const TokenList = () => {
  const { data } = useVariables()
  return <pre>{JSON.stringify(data?.variables, null, 2)}</pre>
}
```

---

## 📝 Contributing

PRs and issues are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT
