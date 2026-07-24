# Contributing to FigmaVars

Thank you for your interest in contributing! We welcome pull requests, bug reports, and suggestions.

## Code of Conduct

Please be respectful and inclusive. Harassment, discrimination, or inappropriate language will not be tolerated.

## Repository layout

This is a pnpm + Turborepo monorepo:

| Path              | Package                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `packages/core`   | `@figmavars/core` — normalizer, alias resolution, diffing, REST client |
| `packages/dtcg`   | `@figmavars/dtcg` — Figma JSON → DTCG 2025.10 + Resolver, emitters     |
| `packages/cli`    | `@figmavars/cli` — `figma-vars build/diff/check/init/export`           |
| `packages/hooks`  | `@figmavars/hooks` — React hooks (local tokens + live API)             |
| `packages/mcp`    | `@figmavars/mcp` — MCP server for AI agents                            |
| `apps/playground` | Client-side playground app                                             |

## Getting started

Source development uses Node 24.18.0 and pnpm 11.10.0 (`corepack enable` picks
the pinned pnpm version). The public packages require Node >=24.0.0, matching
the runtime floor enforced by their manifests and release tests.

```bash
pnpm install
pnpm build          # turbo build across all packages (order-aware)
pnpm test           # all test suites
pnpm lint           # biome format
```

Work on a single package:

```bash
pnpm --filter @figmavars/dtcg test:watch
pnpm --filter figmavars-playground dev
```

## Making changes

- Follow the existing code style (Biome/Prettier are wired into pre-commit).
- Add or update tests — every package has a `tests/` folder; the dtcg package uses golden files (`UPDATE_GOLDENS=1 pnpm --filter @figmavars/dtcg test` to refresh them intentionally).
- Update the relevant package README for user-facing changes, and `packages/hooks/CHANGELOG.md` for anything released.

## Commit and PR guidelines

- Use conventional commits (`fix:`, `feat:`, `docs:`, `refactor:`, with an optional package scope like `feat(dtcg):`).
- Open pull requests against `main`; CI must pass (build, tests, coverage, publint/attw/size for hooks).

## Releasing

Maintainers must follow the [release runbook](docs/releasing.md). It is the
single source of truth for local preflight, external npm and GitHub steps, and
partial-publication recovery.

## Bug reports & feature requests

Use GitHub Issues, with as much detail as possible (steps, exports that reproduce it — scrub anything confidential first).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
