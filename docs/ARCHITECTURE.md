# Project Architecture: @figma-vars/hooks

## Overview

This library provides typed React hooks and utilities for managing Figma Variables, tokens, modes, and bindings via the Figma API. The architecture is designed for strict type safety, modularity, and easy integration with modern React, Vite, and testing workflows.

---

## Directory Structure

- **src/** – Main source code

  - **api/** – Figma API request logic
  - **constants/** – Project-wide constants
  - **contexts/** – React context providers and definitions
  - **hooks/** – Core and advanced React hooks for Figma Variables
  - **mutations/** – Functions and hooks for creating/updating/deleting variables
  - **experimental/** – Opt-in, unstable, or advanced features
  - **types/** – All TypeScript types, organized by domain
  - **utils/** – Utility functions
  - **index.ts** – Main entry point for library exports

- **tests/** – Unit and integration tests (Vitest), with mocks and setup helpers
- **docs/** – Documentation and architecture guides
- **.github/** – GitHub Actions workflows for CI/CD and npm publish

---

## Path Aliases (TypeScript/Vite/Vitest)

- All source folders under `src/` are aliased for absolute imports (e.g., `hooks/useVariables`)
- See `tsconfig.json` for current aliases

---

## Key Patterns

- **Strict TypeScript:** All logic is strictly typed, with types separated by domain.
- **Absolute Imports:** Enabled via `baseUrl` and `paths` in `tsconfig.json`, with `vite-tsconfig-paths` for Vite/Vitest compatibility.
- **Composable Hooks:** Hooks are modular, composable, and follow React's best practices.
- **Testing:** Vitest and Testing Library are used for unit and integration tests. Path aliases work in tests.
- **CI/CD:** Automated publish via GitHub Actions and pnpm.

---

## Contributing

- Follow the guidelines in `CONTRIBUTING.md`.
- Use absolute imports for all internal modules.
- Add new types to the appropriate file in `src/types/`.
- Place new hooks in `src/hooks/` or `src/experimental/` as appropriate.
- Write or update tests in `tests/`.

---

## Future Improvements

- Expand test coverage for all hooks and utilities
- Add more advanced/experimental features
- Improve documentation and usage examples
- Support more Figma API endpoints as needed
