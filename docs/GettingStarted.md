# Getting Started with @figma-vars/hooks

This guide will walk you through setting up and using the library to fetch Figma variables in your React application.

---

## 1. Installation

First, add the library to your project. You will also need `swr`, which is a peer dependency used for data fetching.

```bash
npm install @figma-vars/hooks swr
# or
yarn add @figma-vars/hooks swr
# or
pnpm add @figma-vars/hooks swr
```

---

## 2. Provider Setup: The Token-Agnostic Way

The core of the library is the `FigmaVarsProvider`. It uses React Context to efficiently provide your Figma token and file key to all the hooks in your app. This approach is **token-agnostic**, meaning you have complete control over how you manage your credentials.

Wrap your application's root component (or any component tree that will use the hooks) with the provider.

**Example (`main.tsx` for a Vite app):**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { FigmaVarsProvider } from '@figma-vars/hooks'
import App from './App'

// --- Your Token, Your Choice ---
// The token can come from anywhere. This makes the library incredibly flexible.
// Here, we're using Vite's environment variables as an example.
const FIGMA_TOKEN = import.meta.env.VITE_FIGMA_TOKEN

// You also need the file key for the Figma file you want to access.
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

By doing this, you've securely provided the token and file key without locking your project into a specific build system or token strategy.

---

## 3. Basic Usage: Fetching Variables

Once the provider is in place, you can use the `useVariables` hook anywhere inside that component tree. The hook doesn't need any arguments; it gets the token and file key directly from the context.

**Example (a component that displays a list of variables):**

```tsx
import { useVariables } from '@figma-vars/hooks'

export function TokenList() {
  const { data, isLoading, error } = useVariables()

  if (isLoading) {
    return <div>Loading design tokens...</div>
  }

  if (error) {
    return <div>Error fetching tokens: {error.message}</div>
  }

  // The `data` object contains all local variables, collections, and modes.
  // We can safely extract the variables to render them.
  const variables = Object.values(data?.variables ?? {})

  return (
    <div>
      <h2>Design Tokens</h2>
      <ul>
        {variables.map((variable) => (
          <li key={variable.id}>
            <strong>{variable.name}</strong>:
            <pre>{JSON.stringify(variable.valuesByMode, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

And that's it! You've successfully set up the library and are now fetching live data from the Figma API in a flexible, robust, and type-safe way.
