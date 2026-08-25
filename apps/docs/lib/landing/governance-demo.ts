import {
  composeGraph,
  createSourceView,
  diffGraphViews,
  getDependents,
  inspectToken,
  type TokenId,
} from '@primitree/core'
import {
  createPolicy,
  evaluatePolicy,
  type PolicyFinding,
} from '@primitree/core/policy'
import {
  buildDTCGOutputs,
  createDTCGGraphFragment,
  type BuildOutputOptions,
  type DTCGDocument,
  type DTCGOutputSet,
} from '@primitree/dtcg'

export type DemoLayerId = 'primitives' | 'semantic' | 'component'

export interface GovernanceBranch {
  readonly path: string
}

export interface GovernanceDemo {
  readonly tokenPath: string
  readonly aliasTarget: string
  readonly resolvedValue: string
  readonly owner: string
  readonly directDependents: readonly GovernanceBranch[]
  readonly compliant: {
    readonly status: 'PASS'
    readonly findings: number
  }
  readonly blocked: {
    readonly status: 'BLOCK'
    readonly ruleId: 'PT1004'
    readonly reason: string
    readonly findingCount: number
  }
  readonly outputs: readonly string[]
  readonly tokenCount: number
  readonly layerCount: number
}

export interface GraphNode {
  readonly slot: string
  readonly path: string
  readonly label: string
  readonly layer: DemoLayerId
  readonly kind: 'literal' | 'reference'
  readonly display: string
  readonly swatch: string | null
  readonly owner: string
  readonly consumers: number
  readonly finding: string | null
  readonly change: 'added' | 'changed' | null
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  readonly violation: boolean
}

export interface ProposalOutcome {
  readonly id: 'baseline' | 'alias' | 'violation' | 'rename'
  readonly label: string
  readonly status: 'PASS' | 'FAIL'
  readonly findingsLine: string
  readonly verdictTone: 'pass' | 'fail'
  readonly detail: string
  readonly description: string
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
}

export interface RenameImpact {
  readonly removedPath: string
  readonly addedPath: string
  readonly consumers: readonly string[]
}

export interface ProposalDeck {
  readonly outcomes: readonly ProposalOutcome[]
  readonly diffReport: readonly string[]
  readonly renameImpact: RenameImpact
}

const tokenPath = 'semantic.color.bg.brand'
const aliasTarget = 'primitives.color.blue.500'
const expectedDependents = [
  'component.button.bg',
  'component.focus.ring',
  'component.nav.active.bg',
]

const srgb = (components: readonly [number, number, number]) =>
  ({
    $type: 'color',
    $value: { colorSpace: 'srgb', components: [...components], alpha: 1 },
  }) as const

const px = (value: number) =>
  ({ $type: 'dimension', $value: { value, unit: 'px' } }) as const

const colorRef = (target: string) =>
  ({ $type: 'color', $value: `{${target}}` }) as const

const dimensionRef = (target: string) =>
  ({ $type: 'dimension', $value: `{${target}}` }) as const

const compliantDocument = {
  primitives: {
    color: {
      blue: { '500': srgb([0.2, 0.4, 1]) },
      green: { '500': srgb([0.203922, 0.827451, 0.6]) },
      gray: {
        '900': srgb([0.066667, 0.094118, 0.152941]),
        '50': srgb([0.976471, 0.980392, 0.984314]),
      },
    },
    radius: { md: px(6) },
    space: { '4': px(16) },
  },
  semantic: {
    color: {
      bg: { brand: colorRef('primitives.color.blue.500') },
      fg: { default: colorRef('primitives.color.gray.900') },
    },
    radius: { control: dimensionRef('primitives.radius.md') },
    space: { inset: dimensionRef('primitives.space.4') },
  },
  component: {
    button: {
      bg: colorRef('semantic.color.bg.brand'),
      radius: dimensionRef('semantic.radius.control'),
    },
    focus: { ring: colorRef('semantic.color.bg.brand') },
    nav: { active: { bg: colorRef('semantic.color.bg.brand') } },
    card: { inset: dimensionRef('semantic.space.inset') },
  },
} satisfies DTCGDocument

const aliasDocument = {
  ...compliantDocument,
  semantic: {
    ...compliantDocument.semantic,
    color: {
      ...compliantDocument.semantic.color,
      bg: { brand: colorRef('primitives.color.green.500') },
    },
  },
} as const

const violationDocument = {
  ...compliantDocument,
  component: {
    ...compliantDocument.component,
    button: {
      ...compliantDocument.component.button,
      bg: colorRef('primitives.color.blue.500'),
    },
    focus: { ring: colorRef('primitives.color.green.500') },
    card: { inset: dimensionRef('primitives.space.4') },
  },
} as const

const renameDocument = {
  ...compliantDocument,
  semantic: {
    ...compliantDocument.semantic,
    color: {
      ...compliantDocument.semantic.color,
      bg: { primary: colorRef('primitives.color.blue.500') },
    },
  },
  component: {
    ...compliantDocument.component,
    button: {
      ...compliantDocument.component.button,
      bg: colorRef('semantic.color.bg.primary'),
    },
    focus: { ring: colorRef('semantic.color.bg.primary') },
    nav: { active: { bg: colorRef('semantic.color.bg.primary') } },
  },
} as const

/** Row order for each graph column. Slots keep node positions stable while a
 * proposal swaps one path, so a rename reads as motion in place. */
const graphSlots: readonly (readonly [DemoLayerId, readonly string[]])[] = [
  [
    'primitives',
    [
      'primitives.color.blue.500',
      'primitives.color.green.500',
      'primitives.color.gray.900',
      'primitives.color.gray.50',
      'primitives.radius.md',
      'primitives.space.4',
    ],
  ],
  [
    'semantic',
    [
      'semantic.color.bg.brand',
      'semantic.color.fg.default',
      'semantic.radius.control',
      'semantic.space.inset',
    ],
  ],
  [
    'component',
    [
      'component.button.bg',
      'component.focus.ring',
      'component.nav.active.bg',
      'component.button.radius',
      'component.card.inset',
    ],
  ],
]

const renameSlotPaths = new Map([
  ['semantic.color.bg.brand', 'semantic.color.bg.primary'],
])

const policyInput = {
  id: 'living-canopy',
  viewId: 'living-canopy',
  layers: [
    {
      id: 'primitives',
      roots: ['primitives'],
      values: 'literal',
      references: [],
    },
    {
      id: 'semantic',
      roots: ['semantic'],
      values: 'reference',
      references: ['primitives'],
    },
    {
      id: 'component',
      roots: ['component'],
      values: 'reference',
      references: ['semantic'],
    },
  ],
  ownership: {
    default: ['design-systems'],
    paths: { semantic: ['product-design'] },
  },
} as const

const outputSet: DTCGOutputSet = {
  files: { 'living-canopy.tokens.json': compliantDocument },
  resolver: {
    version: '2025.10',
    sets: {
      brand: {
        sources: [{ $ref: 'living-canopy.tokens.json' }],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/brand' }],
  },
  resolverFileName: 'tokens.resolver.json',
}

const outputLabelByPath = new Map([
  ['css/tokens.css', 'CSS'],
  ['css/tokens.tailwind.css', 'Tailwind'],
  ['ts/tokens.ts', 'TypeScript'],
])

type BuildResult<Value> =
  | {
      readonly ok: true
      readonly value: Value
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly { readonly message: string }[]
    }

function requireBuildValue<Value>(
  result: BuildResult<Value>,
  operation: string
): Value {
  if (!result.ok) {
    throw new Error(
      `Governance demo ${operation} failed: ${result.diagnostics.map(item => item.message).join(' ')}`
    )
  }
  return result.value
}

function requirePath(
  paths: ReadonlyMap<TokenId, readonly string[]>,
  tokenId: TokenId,
  context: string
): string {
  const path = paths.get(tokenId)
  if (path === undefined) {
    throw new Error(`Governance demo expected ${context} in the source view.`)
  }
  return path.join('.')
}

function resolveSrgbHex(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('colorSpace' in value) ||
    !('components' in value) ||
    !('alpha' in value) ||
    value.colorSpace !== 'srgb' ||
    !Array.isArray(value.components) ||
    value.components.length !== 3 ||
    value.alpha !== 1
  ) {
    throw new Error(
      'Governance demo expected the token to resolve to an opaque sRGB color.'
    )
  }
  const channels = value.components.map(component => {
    if (typeof component !== 'number' || component < 0 || component > 1) {
      throw new Error(
        'Governance demo expected the resolved sRGB color to have numeric channels.'
      )
    }
    return Math.round(component * 255)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

function isSrgbColor(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'colorSpace' in value &&
    'components' in value
  )
}

function resolveDisplayValue(value: unknown): string {
  if (isSrgbColor(value)) {
    return resolveSrgbHex(value)
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string'
  ) {
    return `${value.value}${value.unit}`
  }
  throw new Error('Governance demo expected a color or dimension value.')
}

/** Reference targets drop the layer root and a leading color group, the way
 * the graph abbreviates them: primitives.color.blue.500 reads as blue.500 and
 * semantic.color.bg.brand reads as bg.brand. */
function abbreviate(path: string): string {
  return path
    .split('.')
    .slice(1)
    .join('.')
    .replace(/^color\./u, '')
}

/** Node labels drop the layer root; primitive labels abbreviate further so
 * color scales read as blue.500. */
function nodeLabel(path: string, layer: DemoLayerId): string {
  return layer === 'primitives'
    ? abbreviate(path)
    : path.split('.').slice(1).join('.')
}

function buildSnapshot(document: unknown) {
  const fragment = requireBuildValue(
    createDTCGGraphFragment(document, { source: 'living-canopy' }),
    'DTCG graph creation'
  )
  const graph = requireBuildValue(composeGraph([fragment]), 'graph composition')
  const view = requireBuildValue(
    createSourceView(graph, { id: 'living-canopy' }),
    'source-view creation'
  )
  return { graph, view }
}

type Snapshot = ReturnType<typeof buildSnapshot>

function buildOutputLabels(
  outputOptions: BuildOutputOptions
): readonly string[] {
  const generatedFiles = buildDTCGOutputs(outputSet, outputOptions).files
  const labels = generatedFiles.flatMap(file => {
    const label = outputLabelByPath.get(file.path)
    return label === undefined ? [] : [label]
  })
  return Object.freeze(labels)
}

function ownerForPath(path: string): string {
  const roots = policyInput.ownership.paths
  for (const [root, owners] of Object.entries(roots)) {
    if (path === root || path.startsWith(`${root}.`)) {
      const owner = owners[0]
      if (owner !== undefined) {
        return owner
      }
    }
  }
  const fallback = policyInput.ownership.default[0]
  if (fallback === undefined) {
    throw new Error('Governance demo expected a default owner.')
  }
  return fallback
}

function buildGraphProjection(
  snapshot: Snapshot,
  findings: readonly PolicyFinding[],
  changesByPath: ReadonlyMap<string, 'added' | 'changed'>
): { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] } {
  const paths = new Map(
    snapshot.view.tokens.map(token => [token.tokenId, token.path])
  )
  const slotByPath = new Map<string, string>()
  const findingByPath = new Map(
    findings.map(finding => [finding.path.join('.'), finding.ruleId])
  )

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const [layer, slots] of graphSlots) {
    for (const slot of slots) {
      const path = renameSlotPaths.get(slot) ?? slot
      const resolvedPath = snapshot.view.tokens.some(
        token => token.path.join('.') === path
      )
        ? path
        : slot
      slotByPath.set(resolvedPath, slot)

      const inspection = requireBuildValue(
        inspectToken(snapshot, {
          kind: 'path',
          path: resolvedPath.split('.'),
        }),
        `inspection of ${resolvedPath}`
      )
      const chain = inspection.resolution.referenceChain
      const kind = chain.length > 1 ? 'reference' : 'literal'
      const resolvedDisplay = resolveDisplayValue(inspection.resolution.value)
      const dependents = requireBuildValue(
        getDependents(snapshot.graph, inspection.tokenId),
        `dependents of ${resolvedPath}`
      )

      let display = resolvedDisplay
      if (kind === 'reference') {
        const targetId = chain[1]
        if (targetId === undefined) {
          throw new Error(
            `Governance demo expected a direct target for ${resolvedPath}.`
          )
        }
        const targetPath = requirePath(paths, targetId, 'reference target')
        display = `→ {${abbreviate(targetPath)}}`
        edges.push({
          from: targetPath,
          to: resolvedPath,
          violation: findingByPath.has(resolvedPath),
        })
      }

      nodes.push({
        slot,
        path: resolvedPath,
        label: nodeLabel(resolvedPath, layer),
        layer,
        kind,
        display,
        swatch:
          kind === 'literal' && isSrgbColor(inspection.resolution.value)
            ? resolvedDisplay
            : null,
        owner: ownerForPath(resolvedPath),
        consumers: dependents.length,
        finding: findingByPath.get(resolvedPath) ?? null,
        change: changesByPath.get(resolvedPath) ?? null,
      })
    }
  }

  const slottedEdges = edges.map(edge => {
    const from = slotByPath.get(edge.from)
    const to = slotByPath.get(edge.to)
    if (from === undefined || to === undefined) {
      throw new Error('Governance demo expected every edge to land in a slot.')
    }
    return Object.freeze({ from, to, violation: edge.violation })
  })

  return {
    nodes: Object.freeze(nodes.map(node => Object.freeze(node))),
    edges: Object.freeze(slottedEdges),
  }
}

function evaluateFindings(snapshot: Snapshot): readonly PolicyFinding[] {
  const policy = requireBuildValue(createPolicy(policyInput), 'policy creation')
  const report = requireBuildValue(
    evaluatePolicy(snapshot, policy),
    'policy evaluation'
  )
  return report.findings.filter(finding => finding.disposition === 'active')
}

function buildDiffReport(
  before: Snapshot,
  after: Snapshot
): { lines: readonly string[]; changeCount: number; impactedCount: number } {
  const paths = new Map<TokenId, string>()
  for (const token of [...before.view.tokens, ...after.view.tokens]) {
    paths.set(token.tokenId, token.path.join('.'))
  }
  const diff = requireBuildValue(diffGraphViews(before, after), 'rename diff')
  const describe = (tokenId: TokenId) => {
    const path = paths.get(tokenId)
    if (path === undefined) {
      throw new Error('Governance demo expected a path for every diff token.')
    }
    return path
  }
  const impacted = new Set<string>()
  const lines: string[] = [
    '$ primitree diff tokens.before.json tokens.json --config primitree.config.ts',
    '',
    `Diff found ${diff.changes.length} token changes.`,
  ]
  for (const change of diff.changes) {
    lines.push(`${change.kind} ${describe(change.tokenId)}`)
    if (change.impactedTokenIds.length === 0) {
      lines.push('  Affected tokens: none')
    } else {
      const impactedPaths = change.impactedTokenIds.map(impactedId => {
        const impactedPath = describe(impactedId)
        impacted.add(impactedPath)
        return impactedPath
      })
      lines.push(`  Affected tokens: ${impactedPaths.join(', ')}`)
    }
  }
  lines.push('New findings: 0 · Resolved findings: 0')
  return {
    lines: Object.freeze(lines),
    changeCount: diff.changes.length,
    impactedCount: impacted.size,
  }
}

/** Renders the policy layers as the config excerpt the quickstart shows. */
export function describeLayersSnippet(): string {
  const lines = policyInput.layers.map((layer, index) => {
    const parts = [`id: '${layer.id}'`]
    if (layer.values === 'literal') {
      parts.push("values: 'literal'")
    }
    if (layer.references.length > 0) {
      parts.push(
        `references: [${layer.references.map(reference => `'${reference}'`).join(', ')}]`
      )
    }
    const comma = index === policyInput.layers.length - 1 ? '' : ','
    return `  { ${parts.join(', ')} }${comma}`
  })
  return `// primitree.config.ts\nlayers: [\n${lines.join('\n')}\n]`
}

/** Builds the serializable evidence projection for the homepage. */
export function createGovernanceDemo(
  outputOptions: BuildOutputOptions = {}
): GovernanceDemo {
  const compliantSnapshot = buildSnapshot(compliantDocument)
  const inspection = requireBuildValue(
    inspectToken(compliantSnapshot, {
      kind: 'path',
      path: tokenPath.split('.'),
    }),
    'brand-token inspection'
  )
  const paths = new Map(
    compliantSnapshot.view.tokens.map(token => [token.tokenId, token.path])
  )
  const inspectedPath = inspection.path.join('.')
  const targetId = inspection.resolution.referenceChain[1]
  if (inspectedPath !== tokenPath || targetId === undefined) {
    throw new Error('Governance demo expected the brand token alias topology.')
  }
  const inspectedAliasTarget = requirePath(
    paths,
    targetId,
    'brand alias target'
  )
  if (inspectedAliasTarget !== aliasTarget) {
    throw new Error('Governance demo expected the brand token alias target.')
  }
  const dependentIds = requireBuildValue(
    getDependents(compliantSnapshot.graph, inspection.tokenId),
    'direct-dependent lookup'
  )
  const directDependents = dependentIds
    .map(tokenId => requirePath(paths, tokenId, 'direct dependent'))
    .sort()
  if (
    directDependents.length !== expectedDependents.length ||
    directDependents.some((path, index) => path !== expectedDependents[index])
  ) {
    throw new Error(
      'Governance demo expected three direct component dependents.'
    )
  }
  const compliantFindings = evaluateFindings(compliantSnapshot)
  if (compliantFindings.length !== 0) {
    throw new Error('Governance demo expected the compliant policy to pass.')
  }

  const violationFindings = evaluateFindings(buildSnapshot(violationDocument))
  const firstFinding = violationFindings[0]
  if (
    violationFindings.length !== 3 ||
    firstFinding === undefined ||
    violationFindings.some(
      finding =>
        finding.ruleId !== 'PT1004' ||
        finding.message !== 'Layer component cannot reference layer primitives.'
    )
  ) {
    throw new Error(
      'Governance demo expected three layer-skip findings from PT1004.'
    )
  }

  return Object.freeze({
    tokenPath,
    aliasTarget: inspectedAliasTarget,
    resolvedValue: resolveSrgbHex(inspection.resolution.value),
    owner: ownerForPath(tokenPath),
    directDependents: Object.freeze(
      directDependents.map(path => Object.freeze({ path }))
    ),
    compliant: Object.freeze({ status: 'PASS' as const, findings: 0 }),
    blocked: Object.freeze({
      status: 'BLOCK' as const,
      ruleId: 'PT1004' as const,
      reason: firstFinding.message,
      findingCount: violationFindings.length,
    }),
    outputs: buildOutputLabels(outputOptions),
    tokenCount: compliantSnapshot.view.tokens.length,
    layerCount: policyInput.layers.length,
  })
}

/** Builds the click-driven proposal outcomes for the homepage graph. */
export function createProposalDeck(): ProposalDeck {
  const baselineSnapshot = buildSnapshot(compliantDocument)
  const aliasSnapshot = buildSnapshot(aliasDocument)
  const violationSnapshot = buildSnapshot(violationDocument)
  const renameSnapshot = buildSnapshot(renameDocument)

  const baselineFindings = evaluateFindings(baselineSnapshot)
  const aliasFindings = evaluateFindings(aliasSnapshot)
  const violationFindings = evaluateFindings(violationSnapshot)
  const renameFindings = evaluateFindings(renameSnapshot)
  if (baselineFindings.length !== 0 || aliasFindings.length !== 0) {
    throw new Error('Governance demo expected the compliant graphs to pass.')
  }
  if (renameFindings.length !== 0) {
    throw new Error('Governance demo expected the rename proposal to pass.')
  }
  const violationFinding = violationFindings[0]
  if (violationFindings.length !== 3 || violationFinding === undefined) {
    throw new Error('Governance demo expected three PT1004 findings.')
  }

  const aliasHex = resolveSrgbHex(
    requireBuildValue(
      inspectToken(aliasSnapshot, {
        kind: 'path',
        path: tokenPath.split('.'),
      }),
      'alias inspection'
    ).resolution.value
  )
  if (aliasHex !== '#34d399') {
    throw new Error(
      'Governance demo expected the green alias to resolve to #34d399.'
    )
  }

  const diff = buildDiffReport(baselineSnapshot, renameSnapshot)
  if (!diff.lines.includes('removed semantic.color.bg.brand')) {
    throw new Error(
      'Governance demo expected the rename diff to remove the old path.'
    )
  }

  const renameChanges = new Map<string, 'added' | 'changed'>([
    ['semantic.color.bg.primary', 'added'],
    ...expectedDependents.map(path => [path, 'changed'] as [string, 'changed']),
  ])
  const noChanges = new Map<string, 'added' | 'changed'>()

  const dependentList = expectedDependents.join(', ')

  /** Counts a node's consumers from the wires in view, so the inspect line
   * matches the graph the visitor is looking at. */
  const withEdgeConsumers = (graph: {
    nodes: readonly GraphNode[]
    edges: readonly GraphEdge[]
  }) => ({
    edges: graph.edges,
    nodes: Object.freeze(
      graph.nodes.map(node =>
        Object.freeze({
          ...node,
          consumers: graph.edges.filter(edge => edge.from === node.slot).length,
        })
      )
    ),
  })

  const baselineGraph = withEdgeConsumers(
    buildGraphProjection(baselineSnapshot, baselineFindings, noChanges)
  )
  const aliasGraph = withEdgeConsumers(
    buildGraphProjection(aliasSnapshot, aliasFindings, noChanges)
  )
  const violationProjection = buildGraphProjection(
    violationSnapshot,
    violationFindings,
    noChanges
  )
  // The design keeps every compliant wire visible under the red bypass
  // lanes, suppressed, so the violation preset overlays the baseline graph
  // instead of replacing it.
  const violationEdgeKeys = new Set(
    violationProjection.edges.map(edge => `${edge.from}>${edge.to}`)
  )
  const violationGraph = withEdgeConsumers({
    nodes: violationProjection.nodes,
    edges: Object.freeze([
      ...violationProjection.edges,
      ...baselineGraph.edges.filter(
        edge => !violationEdgeKeys.has(`${edge.from}>${edge.to}`)
      ),
    ]),
  })
  const renameGraph = withEdgeConsumers(
    buildGraphProjection(renameSnapshot, renameFindings, renameChanges)
  )

  const outcomes: readonly ProposalOutcome[] = Object.freeze([
    Object.freeze({
      id: 'baseline' as const,
      label: 'Current graph',
      status: 'PASS' as const,
      findingsLine: `${baselineFindings.length} findings`,
      verdictTone: 'pass' as const,
      detail:
        'semantic points at primitives, component points at semantic. Nothing for policy to flag.',
      description: `${tokenPath} references ${aliasTarget} and feeds ${dependentList}. The check passes with zero findings.`,
      nodes: baselineGraph.nodes,
      edges: baselineGraph.edges,
    }),
    Object.freeze({
      id: 'alias' as const,
      label: 'Compliant alias',
      status: 'PASS' as const,
      findingsLine: `${aliasFindings.length} findings`,
      verdictTone: 'pass' as const,
      detail:
        'alias now points at {green.500}. Same layer, same owner, nothing to flag.',
      description: `${tokenPath} references primitives.color.green.500, resolves to ${aliasHex}, and feeds ${dependentList}. The check passes.`,
      nodes: aliasGraph.nodes,
      edges: aliasGraph.edges,
    }),
    Object.freeze({
      id: 'violation' as const,
      label: 'Layer violations',
      status: 'FAIL' as const,
      findingsLine: `${violationFindings.length} findings · layer-skip`,
      verdictTone: 'fail' as const,
      detail:
        'button.bg, focus.ring, and card.inset reference primitives directly. component may only reference semantic.',
      description: `Three component tokens reference primitives, skipping the semantic layer. Policy ${violationFinding.ruleId} blocks the change: ${violationFinding.message}`,
      nodes: violationGraph.nodes,
      edges: violationGraph.edges,
    }),
    Object.freeze({
      id: 'rename' as const,
      label: 'Rename',
      status: 'PASS' as const,
      findingsLine: `${diff.changeCount} changes · ${renameFindings.length} findings`,
      verdictTone: 'pass' as const,
      detail: 'bg.brand → bg.primary pairs with 3 consumers before merge.',
      description: `semantic.color.bg.brand becomes semantic.color.bg.primary. The diff lists ${dependentList} as affected consumers.`,
      nodes: renameGraph.nodes,
      edges: renameGraph.edges,
    }),
  ])

  return Object.freeze({
    outcomes,
    diffReport: diff.lines,
    renameImpact: Object.freeze({
      removedPath: tokenPath,
      addedPath: 'semantic.color.bg.primary',
      consumers: Object.freeze(expectedDependents.map(abbreviate)),
    }),
  })
}
