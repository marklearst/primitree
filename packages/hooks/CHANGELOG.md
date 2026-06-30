# Changelog

npm records 24 published versions of the legacy `@figma-vars/hooks` package.
Each published section uses its UTC timestamp from the public registry.
Published entries appear in reverse registry order.

## 1.0.0 (Unreleased)

Version 1 moves the React package to `@primitree/hooks` and releases it with
the other Primitree packages.

### Added

- `TokensProvider` for DTCG documents and Resolver output from `primitree build`.
- `useToken` for one token, its resolved value, CSS value, and `var()` accessor.
- `useTokens` for flattened tokens under active contexts.
- `useTheme` for reading and changing Resolver contexts.

### Changed

- Shared non-React code moved to `@primitree/core`.
- `@primitree/hooks/core` re-exports `@primitree/core` for compatibility.
- Package declarations ship as bundled root and `core` entry files.
- The package requires Node.js 24 or newer, React `^19.0.0`, and SWR `^2.3.7`.
- The toolchain uses Vite 8, Vitest 4, TypeScript 6, and Biome 2.

### Unpublished work after 4.0.0

Older changelog drafts labeled work as 4.1.1 and 4.2.0. Those versions did not
reach npm. Version 1.0.0 includes that work:

- Root exports for `withRetry`, `redactToken`, rate-limit helpers, runtime guards, selector hooks, `useFigmaToken`, and `useFigmaTokenContext`.
- Fallback cache keys activate after the provider validates fallback data.
- Live requests continue when credentials exist and fallback validation fails.
- Version 1 removes stale TypeScript path aliases and the unused package documentation directory field.

### Migration from `@figma-vars/hooks` 4.0.0

1. Replace `@figma-vars/hooks` with `@primitree/hooks` in dependencies and imports.
2. Replace `@figma-vars/hooks/core` with `@primitree/hooks/core` or `@primitree/core`.
3. Replace undocumented `dist` imports with a public package entry.
4. Move to Node.js 24, React `^19.0.0`, and SWR `^2.3.7`.

The `figma-vars-export` command remains in this package. New token projects can
use `figma-vars export` from `@primitree/cli`.

Read the [migration guide](https://primitree.com/docs/hooks/migration).

The legacy `@figma-vars/hooks` npm history ends at version 4.0.0.

## 4.0.0

_npm registry timestamp: `2025-12-30T01:31:20.546Z`._

### Changed

- `useFigmaToken` changed from a default export to a named export.
- Vitest coverage comments replaced Istanbul coverage comments.

```tsx
import { useFigmaToken } from '@figma-vars/hooks'
```

### Added

- `withRetry` with retry limits, backoff settings, rate-limit filtering, and an `onRetry` callback.
- `redactToken` for shortening token values before display.
- A `baseUrl` option for `fetcher` and `mutator`.
- A `caseInsensitive` option for `filterVariables`.
- Mutation return-value documentation for `throwOnError`.

### Fixed

- Fallback data uses fallback-specific SWR keys when credentials are present.
- API error parsing handles JSON, text, and HTML responses.

## 3.1.1

_npm registry timestamp: `2025-12-28T05:51:35.893Z`._

- Updated documentation files.

## 3.1.0

_npm registry timestamp: `2025-12-28T05:43:54.622Z`._

### Added

- Runtime guards for local and published variables responses.
- Shared SWR key builders for variable queries and invalidation.
- `useVariableById`, `useCollectionById`, and `useModesByCollection`.
- Tests for the runtime guards and selector hooks.

### Fixed

- Fetch and mutation code handles optional abort signals under `exactOptionalPropertyTypes`.
- Type exports use the Figma type module.
- Mutation state ignores results from older overlapping requests.
- Fetch and mutation timeouts clear after a response or error.
- Fallback JSON parsing runs in the provider.
- Query and invalidation tests use the same absolute API URLs.

## 3.0.0

_npm registry timestamp: `2025-12-15T19:43:48.064Z`._

### Added

- An `swrConfig` prop on `FigmaVariablesProvider`.
- `FigmaApiError` and helpers for error status and messages.
- `useInvalidateVariables` for query cache refresh.
- The `figma-vars-export` command.

### Changed

- `useMutation` keeps its function reference in a ref.
- Fetch and mutation errors retain HTTP status codes.
- Each provider receives an ID for SWR fallback keys.

### Fixed

- Mutation state ignores updates after component unmount.
- Provider instances use separate fallback cache keys.
- API error parsing checks the response content type.

## 2.0.0-beta.3

_npm registry timestamp: `2025-08-27T17:54:54.590Z`._

The repository has no version-specific notes for this release.

## 2.0.0-beta.2

_npm registry timestamp: `2025-08-27T17:08:56.297Z`._

### Added

- `fallbackFile` support in `FigmaVariablesProvider` and `useVariables`.
- Documentation for reading a local Figma variables export without the REST API.

## 2.0.0-beta.1

_npm registry timestamp: `2025-08-27T16:53:00.598Z`._

The repository has no version-specific notes for this release.

## 3.0.0-beta.1

_npm registry timestamp: `2025-08-27T16:50:32.767Z`._

The repository has no version-specific notes for this release.

## 1.5.1

_npm registry timestamp: `2025-07-17T00:30:58.175Z`._

- Updated the README architecture section.

## 1.5.0

_npm registry timestamp: `2025-07-17T00:22:18.534Z`._

### Fixed

- Package builds write the module files named in `package.json`.
- Type declaration output uses the package `dist` directory.
- Package publication runs a build first.

### Changed

- Vite selects output names by module format.

## 1.4.5

_npm registry timestamp: `2025-06-23T02:34:09.452Z`._

- Added a README architecture section and coverage badge.
- Added tests for the `src/api` entry file.

## 1.4.4

_npm registry timestamp: `2025-06-23T02:24:36.588Z`._

- Added tests for entry files, `useFigmaToken`, and `filterVariables`.
- Suppressed the expected console error in the `useFigmaToken` test.
- Added the Wallaby configuration to coverage.

## 1.4.3

_npm registry timestamp: `2025-06-23T01:34:51.415Z`._

The repository has no version-specific notes for this release.

## 1.3.3

_npm registry timestamp: `2025-06-22T08:04:34.546Z`._

- Added the `assets/figma-vars-tagline-light.png` brand image to the README.

## 1.3.2

_npm registry timestamp: `2025-06-22T06:57:08.037Z`._

- Added `vite-tsconfig-paths` for source path aliases.
- Restored source imports that use the configured aliases.

## 1.3.1

_npm registry timestamp: `2025-06-22T06:40:12.835Z`._

- Changed source imports while resolving Vite and Rollup alias failures.
- Added Testing Library setup to the Vite test configuration.

## 1.2.0

_npm registry timestamp: `2025-06-20T16:32:57.206Z`._

- Added TSDoc comments to public APIs.
- Renamed `fetchHelpers.ts` to `fetcher.ts`.
- Updated public exports and fixed TypeScript errors.

## 1.1.1

_npm registry timestamp: `2025-06-20T00:40:24.431Z`._

- Consolidated this release's documentation and maintenance notes into 1.1.0.

## 1.1.0

_npm registry timestamp: `2025-06-20T00:38:26.908Z`._

### Added

- Provider-based token and file-key context.
- SWR data fetching for query hooks.
- `useBulkUpdateVariables`.
- TypeScript path aliases.

### Changed

- Removed unused experimental hooks, mutation functions, and the prior cache.
- Added `--no-git-checks` to the npm publish command used at the time.

## 1.0.10

_npm registry timestamp: `2025-06-19T22:59:12.843Z`._

- Added `--no-git-checks` to the npm publish command used at the time.
- Added a post-version script for tag and commit pushes.

## 1.0.9

_npm registry timestamp: `2025-06-19T22:56:58.868Z`._

The repository has no version-specific notes for this release.

## 1.0.8

_npm registry timestamp: `2025-06-19T22:24:48.948Z`._

The repository has no version-specific notes for this release.

## 1.0.5

_npm registry timestamp: `2025-06-19T22:14:26.440Z`._

The repository has no version-specific notes for this release.

## 1.0.3

_npm registry timestamp: `2025-06-19T22:10:25.811Z`._

The repository has no version-specific notes for this release.

## Historical unpublished drafts

npm has no releases for 1.3.0, 1.4.0, or 1.4.1. The repository's earlier
changelog contains these notes.

### Draft 1.4.1 (unpublished)

- Disabled declaration rollup to fix package builds.
- Corrected the `useVariables` return type.
- Updated mutation hooks to use the `mutator` signature.
- Removed old documentation directories.

### Draft 1.4.0 (unpublished)

#### Added

- A hook entry file.

#### Fixed

- Mutation behavior and tests.
- Build and test import resolution.
- `useMutation` types and TSDoc.

### Draft 1.3.0 (unpublished)

- Added the low-level `mutator` function for authenticated Figma API calls.
