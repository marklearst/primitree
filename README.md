# FigmaVars/hooks

<p align="left">
  <img src="assets/figma-vars-tagline-light.png" alt="FigmaVars Logo" width="700px" />
</p>

Built and maintained by Mark Learst.

A fast, typed React 19.2.3 hooks library for the Figma Variables API: fetch, update, and manage design tokens via the official [Figma REST API](https://www.figma.com/developers/api#variables).

Built for the modern web, this library provides a suite of hooks to fetch, manage, and mutate your design tokens, making it easy to sync them between Figma and your React applications, Storybooks, or design system dashboards.

![Status](https://img.shields.io/badge/status-stable-brightgreen)
![CI](https://github.com/marklearst/figma-vars-hooks/actions/workflows/publish.yml/badge.svg)
[![codecov](https://codecov.io/gh/marklearst/figma-vars-hooks/branch/main/graph/badge.svg)](https://codecov.io/gh/marklearst/figma-vars-hooks)
![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/github/license/marklearst/figma-vars-hooks)
![GitHub last commit](https://img.shields.io/github/last-commit/marklearst/figma-vars-hooks)
![GitHub code size](https://img.shields.io/github/languages/code-size/marklearst/figma-vars-hooks)

## 📌 Why 3.0

- Correct HTTP verbs for mutations (create/update/delete/bulk) to match the Figma Variables API.
- Hardened SWR usage (stable keys, `null` to disable, cleaner fallback handling).
- Node 20+ toolchain, strict TypeScript, and ESM-first packaging with CJS interop.

## 🚀 Features at a Glance

- Modern React 19 hooks for variables, collections, modes, and published variables.
- Ergonomic mutation hooks with consistent loading/error states.
- Fallback JSON support (object or string) for offline/static use.
- Typed core entrypoint for non-React consumers (Axios, TanStack Query, server scripts).
- Strict TypeScript + clean exports/attw/publint/size-limit checks.

## 📦 Install

```bash
npm install @figma-vars/hooks
# or
pnpm add @figma-vars/hooks
```

Peer deps: `react` and `react-dom`.

## 🛠️ Quick Start (SWR-powered hooks)

```tsx
import { FigmaVarsProvider, useVariables } from '@figma-vars/hooks'

const FIGMA_TOKEN = import.meta.env.VITE_FIGMA_TOKEN
const FIGMA_FILE_KEY = 'your-file-key'

function App() {
  return (
    <FigmaVarsProvider
      token={FIGMA_TOKEN}
      fileKey={FIGMA_FILE_KEY}>
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

- **Dev Mode / plugin export (recommended)**: Use a Variables exporter plugin in Figma Dev Mode to download the full Variables panel as JSON, save anywhere (e.g., `data/figma-variables.json`), and pass it to `fallbackFile`.
- **REST export script (Enterprise required; repo-only)**: `FIGMA_TOKEN=... node scripts/export-variables.mjs --file-key YOUR_FILE_KEY --out path/to/figma-variables.json`. The helper lives in the repo (not published to npm); clone or copy the script. `--out` accepts any folder/filename, so point it at whatever location your build or Style Dictionary pipeline expects.
- **Desktop MCP (manual/partial)**: Selecting a frame and running `get_variable_defs` returns only that selection’s variables. Use plugin/REST exports for complete coverage.
- **Style Dictionary**: Once you have the JSON (from any path), feed it into Style Dictionary to emit platform-specific artifacts, or import it directly via `fallbackFile`.

## 🔧 Mutation Hooks (verbs fixed)

- `useCreateVariable` → POST via bulk endpoint with `action: 'CREATE'`
- `useUpdateVariable` → PUT via bulk endpoint with `action: 'UPDATE'`
- `useDeleteVariable` → DELETE via bulk endpoint with `action: 'DELETE'`
- `useBulkUpdateVariables` → PUT bulk payload (collections, modes, variables, values)

All return `{ mutate, data, error, isLoading, isSuccess, isError }`.

## 📚 API Cheat Sheet

- Queries: `useVariables` (local), `usePublishedVariables` (library/published), `useVariableCollections`, `useVariableModes`, `useFigmaToken`.
- Core helpers: `fetcher`, `mutator`, `filterVariables`, constants for endpoints and headers.
- Types: `LocalVariablesResponse`, `PublishedVariablesResponse`, `BulkUpdatePayload`, `FigmaVariable`, `FigmaCollection`, `VariableMode`, etc.

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
