# FigmaVars/hooks

<p align="left">
  <img src="assets/figma-vars-tagline-light.png" alt="FigmaVars Logo" width="700px" />
</p>

Built and maintained by Mark Learst.

A fast, typed React 19.2.3 hooks library for the Figma Variables API: fetch, update, and manage design tokens via the official [Figma REST API](https://www.figma.com/developers/api#variables).

Built for the modern web, this library provides a suite of hooks to fetch, manage, and mutate your design tokens/variables, making it easy to sync them between Figma and your React applications, Storybooks, or design system dashboards.

![Status](https://img.shields.io/badge/status-stable-brightgreen)
![CI](https://github.com/marklearst/figma-vars-hooks/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/marklearst/figma-vars-hooks/branch/main/graph/badge.svg)](https://codecov.io/gh/marklearst/figma-vars-hooks)
![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/github/license/marklearst/figma-vars-hooks)
![GitHub last commit](https://img.shields.io/github/last-commit/marklearst/figma-vars-hooks)
![GitHub code size](https://img.shields.io/github/languages/code-size/marklearst/figma-vars-hooks)

## 📌 Why 3.0

- ✨ **New DX Features**: SWR configuration support, error handling utilities, cache invalidation helpers
- 🔧 **React 19.2 Ready**: Optimized hooks with proper cleanup and stable function references
- 🛡️ **Better Error Handling**: `FigmaApiError` class with HTTP status codes for better error differentiation
- ✅ **Type Safety**: Removed unsafe type assertions, improved type definitions throughout
- 🚀 **Performance**: Hardened SWR usage (stable keys, `null` to disable, cleaner fallback handling)
- 📦 **Modern Tooling**: Node 20+ toolchain, strict TypeScript, and ESM-first packaging with CJS interop
- 🖥️ **CLI Export Tool**: Automate variable exports with `figma-vars-export` for CI/CD (Enterprise required)

## 🚀 Features at a Glance

- **Modern React 19.2 hooks** for variables, collections, modes, and published variables
- **Ergonomic mutation hooks** with consistent loading/error states
- **SWR configuration support** for customizing caching and revalidation behavior
- **Error handling utilities** for type-safe error checking and status code access
- **Cache invalidation helpers** for automatic data refresh after mutations
- **CLI export tool** (`figma-vars-export`) for automating variable exports to JSON (Enterprise required)
- **Fallback JSON support** (object or string) for offline/static use - works without Enterprise!
- **Typed core entrypoint** for non-React consumers (Axios, TanStack Query, server scripts)
- **100% test coverage** + strict TypeScript + clean exports/attw/publint/size-limit checks

## 📦 Install

```bash
npm install @figma-vars/hooks
# or
pnpm add @figma-vars/hooks
```

Peer deps: `react` and `react-dom`.

## 🖥️ CLI Export Tool

The package includes a **CLI tool** (`figma-vars-export`) for automatically exporting Figma variables to JSON via the REST API. Perfect for CI/CD pipelines, build scripts, or one-off exports.

> ⚠️ **Enterprise Required**: The CLI tool uses the Figma Variables REST API, which requires a **Figma Enterprise account**. Without Enterprise, use the [Dev Mode plugin export](#exporting-variables-for-fallback) method instead.

```bash
# Using npx (no install needed)
FIGMA_TOKEN=your_token npx figma-vars-export --file-key YOUR_FILE_KEY --out ./variables.json

# After installing
npm install @figma-vars/hooks
FIGMA_TOKEN=your_token figma-vars-export --file-key YOUR_FILE_KEY --out ./variables.json

# Show help
figma-vars-export --help
```

**Options:**

- `--file-key` - Figma file key (required, or set `FIGMA_FILE_KEY` env var)
- `--out` - Output path (default: `data/figma-variables.json`)
- `--help` - Show help message

**Environment Variables:**

- `FIGMA_TOKEN` or `FIGMA_PAT` - Figma Personal Access Token (required)
- `FIGMA_FILE_KEY` - Figma file key (optional)

**Example Output:**

```
Saved variables to ./variables.json
Variables count: 42
```

**No Enterprise?** See [Exporting variables for fallback](#exporting-variables-for-fallback) for alternative methods that work without Enterprise.

## 🛠️ Quick Start (SWR-powered hooks)

```tsx
import { FigmaVarsProvider, useVariables } from '@figma-vars/hooks'

const FIGMA_TOKEN = import.meta.env.VITE_FIGMA_TOKEN
const FIGMA_FILE_KEY = 'your-file-key'

function App() {
  return (
    <FigmaVarsProvider
      token={FIGMA_TOKEN}
      fileKey={FIGMA_FILE_KEY}
      swrConfig={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
      }}>
      <Tokens />
    </FigmaVarsProvider>
  )
}

function Tokens() {
  const { data, isLoading, error } = useVariables()
  if (isLoading) return <div>Loading…</div>
  if (error) return <div>Error: {error.message}</div>
  const variables = Object.values(data?.meta.variables ?? {})
  return <pre>{JSON.stringify(variables, null, 2)}</pre>
}
```

## 🧩 Non-SWR Usage (Core entrypoint)

Use the `/core` build when you prefer Axios/TanStack/server scripts without React/SWR.

**Axios example (GET + bulk PUT)**

```ts
import axios from 'axios'
import { FIGMA_FILE_VARIABLES_PATH } from '@figma-vars/hooks/core'

const token = process.env.FIGMA_TOKEN!
const fileKey = process.env.FIGMA_FILE_KEY!

// Fetch local variables
const url = `https://api.figma.com${FIGMA_FILE_VARIABLES_PATH(fileKey)}/local`
const { data } = await axios.get(url, {
  headers: { 'X-FIGMA-TOKEN': token, 'Content-Type': 'application/json' },
})

// Bulk update
await axios.put(
  `https://api.figma.com${FIGMA_FILE_VARIABLES_PATH(fileKey)}`,
  { variables: [{ action: 'UPDATE', id: 'VariableId:123', name: 'new-name' }] },
  { headers: { 'X-FIGMA-TOKEN': token, 'Content-Type': 'application/json' } }
)
```

**TanStack Query example**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FIGMA_FILE_VARIABLES_PATH, fetcher, mutator } from '@figma-vars/hooks/core'

const token = process.env.FIGMA_TOKEN!
const fileKey = process.env.FIGMA_FILE_KEY!

export function useLocalVariables() {
  return useQuery({
    queryKey: ['figma-local', fileKey],
    queryFn: () => fetcher(`${FIGMA_FILE_VARIABLES_PATH(fileKey)}/local`, token),
    staleTime: 60_000,
  })
}

export function useBulkUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: unknown) =>
      mutator(FIGMA_FILE_VARIABLES_PATH(fileKey), token, 'UPDATE', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['figma-local', fileKey] }),
  })
}
```

## 🛡️ Fallback JSON (offline/static)

Pass `fallbackFile` (object or JSON string) to `FigmaVarsProvider` to bypass live API calls:

```tsx
import exportedVariables from './figma-variables.json'
;<FigmaVarsProvider
  token={null}
  fileKey={null}
  fallbackFile={exportedVariables}>
  <App />
</FigmaVarsProvider>
```

### Exporting variables for fallback

There are several ways to get your Figma variables as JSON:

1. **Dev Mode / plugin export (recommended, no Enterprise needed)** ⭐
   - Use a Variables exporter plugin in Figma Dev Mode to download the full Variables panel as JSON
   - Save anywhere (e.g., `data/figma-variables.json`) and pass it to `fallbackFile`
   - Works for everyone, no Enterprise account required!

2. **CLI export tool (Enterprise required)** 🚀
   - Automatically exports via REST API - perfect for CI/CD and automation
   - See the [CLI Export Tool](#-cli-export-tool) section above for full usage details
   - Also available from cloned repo: `node scripts/export-variables.mjs --file-key KEY --out file.json`

- **Desktop MCP (manual/partial)**: Selecting a frame and running `get_variable_defs` returns only that selection’s variables. Use plugin/REST exports for complete coverage.

4. **Style Dictionary**
   - Once you have the JSON (from any path), feed it into Style Dictionary to emit platform-specific artifacts
   - Or import it directly via `fallbackFile`

## 🔧 Mutation Hooks (verbs fixed)

- `useCreateVariable` → POST via bulk endpoint with `action: 'CREATE'`
- `useUpdateVariable` → PUT via bulk endpoint with `action: 'UPDATE'`
- `useDeleteVariable` → DELETE via bulk endpoint with `action: 'DELETE'`
- `useBulkUpdateVariables` → PUT bulk payload (collections, modes, variables, values)

All return `{ mutate, data, error, isLoading, isSuccess, isError }`.

### Example: Creating and updating variables

```tsx
import { useCreateVariable, useUpdateVariable, useInvalidateVariables } from '@figma-vars/hooks'

function VariableEditor() {
  const { mutate: create } = useCreateVariable()
  const { mutate: update } = useUpdateVariable()
  const { invalidate } = useInvalidateVariables()

  const handleCreate = async () => {
    await create({
      name: 'Primary Color',
      variableCollectionId: 'CollectionId:123',
      resolvedType: 'COLOR',
    })
    invalidate() // Refresh cache after mutation
  }

  const handleUpdate = async (id: string) => {
    await update({
      variableId: id,
      payload: { name: 'Updated Name' },
    })
    invalidate() // Refresh cache after mutation
  }

  return (
    <>
      <button onClick={handleCreate}>Create Variable</button>
      <button onClick={() => handleUpdate('VariableId:123')}>Update</button>
    </>
  )
}
```

## 🛡️ Error Handling

### Error Boundaries (Recommended)

Wrap your Figma-connected components with an error boundary to gracefully handle errors:

```tsx
import { ErrorBoundary } from 'react-error-boundary'
import { FigmaVarsProvider } from '@figma-vars/hooks'

function FigmaErrorFallback({ error }: { error: Error }) {
  return (
    <div role='alert'>
      <h2>Failed to load Figma data</h2>
      <pre>{error.message}</pre>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={FigmaErrorFallback}>
      <FigmaVarsProvider
        token={FIGMA_TOKEN}
        fileKey={FIGMA_FILE_KEY}>
        <YourApp />
      </FigmaVarsProvider>
    </ErrorBoundary>
  )
}
```

> **Note:** The provider validates fallback file structure at runtime and logs warnings in development. Invalid fallback data won't crash the app but will result in `undefined` data.

### Runtime Validation

Use type guards to validate data at runtime:

```tsx
import { isLocalVariablesResponse, isPublishedVariablesResponse } from '@figma-vars/hooks'

// Validate before using
if (isLocalVariablesResponse(data)) {
  // Safe to access data.meta.variables
}
```

### Error Utilities

3.0.0 introduces powerful error handling utilities for type-safe error checking:

```tsx
import { isFigmaApiError, getErrorStatus, getErrorMessage, hasErrorStatus } from '@figma-vars/hooks'

function ErrorHandler({ error }: { error: Error | null }) {
  if (!error) return null

  // Type guard for FigmaApiError
  if (isFigmaApiError(error)) {
    const status = error.statusCode

    if (status === 401) {
      return <div>Authentication required. Please check your token.</div>
    }
    if (status === 403) {
      return <div>Access forbidden. Check file permissions.</div>
    }
    if (status === 429) {
      return <div>Rate limit exceeded. Please wait before retrying.</div>
    }
    if (status === 404) {
      return <div>File or variable not found.</div>
    }
  }

  // Helper functions
  const status = getErrorStatus(error) // number | null
  const message = getErrorMessage(error) // string

  // Convenience check
  if (hasErrorStatus(error, 401)) {
    // Handle unauthorized
  }

  return <div>Error: {message}</div>
}
```

**Common HTTP Status Codes:**

- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (file/variable doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)

## 🔄 Cache Management

After mutations, use `useInvalidateVariables` to refresh cached data:

```tsx
import { useUpdateVariable, useInvalidateVariables } from '@figma-vars/hooks'

function UpdateButton({ variableId }: { variableId: string }) {
  const { mutate, isLoading } = useUpdateVariable()
  const { invalidate, revalidate } = useInvalidateVariables()

  const handleUpdate = async () => {
    await mutate({
      variableId,
      payload: { name: 'New Name' },
    })

    // Option 1: Invalidate (refetch on next access)
    invalidate()

    // Option 2: Revalidate immediately (refetch now)
    // revalidate()
  }

  return (
    <button
      onClick={handleUpdate}
      disabled={isLoading}>
      {isLoading ? 'Updating...' : 'Update Variable'}
    </button>
  )
}
```

## ⚙️ SWR Configuration

Customize SWR behavior globally through the provider:

```tsx
<FigmaVarsProvider
  token={FIGMA_TOKEN}
  fileKey={FIGMA_FILE_KEY}
  swrConfig={{
    revalidateOnFocus: false, // Don't refetch on window focus
    dedupingInterval: 5000, // Dedupe requests within 5s
    errorRetryCount: 3, // Retry failed requests 3 times
    errorRetryInterval: 1000, // Wait 1s between retries
    onError: error => {
      // Global error handler
      if (isFigmaApiError(error) && error.statusCode === 429) {
        console.warn('Rate limited, backing off...')
      }
    },
  }}>
  <App />
</FigmaVarsProvider>
```

**Common SWR Options:**

- `revalidateOnFocus` - Refetch when window regains focus (default: `true`)
- `dedupingInterval` - Deduplication interval in ms (default: `2000`)
- `errorRetryCount` - Max retry attempts (default: `5`)
- `refreshInterval` - Polling interval in ms (default: `0` = disabled)
- `onError` - Global error callback

## 📚 API Cheat Sheet

### Hooks

- **Queries**: `useVariables` (local), `usePublishedVariables` (library/published), `useVariableCollections`, `useVariableModes`, `useFigmaToken`
- **Mutations**: `useCreateVariable`, `useUpdateVariable`, `useDeleteVariable`, `useBulkUpdateVariables`
- **Cache**: `useInvalidateVariables` (invalidate/revalidate cache)

### Utilities

- **Filtering**: `filterVariables` (filter by type, name, etc.)
- **Error Handling**: `isFigmaApiError`, `getErrorStatus`, `getErrorMessage`, `hasErrorStatus`
- **Type Guards**: `isLocalVariablesResponse`, `isPublishedVariablesResponse` (runtime validation)
- **Core helpers**: `fetcher`, `mutator`, constants for endpoints and headers

### Types

- **Responses**: `LocalVariablesResponse`, `PublishedVariablesResponse`
- **Variables**: `FigmaVariable`, `FigmaCollection`, `VariableMode`
- **Mutations**: `BulkUpdatePayload`, `CreateVariablePayload`, `UpdateVariablePayload`
- **Errors**: `FigmaApiError` (extends `Error` with `statusCode`)

## 🔐 Auth & Scope

- Header: `X-FIGMA-TOKEN: <PAT>`
- Scopes: `file_variables:read` for GETs, `file_variables:write` for mutations.
- Enterprise Full seat required for live API; fallback JSON works without a token.

## ⚠️ Enterprise Requirement and Offline Options

- The Figma Variables REST API requires a Figma Enterprise seat for live requests. Without Enterprise, live calls will fail even with a valid PAT.
- The library remains useful without Enterprise: supply `fallbackFile` (object or JSON string) exported from Figma (Dev Mode plugin, CLI, or Figma MCP server output) and all read hooks work offline/for static deployments.
- MCP/other exporters: as long as they emit the same JSON shape as the Variables API, you can feed that JSON into `fallbackFile`; mutations still require Enterprise access.

## 🚫 Do Not Publish Tokens or File Keys

- Never commit PATs or file keys to git, Storybook static builds, or client bundles.
- Use environment variables (`process.env` / `import.meta.env`) and secret managers; keep them server-side where possible.
- Prefer `fallbackFile` with `token={null}`/`fileKey={null}` for demos and public Storybooks.
- Avoid logging tokens or keys; scrub them from error messages and analytics.

## 📈 Rate Limits

- Figma enforces per-token limits. Rely on SWR/TanStack caching, avoid unnecessary refetches, and prefer fallback JSON for static sites.
- Use `swrConfig` to customize `dedupingInterval` and `errorRetryCount` to optimize API usage.
- Handle `429` rate limit errors with `isFigmaApiError` and implement exponential backoff if needed.

## 📚 Storybook & Next.js

- **Storybook decorator**: wrap stories once so hooks have context and tokens.

```tsx
// .storybook/preview.tsx
import { FigmaVarsProvider } from '@figma-vars/hooks'
import type { Preview } from '@storybook/react'

const FIGMA_TOKEN = process.env.STORYBOOK_FIGMA_TOKEN
const FIGMA_FILE_KEY = process.env.STORYBOOK_FIGMA_FILE_KEY

const preview: Preview = {
  decorators: [
    Story => (
      <FigmaVarsProvider
        token={FIGMA_TOKEN}
        fileKey={FIGMA_FILE_KEY}>
        <Story />
      </FigmaVarsProvider>
    ),
  ],
}

export default preview
```

- **Next.js App Router**: provide context in a shared provider file.

```tsx
// app/providers.tsx
import { FigmaVarsProvider } from '@figma-vars/hooks'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <FigmaVarsProvider
      token={process.env.NEXT_PUBLIC_FIGMA_TOKEN}
      fileKey={process.env.NEXT_PUBLIC_FIGMA_FILE_KEY}>
      {children}
    </FigmaVarsProvider>
  )
}
```

## 🧪 Tooling & Quality Gates

- `pnpm run build`, `pnpm test`, `pnpm run test:coverage`
- `pnpm run check:publint`, `pnpm run check:attw`, `pnpm run check:size`

## 🧭 Release Checklist (for 3.0.0)

- Run `pnpm run check:release`
- Tag `v3.0.0` (CI publishes to npm)
- Update dist-tags on npm if needed (`latest` → 3.0.0)

---

## 📝 Contributing

PRs and issues are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📝 License

This project is licensed under the [MIT License](LICENSE).
© 2024–2026 Mark Learst
