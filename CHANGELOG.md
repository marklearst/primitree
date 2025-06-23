# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.4.5 (2024-12-19)

### Added

- **docs**: Added comprehensive Architecture Highlights section to README showcasing 100% test coverage and development practices
- **docs**: Added 100% test coverage badge to README for improved project credibility
- **testing**: Added final test coverage for `src/api/index.ts` barrel file exports

### Changed

- **docs**: Updated Architecture Highlights to use accurate descriptions (changed "Framework Agnostic" to "React Ecosystem" and "Zero Runtime Dependencies" to "Minimal Dependencies")
- **docs**: Refined error handling description from "Robust Error Handling" to "Consistent Error Handling" for accuracy

### Chores

- **ci**: Achieved complete 100% test coverage across all 76 tests for optimal Codecov reporting

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
