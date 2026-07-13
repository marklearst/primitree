# CLI and Documentation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `figma-vars init` safe in existing directories and make every maintained CLI/example document describe the behavior users actually receive.

**Architecture:** The init command computes an in-memory scaffold and its complete owned destination set before touching disk. CLI help constants remain the canonical option inventory, and a package test reads maintained MDX/README files to prevent obsolete flags, namespace forms, and argument order from returning.

**Tech Stack:** TypeScript 6, Node.js filesystem APIs, Vitest 4, MDX/Fumadocs, Next.js 16, pnpm 11.

## Global Constraints

- The binary remains `figma-vars`; package imports use `@figmavars/*`.
- `init` always builds the first pipeline and has no `--build` flag.
- `diff` emits Markdown by default and supports `--json` and `--out`; it has no `--markdown` flag.
- `init --force` may replace scaffold-owned files only and never deletes unrelated content.
- Without `--force`, any owned-path collision causes zero writes and reports every collision.
- Migration/changelog references to the legacy namespace remain intentional and are excluded from parity scans.
- Browser clients must not be taught to bundle personal access tokens.
- No merge, push, tag, npm publication, deployment, or external npm/GitHub mutation.
- No new dependency or public package.

---

### Task 1: Atomic init preflight and explicit force

**Files:**

- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/tests/commands.test.ts`
- Modify: `packages/cli/README.md`

**Interfaces:**

- Consumes: parsed `--from`, `--name`, and `--force` flags.
- Produces: one complete scaffold-owned path set and an all-collisions refusal before the first write.

- [ ] **Step 1: Write failing collision and force tests**

Add three `figma-vars init` cases to `commands.test.ts`:

```ts
it('reports every owned collision and writes nothing', async () => {
  const repo = path.join(tmpDir, 'occupied')
  await fs.mkdir(path.join(repo, '.github', 'workflows'), { recursive: true })
  await fs.writeFile(path.join(repo, 'package.json'), 'package sentinel')
  await fs.writeFile(
    path.join(repo, '.github', 'workflows', 'design-tokens.yml'),
    'workflow sentinel'
  )

  await expect(runInit(parseArgs([repo]))).rejects.toThrow(
    /package\.json[\s\S]*\.github\/workflows\/design-tokens\.yml/
  )
  await expect(readOut('occupied', 'package.json')).resolves.toBe('package sentinel')
  await expect(readOut('occupied', '.github', 'workflows', 'design-tokens.yml')).resolves.toBe(
    'workflow sentinel'
  )
  await expect(fs.stat(path.join(repo, 'variables.json'))).rejects.toThrow()
})

it('force replaces owned paths and preserves unrelated files', async () => {
  const repo = path.join(tmpDir, 'forced')
  await fs.mkdir(repo, { recursive: true })
  await fs.writeFile(path.join(repo, 'package.json'), 'old')
  await fs.writeFile(path.join(repo, 'notes.txt'), 'keep me')

  await runInit(parseArgs([repo, '--force']))

  expect(JSON.parse(await readOut('forced', 'package.json')).private).toBe(true)
  await expect(readOut('forced', 'notes.txt')).resolves.toBe('keep me')
})

it('initializes a non-empty directory when no owned path collides', async () => {
  const repo = path.join(tmpDir, 'notes-only')
  await fs.mkdir(repo, { recursive: true })
  await fs.writeFile(path.join(repo, 'notes.txt'), 'keep me')
  await runInit(parseArgs([repo]))
  await expect(readOut('notes-only', 'variables.json')).resolves.toContain('variableCollections')
})
```

Add three filesystem-safety cases. With `tokens` as a regular file, even
`--force` must report the non-directory ancestor and leave `variables.json`
absent. On non-Windows platforms, make `tokens` a symlink to an outside
directory and assert `--force` rejects it without writing through the link.
Also make the owned leaf `README.md` a symlink to an outside sentinel, run
`--force`, and assert the symlink itself is replaced by the generated README
while the outside sentinel is unchanged. Use `fs.lstat` in assertions so a
dangling link cannot look absent.

Extend the existing scaffold test to assert its generated README's workflow and diff argument order.

- [ ] **Step 2: Run the focused test and record RED**

```bash
pnpm --filter @figmavars/cli exec vitest run tests/commands.test.ts
```

Expected: only `variables.json` is preflighted and `--force` is ignored.

- [ ] **Step 3: Compute the scaffold and all owned destinations in memory**

Import `getBooleanFlag` and remove `fileExists` from this command. Before
`fs.mkdir`, `fs.unlink`, or any write, compute the pipeline, required workflow,
and complete owned path list:

```ts
const force = getBooleanFlag(args.flags, 'force')
const pipeline = buildPipeline(variables, {
  resolverName: name,
  githubAction: false,
  readme: false,
})
const workflow = buildPipeline(variables, { resolverName: name }).files.find(
  file => file.path === 'design-tokens.workflow.yml'
)
if (!workflow) {
  throw new Error('Generated pipeline did not include design-tokens.workflow.yml')
}
const ownedRelativePaths = [
  'variables.json',
  ...pipeline.files.map(file => file.path),
  'package.json',
  '.gitignore',
  'README.md',
  '.github/workflows/design-tokens.yml',
  'backup/variables.json',
]
```

Implement a local `lstatIfPresent` that returns `undefined` only for `ENOENT`
and rethrows every other filesystem error. Inspect `dir` itself and every
ancestor/leaf of every owned path before mutation:

- reject `dir` when it is a symlink or non-directory;
- require `path.resolve(dir, relativePath)` to remain inside `dir`;
- reject every present ancestor that is a symlink or non-directory, even with
  `--force`;
- record every present leaf as a collision;
- reject a leaf directory because replacing it could delete unrelated data;
- record owned leaf symlinks for unlinking only after the complete preflight
  succeeds and only when `--force` is set.

Keep findings in owned-path order and include `relativePath` plus its reason in
one error. If unsafe findings exist, always throw. If `!force` and any safe leaf
collision exists, throw. Include both unsafe findings and safe collisions in
the diagnostic, but offer `--force` only when every finding is a replaceable
owned leaf. Build the diagnostic as:

```ts
const canForce = unsafeFindings.length === 0
throw new Error(
  `${canForce ? 'Refusing to overwrite' : 'Unsafe'} scaffold-owned paths:\n${findings
    .map(({ relativePath, reason }) => `- ${relativePath}: ${reason}`)
    .join('\n')}\n${
    canForce
      ? 'Re-run with --force to replace only generated file paths.'
      : 'Resolve unsafe path types before retrying; --force cannot bypass them.'
  }`
)
```

Only after those branches may `--force` unlink recorded leaf symlinks, create
directories, and write variables, pipeline files, repo files, workflow, and
backup. Regular owned files are replaced by `fs.writeFile`; unrelated paths
are untouched.

- [ ] **Step 4: Document the flag in command help and package README**

Add to `initHelp`:

```text
--force                   Replace scaffold-owned files; preserve unrelated files
```

State that init always builds the initial pipeline.
In the CLI README's `figma-vars init` subsection, change the signature to
`figma-vars init [dir] [--from variables.json] [--name name] [--force]` and add
one sentence defining `--force` as replacement of generated files only.

- [ ] **Step 5: Verify GREEN and package integrity**

```bash
pnpm --filter @figmavars/cli exec vitest run tests/commands.test.ts
pnpm --filter @figmavars/cli typecheck
pnpm --filter @figmavars/cli test
pnpm --filter @figmavars/cli build
```

Expected: refusal is atomic, force is scoped, and all CLI gates pass.

- [ ] **Step 6: Commit the task**

```bash
git add packages/cli/src/commands/init.ts packages/cli/tests/commands.test.ts packages/cli/README.md
git commit -m "fix(cli): preflight every init destination"
```

### Task 2: Correct maintained docs and examples

**Files:**

- Modify: `apps/docs/content/docs/cli/init.mdx`
- Modify: `apps/docs/content/docs/cli/diff.mdx`
- Modify: `apps/docs/content/docs/cli/export.mdx`
- Modify: `apps/docs/content/docs/concepts/diffing.mdx`
- Modify: `apps/docs/content/docs/cli/index.mdx`
- Modify: `apps/docs/content/docs/cli/check.mdx`
- Modify: `apps/docs/content/docs/cli/build.mdx`
- Modify: `apps/docs/content/docs/getting-started/pipeline-output.mdx`
- Modify: `apps/docs/content/docs/hooks/live-api.mdx`
- Modify: `packages/hooks/README.md`
- Modify: `apps/docs/README.md`
- Modify: `docs/launch/announcement.md`

**Interfaces:**

- Consumes: exported command help, `BuildPipelineResult`, generated `tokenVars`/`tokenValues`, and hook/core public exports.
- Produces: examples that compile conceptually and describe only implemented behavior.

- [ ] **Step 1: Make the CLI pages match their help contracts**

Apply these exact corrections:

- `cli/init.mdx`: remove `--build`; add `--name <name>` and `--force`; state the pipeline is generated during init; do not show `init . --from ./variables.json` after the source file has already been copied to `./variables.json`.
- `cli/diff.mdx` and `concepts/diffing.mdx`: remove `--markdown`; show Markdown as default; add `--json` and `--out <file>`.
- `cli/export.mdx`: document both implemented spellings, `--file-key` and the compatibility alias `--fileKey`.
- `cli/diff.mdx`: replace the nonexistent `design-tokens/variables.json` CI path with `backup/variables.json variables.json` in old-then-new order.
- `cli/index.mdx`: use `npm run check` and `npm run diff`, or `figma-vars check .` and `figma-vars diff backup/variables.json variables.json`; do not reference a nonexistent `design-tokens/` directory after init.
- `cli/check.mdx`: remove `[options]` and the claim that orphaned mode files are detected.
- `cli/build.mdx`: type the result as `BuildPipelineResult` and iterate `result.files`.

- [ ] **Step 2: Correct generated-output and live-hook examples**

In `pipeline-output.mdx`, import and use:

```ts
import { tokenValues, tokenVars, type TokenPath } from './design-tokens/ts/tokens'

const path: TokenPath = 'semantic.color.bg.brand'
console.log(tokenValues[path])
console.log(tokenVars[path])
```

Remove any claim that the emitted workflow performs a breaking diff; it builds and commits generated output.

In `hooks/live-api.mdx` and `packages/hooks/README.md`, import low-level helpers from core:

```tsx
import { fetcher, getRetryAfter, isFigmaApiError, isRateLimited, withRetry } from '@figmavars/core'
import { FigmaVarsProvider, useInvalidateVariables } from '@figmavars/hooks'
```

Frame PAT usage as server-only or internal-tool configuration. Do not use a
`VITE_`, `NEXT_PUBLIC_`, or browser-bundled token example. Destructure the
actual invalidation API and invoke it after a successful mutation.

- [ ] **Step 3: Replace workspace boilerplate and clean launch prose**

Replace `apps/docs/README.md` with repository-specific commands:

````markdown
# FigmaVars documentation

The Fumadocs/Next.js documentation application for the FigmaVars monorepo.

From the repository root:

```sh
pnpm --filter figmavars-docs dev
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

CLI reference pages live in `content/docs/cli` and are checked against the
exported CLI help by the `@figmavars/cli` test suite.
````

Delete both stray empty code-fence lines near the end of
`docs/launch/announcement.md` without changing launch claims beyond the
corrected namespace and URLs.

- [ ] **Step 4: Run docs typecheck/build and formatting**

```bash
pnpm exec prettier --check apps/docs/content/docs packages/hooks/README.md apps/docs/README.md docs/launch/announcement.md
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

Expected: MDX generation, Next type generation, TypeScript, and production build pass.

- [ ] **Step 5: Commit the task**

```bash
git add apps/docs/content/docs/cli apps/docs/content/docs/concepts/diffing.mdx apps/docs/content/docs/getting-started/pipeline-output.mdx apps/docs/content/docs/hooks/live-api.mdx packages/hooks/README.md apps/docs/README.md docs/launch/announcement.md
git commit -m "docs: align guides with the v5 command surface"
```

### Task 3: Automated documentation parity guard

**Files:**

- Create: `packages/cli/tests/docs-parity.test.ts`
- Modify: `packages/cli/src/commands/build.ts`
- Modify: `packages/cli/src/commands/check.ts`
- Modify: `packages/cli/src/commands/diff.ts`
- Modify: `packages/cli/src/commands/export.ts`
- Modify: `packages/cli/src/commands/init.ts`

**Interfaces:**

- Consumes: exported `buildHelp`, `checkHelp`, `diffHelp`, `exportHelp`, `initHelp` and maintained CLI MDX pages.
- Produces: a Vitest guard for missing/unknown documented options, wrong diff ordering, obsolete flags, and unintended legacy namespace references.

- [ ] **Step 1: Ensure help constants remain importable without running the CLI**

Keep each command's existing exported `*Help` constant. The parity test imports command modules directly; it must not import `src/index.ts`, which executes `main()`.

- [ ] **Step 2: Write the parity test**

Create `docs-parity.test.ts` with:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHelp } from '../src/commands/build'
import { checkHelp } from '../src/commands/check'
import { diffHelp } from '../src/commands/diff'
import { exportHelp } from '../src/commands/export'
import { initHelp } from '../src/commands/init'

const root = resolve(import.meta.dirname, '../../..')
const commands = [
  ['build', buildHelp],
  ['check', checkHelp],
  ['diff', diffHelp],
  ['export', exportHelp],
  ['init', initHelp],
] as const

function options(text: string): string[] {
  return [...text.matchAll(/(?<![A-Za-z0-9-])(--[A-Za-z][A-Za-z-]*)(?=$|[\s,`<>\[\]()])/gm)].map(
    match => match[1] as string
  )
}

for (const [command, help] of commands) {
  it(`${command} docs expose exactly the implemented options`, () => {
    const page = readFileSync(resolve(root, `apps/docs/content/docs/cli/${command}.mdx`), 'utf8')
    expect(new Set(options(page))).toEqual(new Set(options(help)))
  })
}

describe('maintained examples', () => {
  const maintained = [
    'packages/cli/README.md',
    'apps/docs/content/docs/cli/index.mdx',
    'apps/docs/content/docs/concepts/diffing.mdx',
    'apps/docs/content/docs/hooks/live-api.mdx',
  ]
    .map(file => readFileSync(resolve(root, file), 'utf8'))
    .join('\n')

  it('contains no obsolete CLI switches', () => {
    expect(maintained).not.toMatch(/figma-vars init[^\n]*--build/)
    expect(maintained).not.toMatch(/figma-vars diff[^\n]*--markdown/)
  })

  it('uses old then new order for semantic diffs', () => {
    expect(maintained).not.toContain('figma-vars diff variables.json backup/variables.json')
  })

  it('does not revive the legacy namespace outside migration guidance', () => {
    const hooksReadme = readFileSync(resolve(root, 'packages/hooks/README.md'), 'utf8')
    const currentHooksReadme = hooksReadme.split('## Migrating from 4.x')[0]
    const docsFiles = readdirSync(resolve(root, 'apps/docs/content/docs'), {
      recursive: true,
    })
      .filter(file => /\.(md|mdx)$/.test(String(file)))
      .filter(file => !/hooks[\\/]migration\.mdx$/.test(String(file)))
      .map(file => readFileSync(resolve(root, 'apps/docs/content/docs', String(file)), 'utf8'))
      .join('\n')
    expect(`${maintained}\n${currentHooksReadme}\n${docsFiles}`).not.toContain('@figma-vars/')
  })
})
```

If a command page intentionally repeats an option in examples, compare sets as shown. Migration and changelog files remain outside `maintained`.

- [ ] **Step 3: Run the new guard and correct any remaining RED**

```bash
pnpm --filter @figmavars/cli exec vitest run tests/docs-parity.test.ts
```

Expected on first run: any option-table omission or stale example is reported by exact file/command.

- [ ] **Step 4: Run the complete CLI/docs gates for GREEN**

```bash
pnpm --filter @figmavars/cli test
pnpm --filter @figmavars/cli typecheck
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

Expected: parity guard, CLI suite, docs typecheck, and production build pass.

- [ ] **Step 5: Commit the task**

```bash
git add packages/cli/tests/docs-parity.test.ts packages/cli/src/commands apps/docs/content/docs packages/cli/README.md packages/hooks/README.md
git commit -m "test(cli): guard documentation parity"
```
