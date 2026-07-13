# DTCG Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DTCG 2025.10 output deterministic, reference-correct, prototype-safe, and valid TypeScript for colliding or hostile Figma names and IDs.

**Architecture:** Allocate display-name slugs by stable identity, compute canonical token paths before value conversion, and use prototype-safe dictionaries throughout normalization, emission, and resolver application. `$root` is part of the canonical path whenever a token is also a group prefix, so aliases and downstream generators share one unambiguous model.

**Tech Stack:** TypeScript 6, Vitest 4, DTCG Format and Resolver 2025.10, pnpm 11.

## Global Constraints

- The public npm namespace is `@figmavars/*`.
- DTCG token/group prefix collisions use the reserved `$root` token name and references include `.$root`.
- Exact duplicate collection and mode names receive deterministic `-2`, `-3`, and later suffixes by input order.
- Hostile source keys cannot mutate `Object.prototype` or be resolved through inherited properties.
- Existing public `uniqueSlugs(names)` remains available; new identity-safe allocation is additive.
- Generated TypeScript must parse under the repository's TypeScript 6 compiler.
- No merge, push, tag, npm publication, deployment, or external npm/GitHub mutation.
- No new public package or runtime dependency.

---

### Task 1: Identity-safe collection and mode slugs

**Files:**

- Modify: `packages/dtcg/src/naming.ts`
- Modify: `packages/dtcg/src/index.ts`
- Modify: `packages/dtcg/src/emit.ts`
- Modify: `packages/dtcg/tests/naming.test.ts`
- Modify: `packages/dtcg/tests/emit.test.ts`

**Interfaces:**

- Consumes: ordered collections/modes and their display names.
- Produces: `allocateUniqueSlugs<T>(items, getName): string[]`, with each returned slug aligned to its input index.

- [ ] **Step 1: Write failing exact-duplicate tests**

Add to `naming.test.ts`:

```ts
expect(
  allocateUniqueSlugs(
    [
      { id: 'a', name: 'Theme' },
      { id: 'b', name: 'Theme' },
      { id: 'c', name: 'theme!' },
    ],
    item => item.name
  )
).toEqual(['theme', 'theme-2', 'theme-3'])

expect(
  allocateUniqueSlugs(
    [
      { id: 'a', name: 'Theme' },
      { id: 'b', name: 'Theme' },
      { id: 'c', name: 'Theme-2' },
    ],
    item => item.name
  )
).toEqual(['theme', 'theme-2', 'theme-2-2'])
```

Add an end-to-end emitter fixture with two collections named `Theme`; assert
both `theme.tokens.json` and `theme-2.tokens.json` exist, each contains only its
own collection's variable, and resolver sets reference both files. Add two
modes with the same name and assert distinct mode files and contexts.

- [ ] **Step 2: Run the focused tests and record RED**

```bash
pnpm --filter @figmavars/dtcg exec vitest run tests/naming.test.ts tests/emit.test.ts
```

Expected: `allocateUniqueSlugs` is missing and exact duplicate names overwrite emitted output.

- [ ] **Step 3: Implement positional slug allocation**

Add to `naming.ts`:

```ts
export function allocateUniqueSlugs<T>(
  items: readonly T[],
  getName: (item: T) => string
): string[] {
  const used = new Set<string>()
  return items.map(item => {
    const base = slugify(getName(item))
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    used.add(candidate)
    return candidate
  })
}
```

Retain `uniqueSlugs(names)` as the compatibility helper, export the new helper
from `src/index.ts`, and use positional results in `toDTCG`:

```ts
const collectionSlugList = allocateUniqueSlugs(
  normalized.collections,
  collection => collection.name
)
const slugsById = new Map(
  normalized.collections.map((collection, index) => [
    collection.id,
    collectionSlugList[index] as string,
  ])
)
```

For each collection, allocate mode slugs by ordered mode object and look them
up by mode ID rather than mode name.

- [ ] **Step 4: Verify focused tests and the package**

```bash
pnpm --filter @figmavars/dtcg exec vitest run tests/naming.test.ts tests/emit.test.ts
pnpm --filter @figmavars/dtcg typecheck
pnpm --filter @figmavars/dtcg test
```

Expected: both duplicate collections/modes survive with deterministic slugs and all package tests pass.

- [ ] **Step 5: Commit the task**

```bash
git add packages/dtcg/src/naming.ts packages/dtcg/src/index.ts packages/dtcg/src/emit.ts packages/dtcg/tests/naming.test.ts packages/dtcg/tests/emit.test.ts
git commit -m "fix(dtcg): preserve duplicate collection and mode names"
```

### Task 2: Canonical `$root` paths and prototype-safe dictionaries

**Files:**

- Modify: `packages/core/src/normalize/normalize.ts`
- Modify: `packages/core/tests/normalize/normalize.test.ts`
- Create: `packages/dtcg/src/dictionary.ts`
- Modify: `packages/dtcg/src/naming.ts`
- Modify: `packages/dtcg/src/emit.ts`
- Modify: `packages/dtcg/src/resolve.ts`
- Modify: `packages/dtcg/src/types.ts`
- Modify: `packages/dtcg/tests/naming.test.ts`
- Modify: `packages/dtcg/tests/emit.test.ts`
- Modify: `packages/dtcg/tests/resolve.test.ts`

**Interfaces:**

- Consumes: candidate token paths keyed by variable ID.
- Produces: final paths where strict-prefix tokens end in `$root`; null-prototype dictionaries; `hasOwn(object, key)` checks.

- [ ] **Step 1: Replace the old `base` test with failing `$root` reference tests**

In `emit.test.ts`, test both insertion orders for variables `color/blue` and
`color/blue/500`. Add an alias to the shorter variable and assert:

```ts
expect(tokenAt(document, 'primitives.color.blue.$root').$type).toBe('color')
expect(tokenAt(document, 'primitives.color.blue.500').$type).toBe('color')
expect(tokenAt(document, 'semantic.alias').$value).toBe('{primitives.color.blue.$root}')
expect(
  resolveTokenValues(flattenTokens(applyResolver(output.files, output.resolver))).get(
    'semantic.alias'
  )
).toEqual({ colorSpace: 'srgb', components: [0, 0, 1], alpha: 1, hex: '#0000ff' })
```

In `resolve.test.ts`, add a document containing `$root` and assert
`flattenTokens` returns `color.accent.$root` rather than skipping it.

- [ ] **Step 2: Add hostile-key regression tests**

Use array-form collections/variables so IDs equal to `__proto__` are normal
data properties, and use variable names `__proto__/polluted`,
`constructor/value`, and `prototype/value`. Install an `afterEach` cleanup that
deletes the `polluted` sentinel from `Object.prototype`, so the intentionally
failing RED run cannot contaminate later tests. Assert exact survival and
dictionary prototypes:

```ts
expect(sanitizeSegment('__proto__')).toBe('___proto___')
expect(sanitizeSegment('constructor')).toBe('_constructor_')
expect(sanitizeSegment('prototype')).toBe('_prototype_')
expect(Object.prototype).not.toHaveProperty('polluted')
expect(Object.getPrototypeOf(output.files)).toBeNull()
expect(tokenAt(document, 'theme.___proto___.polluted').$value).toBe('safe')
expect(Object.getPrototypeOf(output.resolver.sets)).toBeNull()
expect(Object.getPrototypeOf(output.resolver.modifiers)).toBeNull()
expect(Object.getPrototypeOf(output.resolver.modifiers?.theme?.contexts)).toBeNull()
expect(isToken(Object.create({ $value: 'inherited' }))).toBe(false)
```

In core normalization tests, assert hostile IDs remain own entries in
`collectionsById`/`variablesById`, all four ID maps produced by normalization
and `toLocalVariablesResponse` have null prototypes, and inherited
`valuesByMode` entries do not become values. Confirm no step changes
`Object.prototype`.

- [ ] **Step 3: Run focused tests and record RED**

```bash
pnpm --filter @figmavars/core exec vitest run tests/normalize/normalize.test.ts
pnpm --filter @figmavars/dtcg exec vitest run tests/emit.test.ts tests/resolve.test.ts
```

Expected: current output uses `base`, aliases point at groups, `$root` is skipped, and hostile keys traverse inherited prototypes.

- [ ] **Step 4: Add the prototype-safe dictionary primitives**

Create `packages/dtcg/src/dictionary.ts`:

```ts
export function createDictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
```

In core normalization, initialize ID-keyed records and the maps emitted by
`toLocalVariablesResponse` with `Object.create(null)`. Copy `valuesByMode` and
`codeSyntax` from own `Object.entries` into null-prototype records rather than
retaining source objects, and test membership with
`Object.prototype.hasOwnProperty.call(collectionsById, id)`.

- [ ] **Step 5: Encode dangerous user segments**

In `naming.ts`, apply this after the existing DTCG character cleanup:

```ts
const DANGEROUS_OBJECT_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

return DANGEROUS_OBJECT_SEGMENTS.has(cleaned) ? `_${cleaned}_` : cleaned
```

An empty result remains `unnamed`. User input beginning with `$` continues to
lose the reserved prefix, so only the emitter itself can create `$root`.

- [ ] **Step 6: Canonicalize final token paths before building tokens**

After exact-path suffix allocation in `buildTokenPaths`, build the set of all
strict prefixes:

```ts
const strictPrefixes = new Set<string>()
for (const segments of paths.values()) {
  for (let index = 1; index < segments.length; index += 1) {
    strictPrefixes.add(segments.slice(0, index).join('.'))
  }
}

for (const [id, segments] of paths) {
  if (strictPrefixes.has(segments.join('.'))) {
    paths.set(id, [...segments, '$root'])
    warnings.push(`Token path "${segments.join('.')}" is also a group; moved the token to "$root"`)
  }
}
```

Run this before any `buildToken` call so `referenceFor` reads the final map.
Simplify `insertToken`: traverse only own properties, create missing groups
with `createDictionary`, and assign the final leaf. Any unexpected token/group
collision after canonicalization throws an internal error instead of silently
rewriting the path.

- [ ] **Step 7: Harden emit and resolver record construction**

Use `createDictionary` for base/mode roots, `files`, resolver sets/modifiers,
and modifier contexts. In `mergeDocuments`, create all result groups with the
same helper. In `listContexts`, return a null-prototype record. In
`applyResolver`, read set/modifier/context/file entries and input selections
only when `hasOwn` confirms the property. Update `isRef` to require an own
string `$ref` property, so an inherited reference cannot select a file.

In `resolve.test.ts`, construct hostile file/set/modifier/context names and an
object whose `$ref` exists only on its prototype. Assert inherited files,
contexts, selections, and references are rejected, while own dangerous keys
still resolve. Also assert null prototypes for `mergeDocuments(...)` and every
nested merged group, plus the record returned by `listContexts(...)`.

Change `isToken` to:

```ts
export function isToken(node: unknown): node is DTCGToken {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    Object.prototype.hasOwnProperty.call(node, '$value')
  )
}
```

Change the flattening skip condition to:

```ts
if (key.startsWith('$') && key !== '$root') continue
```

- [ ] **Step 8: Verify GREEN across core and DTCG**

```bash
pnpm --filter @figmavars/core exec vitest run tests/normalize/normalize.test.ts
pnpm --filter @figmavars/dtcg exec vitest run tests/emit.test.ts tests/resolve.test.ts
pnpm --filter @figmavars/core typecheck
pnpm --filter @figmavars/dtcg typecheck
pnpm --filter @figmavars/core test
pnpm --filter @figmavars/dtcg test
```

Expected: `$root` references resolve, hostile keys do not affect prototypes, and both complete package suites pass.

- [ ] **Step 9: Commit the task**

```bash
git add packages/core/src/normalize/normalize.ts packages/core/tests/normalize/normalize.test.ts packages/dtcg/src/dictionary.ts packages/dtcg/src/naming.ts packages/dtcg/src/emit.ts packages/dtcg/src/resolve.ts packages/dtcg/src/types.ts packages/dtcg/tests/naming.test.ts packages/dtcg/tests/emit.test.ts packages/dtcg/tests/resolve.test.ts
git commit -m "fix(dtcg): canonicalize token paths safely"
```

### Task 3: Complete TypeScript literal encoding

**Files:**

- Modify: `packages/dtcg/src/pipeline/typescript.ts`
- Modify: `packages/dtcg/tests/pipeline.test.ts`

**Interfaces:**

- Consumes: arbitrary flattened token paths and resolved CSS/string values.
- Produces: syntactically valid ESM source using JSON-compatible JavaScript string literals everywhere.

- [ ] **Step 1: Write a failing hostile-literal compiler test**

Construct a DTCG document with token path segments containing an apostrophe,
backslash, newline, Unicode line separator, and a string value with the same
characters. Generate source and check TypeScript diagnostics:

```ts
import ts from 'typescript'
import { cssValue } from '../src/pipeline/css'

const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
})
expect(compiled.diagnostics ?? []).toEqual([])
expect(source).toContain(JSON.stringify(hostilePath))
expect(source).toContain(JSON.stringify(cssValue(hostileValue)))
```

Update the current `emitTypescript` assertions from single-quoted literals to
the JSON double-quoted form for the path union, `tokenVars`, and `tokenValues`.

- [ ] **Step 2: Run the pipeline test and record RED**

```bash
pnpm --filter @figmavars/dtcg exec vitest run tests/pipeline.test.ts
```

Expected: the generated union or object key has a TypeScript syntax diagnostic.

- [ ] **Step 3: Use one literal encoder for paths, keys, and values**

In `typescript.ts`:

```ts
function stringLiteral(value: string): string {
  return JSON.stringify(value)
}

for (const path of paths) {
  lines.push(`  | ${stringLiteral(path)}`)
}

for (const path of paths) {
  lines.push(`  ${stringLiteral(path)}: ${stringLiteral(`var(${cssVarName(path)})`)},`)
}

for (const path of paths) {
  const value = resolved.get(path)
  const css = value === undefined ? null : cssValue(value)
  const literal = css === null ? JSON.stringify(value) : stringLiteral(css)
  lines.push(`  ${stringLiteral(path)}: ${literal},`)
}
```

- [ ] **Step 4: Verify generated source and the full DTCG package**

```bash
pnpm --filter @figmavars/dtcg exec vitest run tests/pipeline.test.ts
pnpm --filter @figmavars/dtcg typecheck
pnpm --filter @figmavars/dtcg test
pnpm --filter @figmavars/dtcg build
```

Expected: hostile source transpiles without diagnostics and all package gates pass.

- [ ] **Step 5: Commit the task**

```bash
git add packages/dtcg/src/pipeline/typescript.ts packages/dtcg/tests/pipeline.test.ts
git commit -m "fix(dtcg): encode generated TypeScript literals"
```
