# Runtime Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Figma mutation transport, payload types, and fallback handling with the current upstream API while preserving the existing v5 public call surface.

**Architecture:** Core owns the upstream REST and runtime-validation contracts. Hooks consume core's discriminated fallback result and keep their existing mutation APIs, so there is one transport implementation and no hook-level casting between local and published responses.

**Tech Stack:** TypeScript 6, Vitest 4, React 19, SWR 2, pnpm 11, Turborepo.

## Global Constraints

- The public npm namespace is `@figmavars/*`.
- Keep the public `mutator(url, token, action, body, options)` signature during v5 preparation.
- All Variables create, update, delete, and mixed bulk requests use `POST /v1/files/:file_key/variables`; entry-level `action` fields select operations.
- Existing raw fallback validation remains available for compatibility.
- Empty fallback records require an explicit `local` or `published` kind.
- Public errors never include access tokens.
- No merge, push, tag, npm publication, deployment, or external npm/GitHub mutation.
- No new public package.

---

### Task 1: Figma mutation transport and payload types

**Files:**

- Modify: `packages/core/src/api/mutator.ts`
- Modify: `packages/core/src/types/mutations.ts`
- Modify: `packages/core/tests/api/mutator.test.ts`
- Create: `packages/core/tests/types/mutations.test.ts`
- Verify: `packages/hooks/src/hooks/useCreateVariable.ts`
- Verify: `packages/hooks/src/hooks/useUpdateVariable.ts`
- Verify: `packages/hooks/src/hooks/useDeleteVariable.ts`
- Verify: `packages/hooks/src/hooks/useBulkUpdateVariables.ts`
- Test: `packages/hooks/tests/hooks/useCreateVariable.test.tsx`
- Test: `packages/hooks/tests/hooks/useUpdateVariable.test.tsx`
- Test: `packages/hooks/tests/hooks/useDeleteVariable.test.tsx`
- Test: `packages/hooks/tests/hooks/useBulkUpdateVariables.test.tsx`

**Interfaces:**

- Consumes: Figma's `POST /v1/files/:file_key/variables` contract and existing `VariableAction` values.
- Produces: compatibility-preserving `mutator`; discriminated `VariableCollectionChange`, `VariableModeChange`, and `VariableChange` unions; RGB/RGBA/null-capable `VariableMutationValue`; token-safe API errors.

- [ ] **Step 1: Change the transport tests before production code**

Replace the update expectation and add a delete transport assertion in `mutator.test.ts`:

```ts
it('uses POST for UPDATE because the request body selects the action', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    body: 'not-null',
    json: () => Promise.resolve({ id: '123' }),
  })

  await mutator(url, token, 'UPDATE', {
    variables: [{ action: 'UPDATE', id: 'VariableID:1', name: 'Brand' }],
  })

  expect(fetch).toHaveBeenCalledWith(fullUrl, expect.objectContaining({ method: 'POST' }))
})

it('uses POST for DELETE because the request body selects the action', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 204, body: null })

  await mutator(url, token, 'DELETE', {
    variables: [{ action: 'DELETE', id: 'VariableID:1' }],
  })

  expect(fetch).toHaveBeenCalledWith(fullUrl, expect.objectContaining({ method: 'POST' }))
})

it('removes the access token from API-provided error text', async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 400,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    },
    json: () => Promise.resolve({ err: `Rejected credential ${token}` }),
  })

  const error = await mutator(url, token, 'UPDATE', {}).catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).not.toContain(token)
})
```

- [ ] **Step 2: Run the focused transport test and record RED**

Run:

```bash
pnpm --filter @figmavars/core exec vitest run tests/api/mutator.test.ts
```

Expected: UPDATE/DELETE fail because the current methods are `PUT`/`DELETE`,
and the API error test fails because response text currently preserves the raw
token. Keep the test file's current fetch-mock object shape.

- [ ] **Step 3: Add compile-time payload contract tests**

Create `packages/core/tests/types/mutations.test.ts` with valid create/update/delete examples and `@ts-expect-error` assertions:

```ts
import { describe, expect, it } from 'vitest'
import type {
  VariableCollectionChange,
  VariableModeChange,
  VariableChange,
  VariableModeValue,
} from '../../src/types/mutations'

describe('Figma mutation payload types', () => {
  it('accepts temporary ids and extended collection fields on create', () => {
    const collection: VariableCollectionChange = {
      action: 'CREATE',
      name: 'Theme extension',
      parentVariableCollectionId: 'VariableCollectionId:1',
      initialModeIdToParentModeIdMapping: { '1:dark': 'tempDark' },
    }
    const mode: VariableModeChange = {
      action: 'CREATE',
      name: 'Dark',
      variableCollectionId: 'VariableCollectionId:temp',
    }
    const variable: VariableChange = {
      action: 'CREATE',
      name: 'color/bg',
      variableCollectionId: 'VariableCollectionId:temp',
      resolvedType: 'COLOR',
    }
    const removedOverride: VariableModeValue = {
      variableId: 'VariableID:1',
      modeId: 'VariableCollectionId:2/1:dark',
      value: null,
    }
    const rgb: VariableModeValue = {
      variableId: 'VariableID:1',
      modeId: '1:dark',
      value: { r: 1, g: 0, b: 0 },
    }

    expect([collection, mode, variable, removedOverride, rgb]).toHaveLength(5)
  })

  it('requires ids for update and delete actions', () => {
    // @ts-expect-error UPDATE requires an id
    const update: VariableChange = { action: 'UPDATE', name: 'Renamed' }
    // @ts-expect-error DELETE requires an id
    const remove: VariableCollectionChange = { action: 'DELETE' }
    expect([update, remove]).toHaveLength(2)
  })

  it('rejects create-only fields during updates', () => {
    const typed = {
      action: 'UPDATE',
      id: 'VariableID:1',
      // @ts-expect-error resolvedType cannot change after variable creation
      resolvedType: 'STRING',
    } satisfies VariableChange
    const mixed = {
      action: 'CREATE',
      name: 'Invalid extension',
      parentVariableCollectionId: 'VariableCollectionId:1',
      // @ts-expect-error a root initial mode and extended parent are mutually exclusive
      initialModeId: 'tempMode',
    } satisfies VariableCollectionChange
    expect([typed, mixed]).toHaveLength(2)
  })
})
```

- [ ] **Step 4: Run typecheck and record RED for the new upstream fields**

Run:

```bash
pnpm --filter @figmavars/core typecheck
```

Expected: errors report missing create-name support without `id`, missing
extended collection properties, and rejection of RGB-without-alpha and `null`
mode values.

- [ ] **Step 5: Implement the minimum transport and discriminated payload unions**

In `mutator.ts`, rename the compatibility parameter from `action` to
`_action`, delete the `methodMap` and `method` declarations inside the `try`
block, and change the `RequestInit` field from `method` to `method: 'POST'`.
Leave token validation, timeout creation/cleanup, optional body serialization,
URL construction, response parsing, and error class behavior unchanged. Before
constructing `FigmaApiError`, replace every exact occurrence of the supplied
token in API-provided JSON/text error messages with `[redacted]`; the raw token
must never enter the thrown message. Update the function JSDoc to describe one
authenticated POST endpoint whose entry-level `action` fields select create,
update, and delete behavior.

In `mutations.ts`, replace broad change interfaces with action unions. Use these exact relationships:

```ts
type ChangeId = { id: string }
type TemporaryId = { id?: string }
type RootCollectionCreate = {
  parentVariableCollectionId?: never
  initialModeId?: string
  initialModeIdToParentModeIdMapping?: never
}
type ExtendedCollectionCreate = {
  parentVariableCollectionId: string
  initialModeId?: never
  initialModeIdToParentModeIdMapping?: Record<string, string>
}

export type VariableCollectionChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      hiddenFromPublishing?: boolean
    } & (RootCollectionCreate | ExtendedCollectionCreate))
  | (ChangeId & {
      action: 'UPDATE'
      name?: string
      hiddenFromPublishing?: boolean
    })
  | (ChangeId & { action: 'DELETE' })

export type VariableModeChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      variableCollectionId: string
    })
  | (ChangeId & {
      action: 'UPDATE'
      name?: string
      variableCollectionId: string
    })
  | (ChangeId & { action: 'DELETE'; variableCollectionId: string })

type VariableMutableFields = {
  name?: string
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: VariableScope[]
  codeSyntax?: Record<string, string>
}

export type VariableChange =
  | (TemporaryId & {
      action: 'CREATE'
      name: string
      variableCollectionId: string
      resolvedType: ResolvedType
      description?: string
      hiddenFromPublishing?: boolean
      scopes?: VariableScope[]
      codeSyntax?: Record<string, string>
    })
  | (ChangeId & { action: 'UPDATE' } & VariableMutableFields)
  | (ChangeId & { action: 'DELETE' })

export type VariableMutationValue = VariableValue | Omit<Color, 'a'> | null

export interface VariableModeValue {
  variableId: string
  modeId: string
  value: VariableMutationValue
}
```

Import `Color` alongside the current Figma types. `VariableValue` continues to
model the existing response surface; the additive mutation alias is what admits
Figma's RGB request form without weakening response consumers.

Update JSDoc examples so CREATE examples omit `id` unless demonstrating a temporary ID, and transport prose says POST only.

- [ ] **Step 6: Run focused core tests and typecheck for GREEN**

Run:

```bash
pnpm --filter @figmavars/core exec vitest run tests/api/mutator.test.ts tests/types/mutations.test.ts
pnpm --filter @figmavars/core typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 7: Verify hook payloads still express entry-level actions**

Run:

```bash
pnpm --filter @figmavars/hooks exec vitest run tests/hooks/useCreateVariable.test.tsx tests/hooks/useUpdateVariable.test.tsx tests/hooks/useDeleteVariable.test.tsx tests/hooks/useBulkUpdateVariables.test.tsx
pnpm --filter @figmavars/hooks typecheck
```

Expected: create, update, delete, and mixed bulk hooks pass without changing their public APIs.

- [ ] **Step 8: Commit the task**

```bash
git add packages/core/src/api/mutator.ts packages/core/src/types/mutations.ts packages/core/tests/api/mutator.test.ts packages/core/tests/types/mutations.test.ts
git commit -m "fix(core): align variable mutations with the Figma API"
```

### Task 2: Discriminated fallback data

**Files:**

- Modify: `packages/core/src/utils/typeGuards.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/utils/typeGuards.test.ts`
- Modify: `packages/hooks/src/types/contexts.ts`
- Modify: `packages/hooks/src/contexts/FigmaVarsProvider.tsx`
- Modify: `packages/hooks/src/hooks/useVariables.ts`
- Modify: `packages/hooks/src/hooks/usePublishedVariables.ts`
- Modify: `packages/hooks/tests/FigmaVarsProvider.test.tsx`
- Modify: `packages/hooks/tests/hooks/useVariables.test.tsx`
- Modify: `packages/hooks/tests/hooks/usePublishedVariables.test.tsx`

**Interfaces:**

- Consumes: `LocalVariablesResponse`, `PublishedVariablesResponse`, legacy raw-object/string `fallbackFile`.
- Produces: `FallbackDataKind`, `ClassifiedFallbackData`, `classifyFallbackData(data, explicitKind?)`, optional `fallbackKind` provider prop, and internal `validatedFallback` context value.

- [ ] **Step 1: Replace the identical-guard expectation with discriminating tests**

Add fixtures with actual local markers (`modes`, `valuesByMode`) and published markers (`subscribed_id`, `key`, `updatedAt`). Assert:

```ts
expect(isLocalVariablesResponse(localData)).toBe(true)
expect(isPublishedVariablesResponse(localData)).toBe(false)
expect(isPublishedVariablesResponse(publishedData)).toBe(true)
expect(isLocalVariablesResponse(publishedData)).toBe(false)
expect(classifyFallbackData(localData)).toEqual({ kind: 'local', data: localData })
expect(classifyFallbackData(publishedData)).toEqual({
  kind: 'published',
  data: publishedData,
})
expect(classifyFallbackData({ meta: { variableCollections: {}, variables: {} } })).toBeUndefined()
expect(classifyFallbackData({ meta: { variableCollections: {}, variables: {} } }, 'local')).toEqual(
  {
    kind: 'local',
    data: { meta: { variableCollections: {}, variables: {} } },
  }
)
expect(validateFallbackData({ meta: { variableCollections: {}, variables: {} } })).toBeUndefined()
expect(classifyFallbackData(localData, 'unexpected' as FallbackDataKind)).toBeUndefined()
```

Rewrite the current empty-entry expectations to reflect ambiguity. Add arrays,
dates, class instances, primitive entries, and maps containing a mix of local
and published entries; none may be classified. Empty plain-record maps remain
valid to both low-level guards but require `fallbackKind` for classification.

- [ ] **Step 2: Run the core guard test and record RED**

```bash
pnpm --filter @figmavars/core exec vitest run tests/utils/typeGuards.test.ts
```

Expected: local and published cross-shape rejection and `classifyFallbackData` fail.

- [ ] **Step 3: Implement entry-aware guards and additive classification**

Use null-safe record helpers and these exported types:

```ts
export type FallbackDataKind = 'local' | 'published'

export type ClassifiedFallbackData =
  | { kind: 'local'; data: LocalVariablesResponse }
  | { kind: 'published'; data: PublishedVariablesResponse }

export function classifyFallbackData(
  data: unknown,
  explicitKind?: FallbackDataKind
): ClassifiedFallbackData | undefined {
  if (explicitKind !== undefined && explicitKind !== 'local' && explicitKind !== 'published') {
    return undefined
  }
  const local = isLocalVariablesResponse(data)
  const published = isPublishedVariablesResponse(data)

  if (explicitKind === 'local') {
    return local ? { kind: 'local', data } : undefined
  }
  if (explicitKind === 'published') {
    return published ? { kind: 'published', data } : undefined
  }
  if (local === published) return undefined
  return local
    ? { kind: 'local', data }
    : { kind: 'published', data: data as PublishedVariablesResponse }
}

export function validateFallbackData(
  data: unknown
): LocalVariablesResponse | PublishedVariablesResponse | undefined {
  return classifyFallbackData(data)?.data
}
```

The guards must require plain record maps. Non-empty local entries require local-only members such as `modes` or `valuesByMode`; non-empty published entries require `subscribed_id`, `key`, and `updatedAt`. Empty maps remain structurally valid for both guards so only an explicit kind can classify them.

- [ ] **Step 4: Export the additive core API and verify GREEN**

Export `FallbackDataKind`, `ClassifiedFallbackData`, and `classifyFallbackData` from `packages/core/src/index.ts`, then run:

```bash
pnpm --filter @figmavars/core exec vitest run tests/utils/typeGuards.test.ts
pnpm --filter @figmavars/core typecheck
```

Expected: guard tests and typecheck pass.

- [ ] **Step 5: Write failing provider and cross-hook tests**

Add provider tests showing `fallbackKind="local"` accepts an empty response.
Pass `fallbackKind={'unexpected' as FallbackDataKind}` in a runtime-hardening
case and assert both parsed/validated fallback values are absent and the fixed
development warning contains no fallback contents. Add hook tests showing:

```ts
// useVariables ignores published fallback data and retains the live key.
expect(mockedUseSWR).toHaveBeenCalledWith(
  ['https://api.figma.com/v1/files/test-file/variables/local', 'test-token'],
  expect.any(Function),
  undefined
)

// usePublishedVariables ignores local fallback data and retains the live key.
expect(mockedUseSWR).toHaveBeenCalledWith(
  ['https://api.figma.com/v1/files/test-file/variables/published', 'test-token'],
  expect.any(Function),
  undefined
)
```

- [ ] **Step 6: Run provider and hook tests and record RED**

```bash
pnpm --filter @figmavars/hooks exec vitest run tests/FigmaVarsProvider.test.tsx tests/hooks/useVariables.test.tsx tests/hooks/usePublishedVariables.test.tsx
```

Expected: the provider lacks `fallbackKind`, and both hooks still cast the same union.

- [ ] **Step 7: Thread the discriminator through provider and hooks**

Add to `FigmaVarsProviderProps`:

```ts
fallbackKind?: FallbackDataKind
```

Add to `FigmaTokenContextType`:

```ts
validatedFallback?: ClassifiedFallbackData | undefined
```

The explicit `| undefined` keeps unconditional context construction valid under
`exactOptionalPropertyTypes`.

The provider parses string input once, calls
`classifyFallbackData(parsed, fallbackKind)`, retains the compatibility
`parsedFallbackFile: validatedFallback?.data`, and stores `validatedFallback`.
Warn in development when untagged empty data is ambiguous; never log the
contents of fallback data. When JSON parsing fails, log a fixed generic message
without the `SyntaxError.message`, because engines may include source fragments.

In `useVariables`:

```ts
const localFallback = validatedFallback?.kind === 'local' ? validatedFallback.data : undefined
const hasFallback = Boolean(localFallback)
```

In `usePublishedVariables`:

```ts
const publishedFallback =
  validatedFallback?.kind === 'published' ? validatedFallback.data : undefined
const hasFallback = Boolean(publishedFallback)
```

Return the narrowed value in each fetcher and remove both response casts.
Update every direct `useFigmaTokenContext` mock in the two hook test files:
valid local/published fallback cases include the matching
`validatedFallback: { kind, data }`, while invalid/live cases leave it absent.
Keep `parsedFallbackFile` assertions as compatibility coverage.

- [ ] **Step 8: Run focused and package verification for GREEN**

```bash
pnpm --filter @figmavars/core exec vitest run tests/utils/typeGuards.test.ts
pnpm --filter @figmavars/hooks exec vitest run tests/FigmaVarsProvider.test.tsx tests/hooks/useVariables.test.tsx tests/hooks/usePublishedVariables.test.tsx
pnpm --filter @figmavars/core typecheck
pnpm --filter @figmavars/hooks typecheck
pnpm --filter @figmavars/core test
pnpm --filter @figmavars/hooks test
```

Expected: all focused tests, package tests, and typechecks pass.

- [ ] **Step 9: Commit the task**

```bash
git add packages/core/src/utils/typeGuards.ts packages/core/src/index.ts packages/core/tests/utils/typeGuards.test.ts packages/hooks/src/types/contexts.ts packages/hooks/src/contexts/FigmaVarsProvider.tsx packages/hooks/src/hooks/useVariables.ts packages/hooks/src/hooks/usePublishedVariables.ts packages/hooks/tests/FigmaVarsProvider.test.tsx packages/hooks/tests/hooks/useVariables.test.tsx packages/hooks/tests/hooks/usePublishedVariables.test.tsx
git commit -m "fix(hooks): discriminate local and published fallbacks"
```
