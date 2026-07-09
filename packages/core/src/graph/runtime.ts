import type {
  AuthoredTokenValue,
  ContextSelection,
  DependencyQueryOptions,
  GraphDiagnostic,
  GraphDiff,
  GraphFragment,
  GraphSnapshot,
  GraphView,
  GroupId,
  GroupNode,
  JsonValue,
  Provenance,
  QualifiedIdForKind,
  QualifiedIdKind,
  ReferenceEdge,
  Result,
  ResolvedToken,
  SourceId,
  SourceRecord,
  TokenId,
  TokenGraph,
  TokenInspection,
  TokenInspectionTarget,
  TokenNode,
  TokenType,
  TokenValue,
} from './types'

const NO_DIAGNOSTICS = Object.freeze([]) as readonly GraphDiagnostic[]
const NO_PROVENANCE = Object.freeze([]) as readonly Provenance[]
const MAX_FRAGMENT_ITEMS = 100_000
const MAX_JSON_DEPTH = 64
const MAX_OPERATION_WORK = 1_000_000

interface WorkBudget {
  remaining: number
}

function chargeWork(budget: WorkBudget, amount = 1): boolean {
  budget.remaining -= amount
  return budget.remaining >= 0
}

function inputWithinWorkLimit(root: unknown): boolean {
  let remaining = MAX_OPERATION_WORK
  const stack: unknown[] = [root]
  const seen = new WeakSet<object>()
  while (stack.length > 0) {
    const value = stack.pop()
    if (typeof value === 'string') {
      remaining -= value.length + 1
    } else {
      remaining -= 1
    }
    if (remaining < 0) return false
    if (value === null || typeof value !== 'object') continue
    if (seen.has(value)) continue
    seen.add(value)
    if (Array.isArray(value)) {
      remaining -= value.length
      if (remaining < 0) return false
      for (let index = 0; index < value.length; index += 1) {
        stack.push(value[index])
      }
      continue
    }
    for (const key of Object.keys(value)) {
      remaining -= key.length + 1
      if (remaining < 0) return false
      stack.push(Reflect.get(value, key))
    }
  }
  return true
}

function workLimit<Value>(phase: GraphDiagnostic['phase']): Result<Value> {
  return failure(
    'graph.work-limit',
    phase,
    'Graph input exceeds the 1,000,000-unit work limit.'
  )
}

function success<Value>(value: Value): Result<Value> {
  return Object.freeze({
    ok: true as const,
    value,
    diagnostics: NO_DIAGNOSTICS,
  })
}

function failure<Value>(
  code: string,
  phase: GraphDiagnostic['phase'],
  message: string,
  details?: Pick<GraphDiagnostic, 'path' | 'tokenId'>
): Result<Value> {
  const diagnostic = Object.freeze({ code, phase, message, ...details })
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic]) as readonly [GraphDiagnostic],
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isPlainKey(value: string): boolean {
  return (
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype'
  )
}

function isLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  )
}

function copyStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_FRAGMENT_ITEMS) {
    return undefined
  }
  const output: string[] = []
  for (const item of value) {
    if (!isLabel(item)) {
      return undefined
    }
    output.push(item)
  }
  return Object.freeze(output)
}

function copyProvenance(value: unknown): readonly Provenance[] | undefined {
  if (value === undefined) {
    return NO_PROVENANCE
  }
  if (!Array.isArray(value) || value.length > MAX_FRAGMENT_ITEMS) {
    return undefined
  }
  const output: Provenance[] = []
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined
    }
    const copy: {
      uri?: string
      pointer?: string
      digest?: string
      line?: number
      column?: number
    } = {}
    for (const key of ['uri', 'pointer', 'digest'] as const) {
      const field = item[key]
      if (field !== undefined) {
        if (typeof field !== 'string') {
          return undefined
        }
        copy[key] = field
      }
    }
    for (const key of ['line', 'column'] as const) {
      const field = item[key]
      if (field !== undefined) {
        if (!Number.isSafeInteger(field) || (field as number) < 1) {
          return undefined
        }
        copy[key] = field as number
      }
    }
    output.push(Object.freeze(copy))
  }
  return Object.freeze(output)
}

function copyJson(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > MAX_JSON_DEPTH) {
    return undefined
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_FRAGMENT_ITEMS) {
      return undefined
    }
    const output: JsonValue[] = []
    for (const item of value) {
      const copied = copyJson(item, depth + 1)
      if (copied === undefined) {
        return undefined
      }
      output.push(copied)
    }
    return Object.freeze(output)
  }
  if (!isRecord(value)) {
    return undefined
  }
  const output: Record<string, JsonValue> = Object.create(null)
  for (const key of Object.keys(value)) {
    if (!isPlainKey(key)) {
      return undefined
    }
    const copied = copyJson(value[key], depth + 1)
    if (copied === undefined) {
      return undefined
    }
    Object.defineProperty(output, key, {
      value: copied,
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  return Object.freeze(output)
}

function copyConditions(value: unknown): ContextSelection | undefined {
  if (value === undefined) {
    return Object.freeze({})
  }
  if (!isRecord(value)) {
    return undefined
  }
  const output: Record<string, string> = Object.create(null)
  for (const key of Object.keys(value)) {
    if (!isPlainKey(key) || !isLabel(key) || !isLabel(value[key])) {
      return undefined
    }
    Object.defineProperty(output, key, {
      value: value[key],
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  return Object.freeze(output)
}

function copyTokenValue(value: unknown): TokenValue | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (value.kind === 'literal') {
    const copied = copyJson(value.value)
    return copied === undefined
      ? undefined
      : Object.freeze({ kind: 'literal' as const, value: copied })
  }
  if (value.kind === 'reference' && isLabel(value.target)) {
    return Object.freeze({
      kind: 'reference' as const,
      target: value.target as TokenId,
    })
  }
  return undefined
}

function isTokenType(value: unknown): value is TokenType {
  return (
    isLabel(value) &&
    (value === 'border' ||
      value === 'color' ||
      value === 'cubicBezier' ||
      value === 'dimension' ||
      value === 'duration' ||
      value === 'fontFamily' ||
      value === 'fontWeight' ||
      value === 'gradient' ||
      value === 'number' ||
      value === 'shadow' ||
      value === 'string' ||
      value === 'strokeStyle' ||
      value === 'transition' ||
      value === 'typography' ||
      value === 'boolean' ||
      value.startsWith('extension:'))
  )
}

function createSourceIdInput(value: string): Result<SourceId> {
  if (!isLabel(value)) {
    return failure(
      'graph.invalid-source-id',
      'source',
      'Source IDs must be nonempty names without surrounding space or control characters.'
    )
  }
  return success(`source:${encodeURIComponent(value)}` as SourceId)
}

export function createSourceId(value: string): Result<SourceId> {
  try {
    return createSourceIdInput(value)
  } catch {
    return failure(
      'graph.invalid-source-id',
      'source',
      'Source IDs must use valid text.'
    )
  }
}

function qualifyIdInput<Kind extends QualifiedIdKind>(input: {
  readonly sourceId: SourceId
  readonly kind: Kind
  readonly localId: string
}): Result<QualifiedIdForKind<Kind>> {
  if (
    !isRecord(input) ||
    !isLabel(input.sourceId) ||
    !input.sourceId.startsWith('source:') ||
    (input.kind !== 'group' && input.kind !== 'token') ||
    !isLabel(input.localId)
  ) {
    return failure(
      'graph.invalid-qualified-id',
      'source',
      'Qualified IDs require a source ID, node kind, and nonempty local ID.'
    )
  }
  return success(
    `${input.sourceId}/${input.kind}:${encodeURIComponent(input.localId)}` as QualifiedIdForKind<Kind>
  )
}

export function qualifyId<Kind extends QualifiedIdKind>(input: {
  readonly sourceId: SourceId
  readonly kind: Kind
  readonly localId: string
}): Result<QualifiedIdForKind<Kind>> {
  try {
    if (!inputWithinWorkLimit(input)) return workLimit('source')
    return qualifyIdInput(input)
  } catch {
    return failure(
      'graph.invalid-qualified-id',
      'source',
      'Qualified IDs require a source ID, node kind, and nonempty local ID.'
    )
  }
}

function createGraphFragmentInput(input: unknown): Result<GraphFragment> {
  if (!isRecord(input) || !isRecord(input.source)) {
    return failure(
      'graph.invalid-fragment',
      'source',
      'A graph fragment requires one source record.'
    )
  }
  const sourceInput = input.source
  if (
    !isLabel(sourceInput.id) ||
    !sourceInput.id.startsWith('source:') ||
    !isLabel(sourceInput.type) ||
    (sourceInput.name !== undefined && !isLabel(sourceInput.name)) ||
    (sourceInput.precedence !== undefined &&
      !Number.isSafeInteger(sourceInput.precedence))
  ) {
    return failure(
      'graph.invalid-source',
      'source',
      'The graph source record is invalid.'
    )
  }
  const sourceProvenance = copyProvenance(sourceInput.provenance)
  if (sourceProvenance === undefined) {
    return failure(
      'graph.invalid-source',
      'source',
      'The graph source provenance is invalid.'
    )
  }
  const source: SourceRecord = Object.freeze({
    id: sourceInput.id as SourceId,
    type: sourceInput.type,
    ...(sourceInput.name === undefined ? {} : { name: sourceInput.name }),
    precedence: (sourceInput.precedence as number | undefined) ?? 0,
    provenance: sourceProvenance,
  })

  if (
    !Array.isArray(input.groups) ||
    !Array.isArray(input.tokens) ||
    input.groups.length + input.tokens.length > MAX_FRAGMENT_ITEMS
  ) {
    return failure(
      'graph.invalid-fragment',
      'source',
      'Graph groups and tokens must use arrays with at most 100,000 entries.'
    )
  }

  const groups: GroupNode[] = []
  const groupIds = new Set<string>()
  for (const item of input.groups) {
    if (!isRecord(item)) {
      return failure(
        'graph.invalid-group',
        'source',
        'A graph group is invalid.'
      )
    }
    const path = copyStringArray(item.path)
    const provenance = copyProvenance(item.provenance)
    if (
      !isLabel(item.id) ||
      !item.id.startsWith(`${source.id}/group:`) ||
      item.sourceId !== source.id ||
      !isLabel(item.name) ||
      path === undefined ||
      provenance === undefined ||
      groupIds.has(item.id)
    ) {
      return failure(
        'graph.invalid-group',
        'source',
        'A graph group is invalid.'
      )
    }
    groupIds.add(item.id)
    groups.push(
      Object.freeze({
        id: item.id as GroupId,
        sourceId: source.id,
        name: item.name,
        path,
        provenance,
      })
    )
  }

  const tokens: TokenNode[] = []
  const references: ReferenceEdge[] = []
  const tokenIds = new Set<string>()
  for (const item of input.tokens) {
    if (!isRecord(item)) {
      return failure(
        'graph.invalid-token',
        'source',
        'A graph token is invalid.'
      )
    }
    const path = copyStringArray(item.path)
    const provenance = copyProvenance(item.provenance)
    if (
      !isLabel(item.id) ||
      !item.id.startsWith(`${source.id}/token:`) ||
      item.sourceId !== source.id ||
      (item.groupId !== undefined &&
        (!isLabel(item.groupId) || !groupIds.has(item.groupId))) ||
      !isLabel(item.name) ||
      path === undefined ||
      path.length === 0 ||
      !isTokenType(item.type) ||
      !Array.isArray(item.values) ||
      item.values.length === 0 ||
      item.values.length > MAX_FRAGMENT_ITEMS ||
      provenance === undefined ||
      tokenIds.has(item.id)
    ) {
      return failure(
        'graph.invalid-token',
        'source',
        'A graph token is invalid.'
      )
    }
    const values: AuthoredTokenValue[] = []
    for (const authoredInput of item.values) {
      if (!isRecord(authoredInput)) {
        return failure(
          'graph.invalid-token',
          'source',
          'A token value is invalid.'
        )
      }
      const value = copyTokenValue(authoredInput.value)
      const conditions = copyConditions(authoredInput.conditions)
      const valueProvenance = copyProvenance(authoredInput.provenance)
      const priority = authoredInput.priority ?? 0
      if (
        value === undefined ||
        conditions === undefined ||
        valueProvenance === undefined ||
        !Number.isSafeInteger(priority)
      ) {
        return failure(
          'graph.invalid-token',
          'source',
          'A token value is invalid.'
        )
      }
      values.push(
        Object.freeze({
          value,
          conditions,
          priority: priority as number,
          provenance: valueProvenance,
        })
      )
      if (value.kind === 'reference') {
        references.push(
          Object.freeze({
            from: item.id as TokenId,
            to: value.target,
            conditions,
          })
        )
      }
    }
    tokenIds.add(item.id)
    tokens.push(
      Object.freeze({
        id: item.id as TokenId,
        sourceId: source.id,
        ...(item.groupId === undefined
          ? {}
          : { groupId: item.groupId as GroupId }),
        name: item.name,
        path,
        type: item.type,
        values: Object.freeze(values),
        provenance,
      })
    )
  }

  return success(
    Object.freeze({
      source,
      groups: Object.freeze(groups),
      tokens: Object.freeze(tokens),
      references: Object.freeze(references),
    })
  )
}

export function createGraphFragment(input: unknown): Result<GraphFragment> {
  try {
    if (!inputWithinWorkLimit(input)) return workLimit('source')
    return createGraphFragmentInput(input)
  } catch {
    return failure(
      'graph.invalid-fragment',
      'source',
      'Core could not read the graph fragment.'
    )
  }
}

function composeGraphInput(
  fragments: readonly GraphFragment[]
): Result<TokenGraph> {
  if (!Array.isArray(fragments) || fragments.length > MAX_FRAGMENT_ITEMS) {
    return failure(
      'graph.invalid-fragments',
      'compose',
      'Graph fragments must use an array with at most 100,000 entries.'
    )
  }

  const sources: SourceRecord[] = []
  const groups: GroupNode[] = []
  const tokens: TokenNode[] = []
  const references: ReferenceEdge[] = []
  const sourceIds = new Set<string>()
  const groupIds = new Set<string>()
  const tokenIds = new Set<string>()

  for (const candidate of fragments) {
    const validated = createGraphFragment(candidate)
    if (!validated.ok) return validated
    const fragment = validated.value
    if (sourceIds.has(fragment.source.id as string)) {
      return failure(
        'graph.duplicate-source',
        'compose',
        'A source ID appears more than once.'
      )
    }
    sourceIds.add(fragment.source.id as string)
    sources.push(fragment.source)

    for (const group of fragment.groups as readonly GroupNode[]) {
      if (groupIds.has(group.id)) {
        return failure(
          'graph.duplicate-group',
          'compose',
          'A group ID appears more than once.'
        )
      }
      groupIds.add(group.id)
      groups.push(group)
    }
    for (const token of fragment.tokens as readonly TokenNode[]) {
      if (tokenIds.has(token.id)) {
        return failure(
          'graph.duplicate-token',
          'compose',
          'A token ID appears more than once.',
          { tokenId: token.id }
        )
      }
      tokenIds.add(token.id)
      tokens.push(token)
    }
    references.push(...(fragment.references as readonly ReferenceEdge[]))
  }

  for (const reference of references) {
    if (!tokenIds.has(reference.to)) {
      return failure(
        'graph.missing-reference',
        'compose',
        'A token reference points to a missing token.',
        { tokenId: reference.from }
      )
    }
  }

  sources.sort((left, right) => left.id.localeCompare(right.id))
  groups.sort((left, right) => left.id.localeCompare(right.id))
  tokens.sort((left, right) => left.id.localeCompare(right.id))
  references.sort((left, right) =>
    `${left.from}\u0000${left.to}`.localeCompare(
      `${right.from}\u0000${right.to}`
    )
  )

  return success(
    Object.freeze({
      sources: Object.freeze(sources),
      groups: Object.freeze(groups),
      tokens: Object.freeze(tokens),
      references: Object.freeze(references),
    })
  )
}

export function composeGraph(
  fragments: readonly GraphFragment[]
): Result<TokenGraph> {
  try {
    if (!inputWithinWorkLimit(fragments)) return workLimit('compose')
    return composeGraphInput(fragments)
  } catch {
    return failure(
      'graph.invalid-fragments',
      'compose',
      'Core could not read the graph fragments.'
    )
  }
}

function tokenMap(graph: TokenGraph): Map<TokenId, TokenNode> {
  return new Map(graph.tokens.map(token => [token.id, token]))
}

const NO_TOKEN_IDS = Object.freeze([]) as readonly TokenId[]

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}

function createSourceViewInput(
  graph: TokenGraph,
  options: { readonly id: string }
): Result<GraphView> {
  if (!isRecord(options) || !isLabel(options.id)) {
    return failure(
      'graph.invalid-view-id',
      'view',
      'A source view requires a nonempty ID.'
    )
  }
  const paths = new Set<string>()
  const tokens = graph.tokens.map(token => {
    const key = pathKey(token.path)
    if (paths.has(key)) return undefined
    paths.add(key)
    return Object.freeze({ tokenId: token.id, path: token.path })
  })
  if (tokens.some(token => token === undefined)) {
    return failure(
      'graph.duplicate-path',
      'view',
      'A source view cannot contain two tokens with the same path.'
    )
  }
  return success(
    Object.freeze({
      schemaVersion: 1 as const,
      id: options.id as GraphView['id'],
      sourceIds: Object.freeze(graph.sources.map(source => source.id)),
      groups: Object.freeze(graph.groups.map(group => group.id)),
      tokens: Object.freeze(tokens as GraphView['tokens']),
    })
  )
}

export function createSourceView(
  graph: TokenGraph,
  options: { readonly id: string }
): Result<GraphView> {
  try {
    if (!inputWithinWorkLimit([graph, options])) return workLimit('view')
    return createSourceViewInput(graph, options)
  } catch {
    return failure(
      'graph.invalid-view',
      'view',
      'Core could not read the graph or source-view options.'
    )
  }
}

function createAdjacency(
  graph: TokenGraph,
  direction: 'dependencies' | 'dependents'
): ReadonlyMap<TokenId, readonly TokenId[]> {
  const sets = new Map<TokenId, Set<TokenId>>()
  for (const edge of graph.references) {
    const from = direction === 'dependencies' ? edge.from : edge.to
    const to = direction === 'dependencies' ? edge.to : edge.from
    const neighbors = sets.get(from) ?? new Set<TokenId>()
    neighbors.add(to)
    sets.set(from, neighbors)
  }
  return new Map(
    [...sets].map(([tokenId, neighbors]) => [
      tokenId,
      Object.freeze(
        [...neighbors].sort((left, right) => left.localeCompare(right))
      ),
    ])
  )
}

function queryFromAdjacency(
  tokenIds: ReadonlySet<TokenId>,
  adjacency: ReadonlyMap<TokenId, readonly TokenId[]>,
  tokenId: TokenId,
  transitive: boolean,
  budget: WorkBudget
): Result<readonly TokenId[]> {
  if (!tokenIds.has(tokenId)) {
    return failure(
      'graph.unknown-token',
      'resolve',
      'The requested token is not in the graph.'
    )
  }
  const neighbors = (id: TokenId): readonly TokenId[] =>
    adjacency.get(id) ?? NO_TOKEN_IDS
  if (!transitive) return success(neighbors(tokenId))

  const seen = new Set<TokenId>([tokenId])
  const result: TokenId[] = []
  let queue = [...neighbors(tokenId)]
  while (queue.length > 0) {
    const next: TokenId[] = []
    for (const id of queue) {
      if (!chargeWork(budget)) return workLimit('resolve')
      if (seen.has(id)) continue
      seen.add(id)
      result.push(id)
      next.push(...neighbors(id))
    }
    queue = [...new Set(next)].sort((left, right) => left.localeCompare(right))
  }
  return success(Object.freeze(result))
}

function queryNeighbors(
  graph: TokenGraph,
  tokenId: TokenId,
  direction: 'dependencies' | 'dependents',
  options?: DependencyQueryOptions
): Result<readonly TokenId[]> {
  if (
    options !== undefined &&
    (!isRecord(options) ||
      (options.transitive !== undefined &&
        typeof options.transitive !== 'boolean'))
  ) {
    return failure(
      'graph.invalid-query',
      'resolve',
      'Dependency options are invalid.'
    )
  }
  return queryFromAdjacency(
    new Set(graph.tokens.map(token => token.id)),
    createAdjacency(graph, direction),
    tokenId,
    options?.transitive === true,
    { remaining: MAX_OPERATION_WORK }
  )
}

export function getReferences(
  graph: TokenGraph,
  tokenId: TokenId
): Result<readonly ReferenceEdge[]> {
  try {
    if (!inputWithinWorkLimit([graph, tokenId])) return workLimit('resolve')
    if (!tokenMap(graph).has(tokenId)) {
      return failure(
        'graph.unknown-token',
        'resolve',
        'The requested token is not in the graph.'
      )
    }
    return success(
      Object.freeze(graph.references.filter(edge => edge.from === tokenId))
    )
  } catch {
    return failure(
      'graph.invalid-query',
      'resolve',
      'Core could not read the reference query.'
    )
  }
}

export function getDependencies(
  graph: TokenGraph,
  tokenId: TokenId,
  options?: DependencyQueryOptions
): Result<readonly TokenId[]> {
  try {
    if (!inputWithinWorkLimit([graph, tokenId, options])) {
      return workLimit('resolve')
    }
    return queryNeighbors(graph, tokenId, 'dependencies', options)
  } catch {
    return failure(
      'graph.invalid-query',
      'resolve',
      'Core could not read the dependency query.'
    )
  }
}

export function getDependents(
  graph: TokenGraph,
  tokenId: TokenId,
  options?: DependencyQueryOptions
): Result<readonly TokenId[]> {
  try {
    if (!inputWithinWorkLimit([graph, tokenId, options])) {
      return workLimit('resolve')
    }
    return queryNeighbors(graph, tokenId, 'dependents', options)
  } catch {
    return failure(
      'graph.invalid-query',
      'resolve',
      'Core could not read the dependent query.'
    )
  }
}

function matchesSelection(
  conditions: ContextSelection,
  selection: ContextSelection
): boolean {
  return Object.entries(conditions).every(
    ([key, value]) => selection[key] === value
  )
}

function resolveTokenWithMaps(
  tokens: ReadonlyMap<TokenId, TokenNode>,
  paths: ReadonlyMap<TokenId, readonly string[]>,
  tokenId: TokenId,
  selected: ContextSelection,
  budget: WorkBudget
): Result<ResolvedToken> {
  if (!paths.has(tokenId)) {
    return failure(
      'graph.unknown-token',
      'resolve',
      'The requested token is not in the view.'
    )
  }
  const chain: TokenId[] = []
  const directReferences: TokenId[] = []
  const visiting = new Set<TokenId>()
  let currentId = tokenId
  let resolvedToken: TokenNode | undefined
  let resolvedValue: JsonValue | undefined
  while (resolvedToken === undefined) {
    if (!chargeWork(budget)) return workLimit('resolve')
    const token = tokens.get(currentId)
    if (token === undefined || !paths.has(currentId)) {
      return failure(
        'graph.missing-reference-target',
        'resolve',
        'A referenced token is not in the view.'
      )
    }
    if (visiting.has(currentId)) {
      return failure(
        'graph.reference-cycle',
        'resolve',
        'Token references contain a cycle.',
        { tokenId: currentId }
      )
    }
    const candidates: {
      readonly authored: AuthoredTokenValue
      readonly specificity: number
    }[] = []
    for (const authored of token.values) {
      const specificity = Object.keys(authored.conditions).length
      if (!chargeWork(budget, specificity + 1)) return workLimit('resolve')
      if (matchesSelection(authored.conditions, selected)) {
        candidates.push({ authored, specificity })
      }
    }
    if (candidates.length === 0) {
      return failure(
        'graph.unresolved-value',
        'resolve',
        'The token has no value for this selection.',
        { tokenId: currentId }
      )
    }
    const score = Math.max(...candidates.map(value => value.specificity))
    const mostSpecific = candidates.filter(value => value.specificity === score)
    const priority = Math.max(
      ...mostSpecific.map(value => value.authored.priority)
    )
    const winners = mostSpecific.filter(
      value => value.authored.priority === priority
    )
    if (winners.length !== 1) {
      return failure(
        'graph.ambiguous-value',
        'resolve',
        'More than one token value matches this selection.',
        { tokenId: currentId }
      )
    }
    const winner = winners[0]!.authored
    chain.push(currentId)
    if (winner.value.kind === 'literal') {
      resolvedToken = token
      resolvedValue = winner.value.value
      continue
    }
    if (chain.length === 1) directReferences.push(winner.value.target)
    const target = tokens.get(winner.value.target)
    if (target === undefined || !paths.has(winner.value.target)) {
      return failure(
        'graph.missing-reference-target',
        'resolve',
        'A referenced token is not in the view.'
      )
    }
    if (target.type !== token.type) {
      return failure(
        'graph.reference-type-mismatch',
        'resolve',
        'A token reference points to a token with a different type.',
        { tokenId: currentId }
      )
    }
    visiting.add(currentId)
    currentId = winner.value.target
  }
  return success(
    Object.freeze({
      tokenId,
      path: paths.get(tokenId)!,
      type: resolvedToken.type,
      value: resolvedValue!,
      sourceSelection: selected,
      directReferences: Object.freeze(directReferences),
      referenceChain: Object.freeze(chain),
    })
  )
}

function resolveTokenInput(
  graph: TokenGraph,
  view: GraphView,
  tokenId: TokenId,
  selection?: ContextSelection
): Result<ResolvedToken> {
  const selected = copyConditions(selection)
  if (selected === undefined) {
    return failure(
      'graph.invalid-context-selection',
      'resolve',
      'The context selection is invalid.'
    )
  }
  return resolveTokenWithMaps(
    tokenMap(graph),
    new Map(view.tokens.map(token => [token.tokenId, token.path])),
    tokenId,
    selected,
    { remaining: MAX_OPERATION_WORK }
  )
}

export function resolveToken(
  graph: TokenGraph,
  view: GraphView,
  tokenId: TokenId,
  selection?: ContextSelection
): Result<ResolvedToken> {
  try {
    if (!inputWithinWorkLimit([graph, view, tokenId, selection])) {
      return workLimit('resolve')
    }
    return resolveTokenInput(graph, view, tokenId, selection)
  } catch {
    return failure(
      'graph.invalid-resolution-input',
      'resolve',
      'Core could not read the token resolution inputs.'
    )
  }
}

export function resolveView(
  graph: TokenGraph,
  view: GraphView,
  selection?: ContextSelection
): Result<readonly ResolvedToken[]> {
  try {
    if (!inputWithinWorkLimit([graph, view, selection])) {
      return workLimit('resolve')
    }
    const selected = copyConditions(selection)
    if (selected === undefined) {
      return failure(
        'graph.invalid-context-selection',
        'resolve',
        'The context selection is invalid.'
      )
    }
    const tokens = tokenMap(graph)
    const paths = new Map(view.tokens.map(token => [token.tokenId, token.path]))
    const output: ResolvedToken[] = []
    const budget = { remaining: MAX_OPERATION_WORK }
    for (const member of view.tokens) {
      const resolved = resolveTokenWithMaps(
        tokens,
        paths,
        member.tokenId,
        selected,
        budget
      )
      if (!resolved.ok) return resolved
      output.push(resolved.value)
    }
    return success(Object.freeze(output))
  } catch {
    return failure(
      'graph.invalid-resolution-input',
      'resolve',
      'Core could not read the view resolution inputs.'
    )
  }
}

function inspectTokenInput(
  snapshot: GraphSnapshot,
  target: TokenInspectionTarget,
  selection?: ContextSelection
): Result<TokenInspection> {
  let tokenId: TokenId | undefined
  if (target.kind === 'token-id') {
    tokenId = target.tokenId
  } else if (target.kind === 'path' && Array.isArray(target.path)) {
    const key = pathKey(target.path)
    tokenId = snapshot.view.tokens.find(
      token => pathKey(token.path) === key
    )?.tokenId
  }
  if (tokenId === undefined) {
    return failure(
      'graph.unknown-token',
      'inspect',
      'The requested token is not in the view.'
    )
  }
  const token = tokenMap(snapshot.graph).get(tokenId)
  if (token === undefined) {
    return failure(
      'graph.unknown-token',
      'inspect',
      'The requested token is not in the graph.'
    )
  }
  const dependencies = getDependencies(snapshot.graph, tokenId, {
    transitive: true,
  })
  const dependents = getDependents(snapshot.graph, tokenId, {
    transitive: true,
  })
  const resolution = resolveToken(
    snapshot.graph,
    snapshot.view,
    tokenId,
    selection
  )
  if (!dependencies.ok) return dependencies
  if (!dependents.ok) return dependents
  if (!resolution.ok) return resolution
  return success(
    Object.freeze({
      tokenId,
      path: snapshot.view.tokens.find(member => member.tokenId === tokenId)!
        .path,
      token,
      dependencies: dependencies.value,
      dependents: dependents.value,
      resolution: resolution.value,
    })
  )
}

export function inspectToken(
  snapshot: GraphSnapshot,
  target: TokenInspectionTarget,
  selection?: ContextSelection
): Result<TokenInspection> {
  try {
    if (!inputWithinWorkLimit([snapshot, target, selection])) {
      return workLimit('inspect')
    }
    return inspectTokenInput(snapshot, target, selection)
  } catch {
    return failure(
      'graph.invalid-inspection-input',
      'inspect',
      'Core could not read the token inspection inputs.'
    )
  }
}

function stableShape(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'undefined' : JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableShape).join(',')}]`
  }
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map(
      key => `${JSON.stringify(key)}:${stableShape(Reflect.get(value, key))}`
    )
    .join(',')}}`
}

function tokenShape(token: TokenNode): string {
  return stableShape({
    sourceId: token.sourceId,
    groupId: token.groupId,
    name: token.name,
    path: token.path,
    type: token.type,
    values: token.values,
  })
}

function diffGraphViewsInput(
  before: GraphSnapshot,
  after: GraphSnapshot
): Result<GraphDiff> {
  if (before.view.id !== after.view.id) {
    return failure(
      'graph.snapshot-view-mismatch',
      'diff',
      'Graph snapshots must use the same view ID.'
    )
  }
  const beforeTokens = tokenMap(before.graph)
  const afterTokens = tokenMap(after.graph)
  const beforeTokenIds = new Set(beforeTokens.keys())
  const afterTokenIds = new Set(afterTokens.keys())
  const beforeDependents = createAdjacency(before.graph, 'dependents')
  const afterDependents = createAdjacency(after.graph, 'dependents')
  const budget = { remaining: MAX_OPERATION_WORK }
  const ids = [
    ...new Set([...beforeTokens.keys(), ...afterTokens.keys()]),
  ].sort((left, right) => left.localeCompare(right))
  const changes: GraphDiff['changes'][number][] = []
  for (const tokenId of ids) {
    const oldToken = beforeTokens.get(tokenId)
    const newToken = afterTokens.get(tokenId)
    const kind =
      oldToken === undefined
        ? 'added'
        : newToken === undefined
          ? 'removed'
          : tokenShape(oldToken) === tokenShape(newToken)
            ? undefined
            : 'changed'
    if (kind === undefined) continue
    const impact = queryFromAdjacency(
      kind === 'removed' ? beforeTokenIds : afterTokenIds,
      kind === 'removed' ? beforeDependents : afterDependents,
      tokenId,
      true,
      budget
    )
    if (!impact.ok) return impact
    changes.push(
      Object.freeze({
        kind,
        tokenId,
        impactedTokenIds: impact.value,
      })
    )
  }
  return success(Object.freeze({ changes: Object.freeze(changes) }))
}

export function diffGraphViews(
  before: GraphSnapshot,
  after: GraphSnapshot
): Result<GraphDiff> {
  try {
    if (!inputWithinWorkLimit([before, after])) return workLimit('diff')
    return diffGraphViewsInput(before, after)
  } catch {
    return failure(
      'graph.invalid-diff-input',
      'diff',
      'Core could not read the graph snapshots.'
    )
  }
}
