import type {
  GraphSnapshot,
  GraphViewId,
  TokenId,
  TokenNode,
} from '../graph/types'
import { MAX_GRAPH_QUALIFIED_ID_LENGTH } from '../graph/limits'
import type {
  Policy,
  PolicyEvaluationOptions,
  PolicyFinding,
  PolicyFindingId,
  PolicyLayer,
  PolicyOwnership,
  PolicyReport,
  PolicyResult,
  PolicyRuleId,
  PolicyValueRule,
} from './types'

const NO_DIAGNOSTICS = Object.freeze([]) as readonly []
const NO_NAMES = Object.freeze([]) as readonly string[]
const MAX_INPUT_TEXT = 1_000_000
const MAX_OPERATION_WORK = 1_000_000
const MAX_ROOTS = 256
const MAX_OWNERS = 256
const MAX_FINDING_ID_LENGTH = 65_536
const MAX_FINDINGS = 100_000

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
    remaining -= typeof value === 'string' ? value.length + 1 : 1
    if (remaining < 0) {
      return false
    }
    if (value === null || typeof value !== 'object') {
      continue
    }
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    if (Array.isArray(value)) {
      const length: unknown = Reflect.get(value, 'length')
      if (
        typeof length !== 'number' ||
        !Number.isSafeInteger(length) ||
        length < 0
      ) {
        return false
      }
      remaining -= length
      if (remaining < 0) {
        return false
      }
      for (let index = 0; index < length; index += 1) {
        stack.push(Reflect.get(value, index))
      }
      continue
    }
    for (const key of Object.keys(value)) {
      remaining -= key.length + 1
      if (remaining < 0) {
        return false
      }
      stack.push(Reflect.get(value, key))
    }
  }
  return true
}

function success<Value>(value: Value): PolicyResult<Value> {
  return Object.freeze({
    ok: true as const,
    value,
    diagnostics: NO_DIAGNOSTICS,
  })
}

function failure<Value>(code: string, message: string): PolicyResult<Value> {
  const diagnostic = Object.freeze({ code, phase: 'policy' as const, message })
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic] as const),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isArray(value: unknown): boolean {
  return Array.isArray(value)
}

function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !hasControlCharacter(value)
  )
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function isPlainKey(value: string): boolean {
  return (
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype'
  )
}

function isTokenId(value: unknown): value is TokenId {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_GRAPH_QUALIFIED_ID_LENGTH &&
    value.startsWith('source:') &&
    value.includes('/token:') &&
    !hasControlCharacter(value)
  )
}

function copyNames(
  value: unknown,
  maximum: number
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > maximum) {
    return undefined
  }
  const output: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isName(item) || seen.has(item)) {
      return undefined
    }
    seen.add(item)
    output.push(item)
  }
  return Object.freeze(output)
}

function isValueRule(value: unknown): value is PolicyValueRule {
  return value === 'literal' || value === 'reference' || value === 'either'
}

function copyOwnership(value: unknown): PolicyOwnership | undefined {
  if (value === undefined) {
    return Object.freeze({ default: NO_NAMES, paths: Object.freeze({}) })
  }
  if (!isRecord(value)) {
    return undefined
  }
  const defaultOwners =
    value.default === undefined
      ? NO_NAMES
      : copyNames(value.default, MAX_OWNERS)
  if (defaultOwners === undefined) {
    return undefined
  }
  const pathsInput = value.paths
  if (pathsInput !== undefined && !isRecord(pathsInput)) {
    return undefined
  }
  const pathsRecord = pathsInput ?? {}
  const pathKeys = Object.keys(pathsRecord)
  if (pathKeys.length > MAX_ROOTS) {
    return undefined
  }
  const paths: Record<string, readonly string[]> = Object.create(null)
  for (const root of pathKeys) {
    if (!isPlainKey(root) || !isName(root)) {
      return undefined
    }
    const owners = copyNames(Reflect.get(pathsRecord, root), MAX_OWNERS)
    if (owners === undefined) {
      return undefined
    }
    Object.defineProperty(paths, root, {
      value: owners,
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  return Object.freeze({ default: defaultOwners, paths: Object.freeze(paths) })
}

function createPolicyInput(input: unknown): PolicyResult<Policy> {
  if (
    !isRecord(input) ||
    !isName(input.id) ||
    !isName(input.viewId) ||
    !Array.isArray(input.layers) ||
    input.layers.length < 1 ||
    input.layers.length > 4
  ) {
    return failure(
      'policy.invalid-config',
      'A policy needs an ID, a view ID, and one to four layers.'
    )
  }

  const layers: PolicyLayer[] = []
  const layerIds = new Set<string>()
  const roots = new Set<string>()
  for (const candidate of input.layers) {
    if (!isRecord(candidate) || !isName(candidate.id)) {
      return failure('policy.invalid-layer', 'A policy layer is invalid.')
    }
    if (layerIds.has(candidate.id)) {
      return failure(
        'policy.duplicate-layer',
        'Each policy layer needs a unique ID.'
      )
    }
    const layerRoots = copyNames(candidate.roots, MAX_ROOTS)
    const references = copyNames(candidate.references, 4)
    if (
      layerRoots === undefined ||
      layerRoots.length === 0 ||
      references === undefined ||
      !isValueRule(candidate.values)
    ) {
      return failure('policy.invalid-layer', 'A policy layer is invalid.')
    }
    for (const root of layerRoots) {
      if (roots.has(root)) {
        return failure(
          'policy.duplicate-root',
          'Each layer root must appear once.'
        )
      }
      roots.add(root)
    }
    layerIds.add(candidate.id)
    layers.push(
      Object.freeze({
        id: candidate.id,
        roots: layerRoots,
        values: candidate.values,
        references,
      })
    )
  }

  for (const layer of layers) {
    for (const reference of layer.references) {
      if (!layerIds.has(reference)) {
        return failure(
          'policy.unknown-layer',
          'A reference rule names a missing layer.'
        )
      }
    }
  }

  const ownership = copyOwnership(input.ownership)
  if (ownership === undefined) {
    return failure('policy.invalid-ownership', 'Policy owners are invalid.')
  }
  for (const root of Object.keys(ownership.paths)) {
    if (!roots.has(root)) {
      return failure(
        'policy.unknown-owner-root',
        'An owner path names a missing layer root.'
      )
    }
  }

  return success(
    Object.freeze({
      id: input.id,
      viewId: input.viewId as GraphViewId,
      layers: Object.freeze(layers),
      ownership,
    })
  )
}

/** Checks and copies a policy configuration. */
export function createPolicy(input: unknown): PolicyResult<Policy> {
  try {
    if (!inputWithinWorkLimit(input)) {
      return failure(
        'policy.work-limit',
        'Policy input exceeds the 1,000,000-unit work limit.'
      )
    }
    return createPolicyInput(input)
  } catch {
    return failure('policy.invalid-config', 'Core could not read the policy.')
  }
}

/** Reads a policy from JSON or an object. */
export function parsePolicy(input: unknown): PolicyResult<Policy> {
  try {
    if (typeof input === 'string') {
      if (input.length > MAX_INPUT_TEXT) {
        return failure(
          'policy.input-limit',
          'Policy JSON exceeds the 1,000,000-character limit.'
        )
      }
      const parsed: unknown = JSON.parse(input)
      if (!inputWithinWorkLimit(parsed)) {
        return failure(
          'policy.work-limit',
          'Policy input exceeds the 1,000,000-unit work limit.'
        )
      }
      return createPolicyInput(parsed)
    }
    return createPolicy(input)
  } catch {
    return failure('policy.invalid-json', 'Policy JSON is invalid.')
  }
}

function findingId(
  ruleId: PolicyRuleId,
  tokenId: TokenId,
  targetTokenId?: TokenId
): PolicyFindingId {
  return `${ruleId}:${encodeURIComponent(tokenId)}${
    targetTokenId === undefined ? '' : `:${encodeURIComponent(targetTokenId)}`
  }` as PolicyFindingId
}

function layerByRoot(policy: Policy): Map<string, PolicyLayer> {
  const output = new Map<string, PolicyLayer>()
  for (const layer of policy.layers) {
    for (const root of layer.roots) {
      output.set(root, layer)
    }
  }
  return output
}

interface PolicyToken {
  readonly token: TokenNode
  readonly path: readonly string[]
}

function tokenPathKey(path: readonly string[]): string {
  return path.join('\u0000')
}

function compareTokens(left: PolicyToken, right: PolicyToken): number {
  const leftPath = tokenPathKey(left.path)
  const rightPath = tokenPathKey(right.path)
  if (leftPath < rightPath) {
    return -1
  }
  if (leftPath > rightPath) {
    return 1
  }
  if (left.token.id < right.token.id) {
    return -1
  }
  if (left.token.id > right.token.id) {
    return 1
  }
  return 0
}

function makeFinding(input: {
  readonly ruleId: PolicyRuleId
  readonly token: TokenNode
  readonly path: readonly string[]
  readonly message: string
  readonly owners: readonly string[]
  readonly baseline: ReadonlySet<string>
  readonly layerId?: string
  readonly targetTokenId?: TokenId
}): PolicyFinding {
  const id = findingId(input.ruleId, input.token.id, input.targetTokenId)
  return Object.freeze({
    findingId: id,
    ruleId: input.ruleId,
    tokenId: input.token.id,
    path: Object.freeze([...input.path]),
    message: input.message,
    owners: input.owners,
    disposition: input.baseline.has(id) ? 'baseline' : 'active',
    ...(input.layerId === undefined ? {} : { layerId: input.layerId }),
    ...(input.targetTokenId === undefined
      ? {}
      : { targetTokenId: input.targetTokenId }),
  })
}

function appendFinding(
  findings: PolicyFinding[],
  input: Parameters<typeof makeFinding>[0],
  budget: WorkBudget
): boolean {
  const finding = makeFinding(input)
  const ownerWork = finding.owners.reduce(
    (total, owner) => total + owner.length + 1,
    0
  )
  const pathWork = finding.path.reduce(
    (total, segment) => total + segment.length + 1,
    0
  )
  if (
    !chargeWork(
      budget,
      finding.findingId.length + finding.message.length + ownerWork + pathWork
    )
  ) {
    return false
  }
  findings.push(finding)
  return true
}

function baselineSet(
  options: unknown,
  budget: WorkBudget
): PolicyResult<ReadonlySet<string>> {
  if (options === undefined) {
    return success(new Set())
  }
  if (!isRecord(options)) {
    return failure('policy.invalid-options', 'Policy options are invalid.')
  }
  const baseline = options.baseline
  if (baseline === undefined) {
    return success(new Set())
  }
  if (!Array.isArray(baseline) || baseline.length > MAX_FINDINGS) {
    return failure('policy.invalid-baseline', 'The policy baseline is invalid.')
  }
  const output = new Set<string>()
  for (const item of baseline) {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > MAX_FINDING_ID_LENGTH ||
      !/^PT100[1345]:/u.test(item) ||
      output.has(item)
    ) {
      return failure(
        'policy.invalid-baseline',
        'The policy baseline is invalid.'
      )
    }
    if (!chargeWork(budget, item.length + 1)) {
      return failure(
        'policy.work-limit',
        'Policy evaluation exceeds the 1,000,000-unit work limit.'
      )
    }
    output.add(item)
  }
  return success(output)
}

function evaluatePolicyInput(
  snapshot: GraphSnapshot,
  policy: Policy,
  options?: PolicyEvaluationOptions
): PolicyResult<PolicyReport> {
  const checkedPolicy = createPolicy(policy)
  if (!checkedPolicy.ok) {
    return checkedPolicy
  }
  const selectedPolicy = checkedPolicy.value
  if (snapshot.view.id !== selectedPolicy.viewId) {
    return failure(
      'policy.view-mismatch',
      'The policy and graph snapshot use different view IDs.'
    )
  }
  const graphTokens: readonly TokenNode[] = snapshot.graph.tokens
  const viewTokens = snapshot.view.tokens
  if (
    !isArray(graphTokens) ||
    !isArray(viewTokens) ||
    graphTokens.length > 100_000 ||
    viewTokens.length > 100_000
  ) {
    return failure('policy.invalid-snapshot', 'The graph snapshot is invalid.')
  }
  const budget: WorkBudget = { remaining: MAX_OPERATION_WORK }
  const checkedBaseline = baselineSet(options, budget)
  if (!checkedBaseline.ok) {
    return checkedBaseline
  }
  const baseline = checkedBaseline.value
  const graphTokensById = new Map(graphTokens.map(token => [token.id, token]))
  const viewTokensById = new Map<TokenId, PolicyToken>()
  const viewPaths = new Set<string>()
  for (const item of viewTokens) {
    if (
      !isRecord(item) ||
      !isTokenId(item.tokenId) ||
      !Array.isArray(item.path) ||
      item.path.length === 0 ||
      item.path.some(segment => !isName(segment)) ||
      viewTokensById.has(item.tokenId as TokenId)
    ) {
      return failure(
        'policy.invalid-snapshot',
        'The graph snapshot is invalid.'
      )
    }
    const path = Object.freeze([...(item.path as string[])])
    const pathKey = tokenPathKey(path)
    const token = graphTokensById.get(item.tokenId as TokenId)
    if (token === undefined || viewPaths.has(pathKey)) {
      return failure(
        'policy.invalid-snapshot',
        'The graph snapshot is invalid.'
      )
    }
    if (
      !chargeWork(
        budget,
        item.tokenId.length +
          path.reduce((total, segment) => total + segment.length + 1, 1)
      )
    ) {
      return failure(
        'policy.work-limit',
        'Policy evaluation exceeds the 1,000,000-unit work limit.'
      )
    }
    viewTokensById.set(item.tokenId as TokenId, Object.freeze({ token, path }))
    viewPaths.add(pathKey)
  }
  for (const { token } of viewTokensById.values()) {
    for (const authored of token.values) {
      if (!chargeWork(budget)) {
        return failure(
          'policy.work-limit',
          'Policy evaluation exceeds the 1,000,000-unit work limit.'
        )
      }
      if (
        authored.value.kind === 'reference' &&
        !viewTokensById.has(authored.value.target)
      ) {
        return failure(
          'policy.invalid-snapshot',
          'The graph snapshot is invalid.'
        )
      }
    }
  }
  const tokens = [...viewTokensById.values()].sort(compareTokens)
  const roots = layerByRoot(selectedPolicy)
  const findings: PolicyFinding[] = []
  for (const selectedToken of tokens) {
    const { token, path } = selectedToken
    const tokenWork =
      token.id.length +
      token.values.length +
      path.reduce((total, segment) => total + segment.length + 1, 1)
    if (!chargeWork(budget, tokenWork)) {
      return failure(
        'policy.work-limit',
        'Policy evaluation exceeds the 1,000,000-unit work limit.'
      )
    }
    const root = path[0]
    const layer = root === undefined ? undefined : roots.get(root)
    const owners =
      root === undefined
        ? selectedPolicy.ownership.default
        : (selectedPolicy.ownership.paths[root] ??
          selectedPolicy.ownership.default)

    if (layer === undefined) {
      if (
        !appendFinding(
          findings,
          {
            ruleId: 'PT1001',
            token,
            path,
            message: 'Token path does not match a policy layer.',
            owners,
            baseline,
          },
          budget
        )
      ) {
        return failure(
          'policy.work-limit',
          'Policy evaluation exceeds the 1,000,000-unit work limit.'
        )
      }
    } else {
      const hasLiteral = token.values.some(
        value => value.value.kind === 'literal'
      )
      const hasReference = token.values.some(
        value => value.value.kind === 'reference'
      )
      if (
        (layer.values === 'literal' && hasReference) ||
        (layer.values === 'reference' && hasLiteral)
      ) {
        if (
          !appendFinding(
            findings,
            {
              ruleId: 'PT1003',
              token,
              path,
              message: `Layer ${layer.id} does not allow this token value form.`,
              owners,
              baseline,
              layerId: layer.id,
            },
            budget
          )
        ) {
          return failure(
            'policy.work-limit',
            'Policy evaluation exceeds the 1,000,000-unit work limit.'
          )
        }
      }
      const targets = new Set<TokenId>()
      for (const authored of token.values) {
        if (authored.value.kind === 'reference') {
          targets.add(authored.value.target)
        }
      }
      for (const targetId of targets) {
        const target = viewTokensById.get(targetId)
        if (target === undefined) {
          return failure(
            'policy.invalid-snapshot',
            'The graph snapshot is invalid.'
          )
        }
        const targetRoot = target.path[0]
        const targetLayer =
          targetRoot === undefined ? undefined : roots.get(targetRoot)
        if (
          targetLayer === undefined ||
          !layer.references.includes(targetLayer.id)
        ) {
          if (
            !appendFinding(
              findings,
              {
                ruleId: 'PT1004',
                token,
                path,
                message:
                  targetLayer === undefined
                    ? `Layer ${layer.id} cannot reference an unassigned token.`
                    : `Layer ${layer.id} cannot reference layer ${targetLayer.id}.`,
                owners,
                baseline,
                layerId: layer.id,
                targetTokenId: targetId,
              },
              budget
            )
          ) {
            return failure(
              'policy.work-limit',
              'Policy evaluation exceeds the 1,000,000-unit work limit.'
            )
          }
        }
      }
    }

    if (owners.length === 0) {
      if (
        !appendFinding(
          findings,
          {
            ruleId: 'PT1005',
            token,
            path,
            message: 'Token has no owner.',
            owners,
            baseline,
            ...(layer === undefined ? {} : { layerId: layer.id }),
          },
          budget
        )
      ) {
        return failure(
          'policy.work-limit',
          'Policy evaluation exceeds the 1,000,000-unit work limit.'
        )
      }
    }
  }

  const active = findings.filter(
    finding => finding.disposition === 'active'
  ).length
  return success(
    Object.freeze({
      policyId: selectedPolicy.id,
      viewId: selectedPolicy.viewId,
      findings: Object.freeze(findings),
      summary: Object.freeze({ active, baseline: findings.length - active }),
    })
  )
}

/** Checks one graph view against a policy. */
export function evaluatePolicy(
  snapshot: GraphSnapshot,
  policy: Policy,
  options?: PolicyEvaluationOptions
): PolicyResult<PolicyReport> {
  try {
    if (!inputWithinWorkLimit([snapshot, policy, options])) {
      return failure(
        'policy.work-limit',
        'Policy evaluation input exceeds the 1,000,000-unit work limit.'
      )
    }
    return evaluatePolicyInput(snapshot, policy, options)
  } catch {
    return failure(
      'policy.invalid-input',
      'Core could not read the policy evaluation input.'
    )
  }
}
