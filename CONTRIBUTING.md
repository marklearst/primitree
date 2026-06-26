# Contributing to FigmaVars

Open an issue for a bug or proposal. Send a pull request when the change is
ready for review.

## Code of Conduct

Treat other contributors with respect. Harassment, discrimination, and abusive
language are not accepted here.

## Repository layout

This is a pnpm + Turborepo monorepo:

| Path                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `packages/core`          | `@figmavars/core`: REST client, types, normalization, and diffs       |
| `packages/dtcg`          | `@figmavars/dtcg`: DTCG 2025.10 conversion, Resolver, and emitters    |
| `packages/cli`           | `@figmavars/cli`: `build`, `diff`, `check`, `init`, and `export`      |
| `packages/hooks`         | `@figmavars/hooks`: React hooks for token files and the live REST API |
| `packages/mcp`           | `@figmavars/mcp`: MCP tools for token files                           |
| `apps/docs`              | Documentation site                                                    |
| `apps/figma-plugin`      | Figma plugin                                                          |
| `apps/playground`        | Browser playground                                                    |
| `packages/plugin-export` | Shared Figma plugin export code                                       |

## Getting started

Source development uses Node 24.18.0 and pnpm 11.10.0 (`corepack enable` picks
the pinned pnpm version). The public packages require Node >=24.0.0, matching
the runtime floor enforced by their manifests and release tests.

```bash
pnpm install
pnpm build          # build all workspaces in dependency order
pnpm test           # all test suites
pnpm lint           # Biome checks
```

Work on a single package:

```bash
pnpm --filter @figmavars/dtcg test:watch
pnpm --filter figmavars-playground dev
```

## Making changes

- Follow the existing code style. Biome and Prettier run in the commit checks.
- Add or update tests. Each package has a `tests/` folder. To refresh the DTCG
  golden files, run
  `UPDATE_GOLDENS=1 pnpm --filter @figmavars/dtcg test` and review the diff.
- Update the affected package README and CHANGELOG for a public change.

## Commit and PR guidelines

- Use conventional commits (`fix:`, `feat:`, `docs:`, `refactor:`, with an optional package scope like `feat(dtcg):`).
- Open pull requests against `main`; CI must pass (build, tests, coverage, publint/attw/size for hooks).

## Releasing

Maintainers must follow the [release runbook](docs/releasing.md). It is the
required checklist for local checks, npm and GitHub setup, publishing, and
partial-publication recovery.

## Bug reports and feature requests

Use GitHub Issues. Include the steps and a small export that reproduces the
problem. Remove confidential values first.

## License

By contributing, you license your work under the MIT License.
