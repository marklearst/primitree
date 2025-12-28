# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 3.1.0 (2025-12-27)

### 🐛 Fixed - Critical TypeScript & Runtime Issues

#### **Phase 1: TypeScript Compilation Errors (11 errors fixed)**

- **AbortSignal Type Safety**: Fixed `exactOptionalPropertyTypes` violations in `fetcher.ts` and `mutator.ts` by using conditional spread `...(signal !== undefined && { signal })` instead of passing `signal` directly
- **Type Exports**: Fixed missing type exports for `LocalVariablesResponse` and `PublishedVariablesResponse` - changed imports from `types/contexts` to `types/figma` in `FigmaVarsProvider.tsx`
- **Optional Property Types**: Fixed `providerId` type violations in `swrKeys.ts` and hooks - changed from `providerId?: string` to `providerId: string | undefined` for strict mode compliance
- **FigmaApiError Type**: Fixed `retryAfter` property type - changed from `retryAfter?: number` to `retryAfter: number | undefined` with explicit `?? undefined` assignment

#### **Phase 2: High Priority Runtime Bugs**

- **Race Condition in Mutations**: Fixed critical race condition in `useMutation.ts` when mutations are called concurrently - added `mutationIdRef` counter to ensure only the latest mutation updates state
- **Timeout Cleanup**: Added immediate timeout cleanup after response and in catch blocks in `fetcher.ts` and `mutator.ts` to prevent spurious abort signals
- **Fallback Parsing**: Removed duplicate `JSON.parse()` calls in `useVariables.ts` and `usePublishedVariables.ts` - now uses pre-parsed `parsedFallbackFile` from provider

#### **Phase 3: Test Suite Fixes (8 tests fixed)**

- **SWR Key Format**: Standardized on absolute URLs for consistency - updated `usePublishedVariables.test.tsx` and `useInvalidateVariables.test.tsx` expectations
- **React useId Pattern**: Fixed regex in `useVariables.test.tsx` to match React 19's `:r1:` format instead of numeric-only pattern
- **Mock Context**: Added missing `token` and `fallbackFile` properties to mock context in invalidation tests

### ✨ Added - Runtime Validation & Developer Experience

#### **Phase 4: Runtime Type Guards**

- **Type Guard Utilities**: Added `src/utils/typeGuards.ts` with comprehensive runtime validation functions:
  - `isLocalVariablesResponse()` - validates local variables structure
  - `isPublishedVariablesResponse()` - validates published variables structure
  - `validateFallbackData()` - unified validation with proper typing
- **Development Warnings**: Added `console.warn()` in development mode when fallback validation fails (production-safe)
- **Type Safety**: All type guards include proper TypeScript type predicates for type narrowing

#### **Phase 4: Centralized SWR Key Construction**

- **SWR Key Helpers**: Added `src/utils/swrKeys.ts` with centralized key construction logic:
  - `getVariablesKey()` - constructs local variables SWR cache key
  - `getPublishedVariablesKey()` - constructs published variables SWR cache key
  - `getInvalidationKeys()` - returns all keys for cache invalidation
  - Prevents key mismatches between fetch hooks and invalidation utilities
  - All keys use absolute URLs for consistency and explicitness

#### **Phase 4: New Granular Selector Hooks**

- **useCollectionById**: Get a specific variable collection by ID
- **useModesByCollection**: Get all modes for a specific collection
- **useVariableById**: Get a specific variable by ID
- **Benefits**: Better performance for components that only need specific entities, avoid unnecessary re-renders

### 📚 Documentation

- **Error Boundaries**: Added comprehensive error boundary pattern documentation with `react-error-boundary` example in README
- **Runtime Validation**: Documented type guard usage and fallback file validation in README
- **API Cheat Sheet**: Updated with new type guards, SWR key helpers, and granular selector hooks
- **Testing Coverage**: Added `tests/utils/typeGuards.test.ts` with 14 comprehensive tests covering all edge cases

### 🔧 Changed

- **SWR Cache Keys**: Migrated from relative URLs (`/v1/files/...`) to absolute URLs (`https://api.figma.com/v1/files/...`) for consistency and explicitness
- **Fallback Handling**: Centralized fallback parsing in `FigmaVarsProvider` - all hooks now use pre-parsed data
- **Context Types**: Added explicit `undefined` to `parsedFallbackFile` type in `FigmaTokenContextType`

### 🎯 Migration Guide

**No breaking changes!** All fixes are internal improvements and bug fixes.

**New features are opt-in:**

- Use new granular selector hooks (`useCollectionById`, etc.) for performance optimization
- Use type guards (`validateFallbackData`) when working with custom fallback files
- Import SWR key helpers from `@figma-vars/hooks/utils` if building custom hooks

**What changed automatically:**

- SWR cache keys now use absolute URLs (transparent change, no action needed)
- Better error messages for invalid fallback files (development-only warnings)
- Mutations no longer have race condition issues (automatic fix)

### 🙏 Acknowledgments

This release addresses critical issues identified through community feedback. Special thanks to users who reported issues on X and LinkedIn - your feedback helps make the library more robust.

## 3.0.0 (2025-12-15)

### ✨ Added

- **SWR Configuration Support**: Added `swrConfig` prop to `FigmaVarsProvider` for global SWR customization (revalidation, deduplication, error retry, etc.)
- **Error Handling Utilities**: New type-safe error helpers (`isFigmaApiError`, `getErrorStatus`, `getErrorMessage`, `hasErrorStatus`) for better error differentiation
- **Cache Invalidation Helper**: New `useInvalidateVariables` hook for easy cache management after mutations (`invalidate` and `revalidate` functions)
- **FigmaApiError Class**: Custom error class extending `Error` with HTTP `statusCode` property for better error handling
- **Export CLI Tool**: Added `figma-vars-export` CLI command for automatically exporting variables to JSON via REST API. Available after installing the package (`figma-vars-export`) or via `npx` (`npx figma-vars-export`). Includes `--help` flag, supports `--file-key` and `--out` options, and accepts `FIGMA_TOKEN`/`FIGMA_PAT` and `FIGMA_FILE_KEY` environment variables. Perfect for CI/CD pipelines and build scripts. **Note:** Requires Figma Enterprise account for REST API access. See README CLI Export Tool section for usage examples and alternative export methods.

### 🔧 Changed

- **React 19.2 Compatibility**: Optimized `useMutation` hook to use `useRef` for stable function references, preventing unnecessary re-renders
- **Memory Leak Prevention**: Added cleanup handling in `useMutation` to prevent state updates after component unmount
- **Type Safety**: Removed all unsafe `as unknown as` type assertions throughout the codebase
- **Mutator Function**: Improved `mutator` function signature with proper types (`BulkUpdatePayload` and compatible objects)
- **Error Handling**: Enhanced `fetcher` and `mutator` to throw `FigmaApiError` with HTTP status codes instead of generic `Error`
- **Error Response Parsing**: Added Content-Type header checking before attempting JSON parsing in error responses
- **SWR Cache Keys**: Fixed potential cache collision risks by generating unique provider IDs per `FigmaVarsProvider` instance

### 🐛 Fixed

- **SWR Key Stability**: Fixed fallback cache keys to include unique provider IDs, preventing collisions when multiple providers exist
- **Error Status Codes**: Errors now preserve HTTP status codes, enabling proper handling of 401, 403, 404, 429, etc.
- **Type Assertions**: Removed unsafe type casts in mutation hooks (`useCreateVariable`, `useUpdateVariable`, `useDeleteVariable`, `useBulkUpdateVariables`)
- **Unused Constants**: Removed unused endpoint constants (`FIGMA_POST_VARIABLES_ENDPOINT`, `FIGMA_VARIABLE_BY_ID_ENDPOINT`, `FIGMA_VARIABLES_ENDPOINT`)

### 📚 Documentation

- Added comprehensive error handling guide with status code examples
- Added cache management section with `useInvalidateVariables` examples
- Added SWR configuration guide with common options and use cases
- Updated API cheat sheet with new hooks and utilities
- Enhanced Quick Start example with `swrConfig` usage
- Documented export options (Dev Mode JSON, REST script, MCP snapshots)
- Clarified Figma Enterprise requirements and fallback expectations

### 🔄 Migration Guide

**No breaking changes!** All changes are backward compatible. Existing code continues to work without modification.

**New features are opt-in:**

- Add `swrConfig` prop to `FigmaVarsProvider` to customize SWR behavior
- Use error utilities (`isFigmaApiError`, etc.) for better error handling
- Use `useInvalidateVariables` hook for cache management after mutations

### 🎯 Why 3.0.0?

This major release focuses on **developer experience improvements**:

- Better error handling with type-safe utilities and status codes
- Flexible SWR configuration for optimizing API usage
- Easy cache management after mutations
- React 19.2 compatibility and performance optimizations
- Improved type safety throughout the codebase

All improvements are additive and maintain full backward compatibility.

## 2.0.0-beta.2 (2025-01-XX)

### ✨ Added

- **fallbackFile**: Added support for local JSON files exported from Figma Dev Mode plugins, enabling users without Figma Enterprise accounts to use the library
- **offline support**: Implemented fallback mechanism in `useVariables` hook to use local JSON data instead of API requests
- **docs**: Added comprehensive documentation for the new fallbackFile feature including setup instructions and usage examples
- **enterprise bypass**: Users can now work with Figma variables without requiring Enterprise account access

### 🔧 Changed

- **useVariables**: Enhanced to support fallbackFile prop from FigmaVarsProvider context
- **FigmaVarsProvider**: Added fallbackFile prop documentation and type definitions
- **README**: Added new "Local JSON Support" feature highlight and detailed setup guide

### 📋 Planned

- **Style Dictionary Integration**: Future beta releases will include seamless integration with Amazon's Style Dictionary for multi-platform design token distribution

## 1.5.1 (2025-07-16)

### Fixed

- **docs**: Improved README formatting for Architecture Highlights section

## 1.5.0 (2025-07-16)

### Fixed

- **build**: Fixed critical package build and module resolution issues that prevented package installation and imports
- **build**: Configured Vite to generate correct output files (`index.js`, `index.mjs`, `index.d.ts`) matching package.json exports
- **build**: Fixed vite-plugin-dts configuration to properly output TypeScript declarations to dist/ directory
- **build**: Added dual package support for both ES modules and CommonJS with correct file naming
- **build**: Added prepublishOnly script to ensure package is always built before publishing

### Changed

- **build**: Updated Vite fileName configuration to use dynamic format-based naming
- **build**: Improved TypeScript declaration generation with proper include/exclude patterns

**Breaking Change**: None - this is a critical bug fix that makes the package functional without changing the API

## 1.4.5 (2024-12-19)

### Added

- **docs**: Added comprehensive Architecture Highlights section to README showcasing 100% test coverage and development practices
- **docs**: Added 100% test coverage badge to README for improved project credibility
- **testing**: Added final test coverage for `src/api/index.ts` barrel file exports

### Changed

- **docs**: Updated Architecture Highlights to use accurate descriptions (changed "Framework Agnostic" to "React Ecosystem" and "Zero Runtime Dependencies" to "Minimal Dependencies")
- **docs**: Refined error handling description from "Robust Error Handling" to "Consistent Error Handling" for accuracy

### Chores

- **ci**: Achieved complete 100% test coverage across all 78 tests for optimal Codecov reporting

## 1.4.4 (2024-12-19)

### Bug Fixes

- **testing**: Added comprehensive test coverage for all barrel files and utility functions to achieve 100% code coverage on Codecov
- **testing**: Fixed uncaught error handling in `useFigmaToken` test by implementing proper console error suppression
- **testing**: Added tests for `useFigmaToken`, `filterVariables`, and all barrel export files (`src/hooks/index.ts`, `src/utils/index.ts`, `src/contexts/index.ts`, `src/index.ts`)
- **testing**: Added test coverage for `wallaby.js` configuration file

### Chores

- **ci**: Improved test coverage reporting to ensure all export statements and utility functions are properly covered for continuous integration

## 1.4.1 (2024-07-26)

### Bug Fixes

- **build**: Resolved a critical build failure by disabling `rollupTypes` in the d.ts plugin configuration, ensuring stable declaration file generation. (`fa941b1`)
- **hooks**: Corrected the return type of `useVariables` to prevent build errors and ensure type consistency. (`c47afa1`)
- **hooks**: Aligned all API-calling hooks (`useCreateVariable`, `useBulkUpdateVariables`, etc.) to use the new, robust `mutator` function signature. (`598db4c`)
- **testing**: Resolved all outstanding test failures and achieved 100% test coverage for all mutation hooks and utilities. (`8bd21ea`)

### Chores

- **docs**: Removed outdated `docs` and `docs-site` directories to clean up the repository. (`c47afa1`)

## 1.4.0 (2024-07-26)

### Features

- Added barrel file for easy hook imports (`cb00ed8`)

### Bug Fixes

- **mutations**: Corrected mutation logic and resolved all test failures to ensure API calls are robust and fully tested. (`8bbf4c5`)
- **testing**: Achieved 100% test coverage for the API mutator, ensuring all edge cases are handled. (`8bd21ea`)
- **tooling**: Resolved critical build and test environment issues, enabling a stable development and CI workflow. (`8cbddbb`)
- **useMutation**: Corrected types and migrated hook to TSDoc for improved type safety and documentation. (`f19fc33`)

### Documentation

- Migrated all hooks and types from JSDoc to TSDoc for better developer experience and type clarity.
- Simplified public API exports for cleaner package entry. (`c42c2a4`)

## 1.3.0 (2024-07-22)

### Features

- **API**: Added low-level `mutator` utility for authenticated Figma API calls.

## [Unreleased]

## [1.3.3] - 2025-06-22

### ✨ Added

- **branding**: Added new logo assets (`assets/figma-vars-tagline-light.png`) and updated README to feature the new branding at the top of the page
- **docs**: Improved visual identity and documentation clarity with prominent project logo

## [1.3.2] - 2025-06-22

### 🔧 Fixed

- **build**: Implement proper path alias resolution using `vite-tsconfig-paths` plugin
- **refactor**: Revert all internal imports from relative paths (`./`) to clean bare imports (`contexts/`, `hooks/`, etc.)
- **ci**: Ensure consistent build behavior across local and CI environments
- **docs**: Clean up code formatting and documentation examples throughout codebase

### 🧹 Housekeeping

- **config**: Replace manual alias configuration with `vite-tsconfig-paths` plugin in `vite.config.ts`
- **imports**: Update all 15+ files to use path aliases consistently with `tsconfig.json` configuration
- **maintenance**: Achieve zero relative imports in `src` directory for cleaner, more maintainable code

## [1.3.1] - 2025-06-22

### 🔧 Fixed

- **build**: Resolve Vite/Rollup path alias resolution errors causing CI build failures
- **ci**: Fix GitHub Actions build issues with import resolution in Linux environment
- **imports**: Convert problematic bare imports to relative imports as temporary workaround
- **test**: Configure Vitest setup with proper `@testing-library/jest-dom` integration

### 🧹 Housekeeping

- **ci**: Add debug steps to GitHub Actions workflow for better troubleshooting
- **config**: Consolidate test configuration in `vite.config.ts` and remove separate `vitest.config.ts`
- **deps**: Ensure proper Vitest and testing library dependency alignment

## [1.2.0] - 2024-08-02

### 🧹 Housekeeping

- **docs**: Add comprehensive JSDoc comments to all public APIs, including hooks, mutations, and types.
- **docs**: Update `CHANGELOG.md` to include detailed notes for the v1.1.0 release.
- **refactor**: Rename `fetchHelpers.ts` to `fetcher.ts` for clarity and consistency.
- **fix**: Resolve multiple TypeScript errors related to incorrect exports and unused imports.

## [1.1.1] - 2024-08-01

- _This version was primarily a documentation and maintenance release. All changes from this version have been consolidated into the changelog for `v1.1.0` and the current `[Unreleased]` section._

## [1.1.0] - 2024-08-01

This release marks a major architectural overhaul, significantly improving the library's flexibility, performance, and developer experience.

### ✨ Features & Enhancements

- **Token-Agnostic Authentication**: Implemented a new provider-based system (`FigmaVarsProvider`) that decouples the library from any specific token management strategy.
- **Automated Release Process**: Added a `postversion` script to automatically push new tags and commits, streamlining the npm publish workflow.
- **Modernized Data Fetching**: Replaced manual `fetch` calls with `swr` for efficient, cached data fetching in all core hooks.
- **Bulk Update Variables**: Added a `useBulkUpdateVariables` hook for performing atomic updates on multiple variables at once.
- **TypeScript Path Aliases**: Configured and applied non-relative path aliases for cleaner, more maintainable imports.

### 🐛 Bug Fixes

- **CI Publishing**: Resolved an `ERR_PNPM_GIT_UNCLEAN` error by adding the `--no-git-checks` flag to the publish command.
- **Build Failures**: Fixed JSX-related build errors by adding the `jsx` flag to `tsconfig.json`.

### 🧹 Housekeeping

- **Removed Dead Code**: Deleted several unused experimental hooks, mutation utilities, and the old manual cache implementation.

## [1.0.10] - 2024-07-31

- fix(ci): add --no-git-checks flag to publish command to resolve git unclean error
- feat(release): add postversion script to automate git push and tag
