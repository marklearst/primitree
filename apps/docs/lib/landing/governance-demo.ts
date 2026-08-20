import {
  composeGraph,
  createSourceView,
  diffGraphViews,
  getDependents,
  inspectToken,
  type TokenId,
} from '@primitree/core'
import { createPolicy, evaluatePolicy } from '@primitree/core/policy'
import {
  buildDTCGOutputs,
  createDTCGGraphFragment,
  type BuildOutputOptions,
  type DTCGDocument,
  type DTCGOutputSet,
} from '@primitree/dtcg'

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
  }
  readonly outputs: readonly string[]
  readonly tokenCount: number
}

export interface ProposalOutcome {
  readonly id: 'baseline' | 'alias' | 'violation' | 'rename'
  readonly label: string
  readonly tokenPath: string
  readonly proposedValue: string
  readonly verdict: string
  readonly verdictTone: 'pass' | 'block' | 'review'
  readonly detail: string
  readonly resolvedValue: string | null
  readonly emitted: { readonly css: string; readonly ts: string } | null
  readonly description: string
}

export interface ProposalDeck {
  readonly outcomes: readonly ProposalOutcome[]
  readonly diffReport: readonly string[]
}

const tokenPath = 'semantic.color.bg.brand'
const aliasTarget = 'primitives.color.blue.500'
const expectedDependents = [
  'component.button.bg',
  'component.focus.ring',
  'component.nav.active.bg',
]

const compliantDocument = {
  primitives: {
    color: {
      blue: {
        '500': {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.4, 1],
            alpha: 1,
          },
        },
      },
      green: {
        '500': {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.372549, 0.498039, 0.184314],
            alpha: 1,
          },
        },
      },
    },
  },
  semantic: {
    color: {
      bg: {
        brand: { $type: 'color', $value: '{primitives.color.blue.500}' },
        support: { $type: 'color', $value: '{primitives.color.blue.500}' },
      },
    },
  },
  component: {
    button: { bg: { $type: 'color', $value: '{semantic.color.bg.brand}' } },
    nav: {
      active: {
        bg: { $type: 'color', $value: '{semantic.color.bg.brand}' },
      },
    },
    focus: { ring: { $type: 'color', $value: '{semantic.color.bg.brand}' } },
    color: {
      brand: { $type: 'color', $value: '{semantic.color.bg.support}' },
    },
  },
} satisfies DTCGDocument

const blockedDocument = {
  ...compliantDocument,
  semantic: {
    ...compliantDocument.semantic,
    color: {
      ...compliantDocument.semantic.color,
      bg: {
        ...compliantDocument.semantic.color.bg,
        brand: { $type: 'color', $value: '{component.color.brand}' },
      },
    },
  },
} as const

const aliasDocument = {
  ...compliantDocument,
  semantic: {
    color: {
      bg: {
        ...compliantDocument.semantic.color.bg,
        brand: { $type: 'color', $value: '{primitives.color.green.500}' },
      },
    },
  },
} as const

const renameDocument = {
  primitives: compliantDocument.primitives,
  semantic: {
    color: {
      bg: {
        primary: { $type: 'color', $value: '{primitives.color.blue.500}' },
        support: compliantDocument.semantic.color.bg.support,
      },
    },
  },
  component: {
    button: {
      bg: { $type: 'color', $value: '{semantic.color.bg.primary}' },
    },
    nav: {
      active: {
        bg: { $type: 'color', $value: '{semantic.color.bg.primary}' },
      },
    },
    focus: {
      ring: { $type: 'color', $value: '{semantic.color.bg.primary}' },
    },
    color: compliantDocument.component.color,
  },
} as const

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
      'Governance demo expected the brand token to resolve to an opaque sRGB color.'
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

function emittedExcerpt(
  document: unknown,
  cssNeedle: string,
  tsNeedle: string
) {
  const built = buildDTCGOutputs(
    {
      ...outputSet,
      files: { 'living-canopy.tokens.json': document as DTCGDocument },
    },
    {}
  )
  const findLine = (path: string, needle: string) => {
    const file = built.files.find(item => item.path === path)
    const line = file?.contents.split('\n').find(item => item.includes(needle))
    if (line === undefined) {
      throw new Error(`Governance demo expected ${needle} in ${path}.`)
    }
    return line.trim()
  }
  return Object.freeze({
    css: findLine('css/tokens.css', cssNeedle),
    ts: findLine('ts/tokens.ts', tsNeedle),
  })
}

function inspectResolvedHex(
  snapshot: ReturnType<typeof buildSnapshot>,
  path: readonly string[]
): string {
  const inspection = requireBuildValue(
    inspectToken(snapshot, { kind: 'path', path: [...path] }),
    'proposal inspection'
  )
  return resolveSrgbHex(inspection.resolution.value)
}

function buildDiffReport(
  before: ReturnType<typeof buildSnapshot>,
  after: ReturnType<typeof buildSnapshot>
): readonly string[] {
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
      lines.push('  Affected tokens:')
      for (const impacted of change.impactedTokenIds) {
        lines.push(`    ${describe(impacted)}`)
      }
    }
  }
  lines.push('New findings: 0', 'Resolved findings: 0')
  return Object.freeze(lines)
}

/** Builds the serializable evidence projection for the homepage proof panel. */
export function createGovernanceDemo(
  outputOptions: BuildOutputOptions = {}
): GovernanceDemo {
  const policy = requireBuildValue(createPolicy(policyInput), 'policy creation')
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
  const compliantReport = requireBuildValue(
    evaluatePolicy(compliantSnapshot, policy),
    'compliant policy evaluation'
  )
  if (compliantReport.summary.active !== 0) {
    throw new Error('Governance demo expected the compliant policy to pass.')
  }

  const blockedSnapshot = buildSnapshot(blockedDocument)
  const blockedReport = requireBuildValue(
    evaluatePolicy(blockedSnapshot, policy),
    'blocked policy evaluation'
  )
  const blockedFinding = blockedReport.findings.find(
    finding => finding.ruleId === 'PT1004'
  )
  if (
    blockedFinding === undefined ||
    blockedFinding.message !==
      'Layer semantic cannot reference layer component.'
  ) {
    throw new Error('Governance demo expected the blocked policy finding.')
  }
  const owner = policy.ownership.paths.semantic?.[0]
  if (owner === undefined) {
    throw new Error('Governance demo expected a semantic token owner.')
  }

  return Object.freeze({
    tokenPath,
    aliasTarget: inspectedAliasTarget,
    resolvedValue: resolveSrgbHex(inspection.resolution.value),
    owner,
    directDependents: Object.freeze(
      directDependents.map(path => Object.freeze({ path }))
    ),
    compliant: Object.freeze({ status: 'PASS' as const, findings: 0 }),
    blocked: Object.freeze({
      status: 'BLOCK' as const,
      ruleId: 'PT1004' as const,
      reason: blockedFinding.message,
    }),
    outputs: buildOutputLabels(outputOptions),
    tokenCount: compliantSnapshot.view.tokens.length,
  })
}

/** Builds the click-driven proposal outcomes for the homepage proof panel. */
export function createProposalDeck(): ProposalDeck {
  const policy = requireBuildValue(createPolicy(policyInput), 'policy creation')
  const baselineSnapshot = buildSnapshot(compliantDocument)
  const aliasSnapshot = buildSnapshot(aliasDocument)
  const renameSnapshot = buildSnapshot(renameDocument)

  const aliasReport = requireBuildValue(
    evaluatePolicy(aliasSnapshot, policy),
    'alias policy evaluation'
  )
  if (aliasReport.summary.active !== 0) {
    throw new Error('Governance demo expected the alias proposal to pass.')
  }
  const blockedReport = requireBuildValue(
    evaluatePolicy(buildSnapshot(blockedDocument), policy),
    'blocked policy evaluation'
  )
  const blockedFinding = blockedReport.findings.find(
    finding => finding.ruleId === 'PT1004'
  )
  if (blockedFinding === undefined) {
    throw new Error('Governance demo expected the PT1004 finding.')
  }

  const dependentList = expectedDependents.join(', ')
  const baselineHex = inspectResolvedHex(baselineSnapshot, [
    'semantic',
    'color',
    'bg',
    'brand',
  ])
  const aliasHex = inspectResolvedHex(aliasSnapshot, [
    'semantic',
    'color',
    'bg',
    'brand',
  ])
  if (aliasHex !== '#5f7f2f') {
    throw new Error(
      'Governance demo expected the green alias to resolve to #5f7f2f.'
    )
  }
  const diffReport = buildDiffReport(baselineSnapshot, renameSnapshot)
  if (!diffReport.includes('removed semantic.color.bg.brand')) {
    throw new Error(
      'Governance demo expected the rename diff to remove the old path.'
    )
  }

  const brandCss = '--semantic-color-bg-brand:'
  const brandTs = '["semantic.color.bg.brand"]: "color('
  const outcomes: readonly ProposalOutcome[] = Object.freeze([
    Object.freeze({
      id: 'baseline' as const,
      label: 'Current graph',
      tokenPath,
      proposedValue: `{${aliasTarget}}`,
      verdict: 'PASS · 0 findings',
      verdictTone: 'pass' as const,
      detail: 'Each layer references the layer beneath it. The graph ships.',
      resolvedValue: baselineHex,
      emitted: emittedExcerpt(compliantDocument, brandCss, brandTs),
      description: `${tokenPath} references ${aliasTarget}, resolves to ${baselineHex}, and feeds ${dependentList}.`,
    }),
    Object.freeze({
      id: 'alias' as const,
      label: 'Compliant alias',
      tokenPath,
      proposedValue: '{primitives.color.green.500}',
      verdict: 'PASS · 0 findings',
      verdictTone: 'pass' as const,
      detail:
        'semantic references primitives, within policy. The change ships.',
      resolvedValue: aliasHex,
      emitted: emittedExcerpt(aliasDocument, brandCss, brandTs),
      description: `${tokenPath} references primitives.color.green.500, resolves to ${aliasHex}, and feeds ${dependentList}.`,
    }),
    Object.freeze({
      id: 'violation' as const,
      label: 'Layer violation',
      tokenPath,
      proposedValue: '{component.color.brand}',
      verdict: 'BLOCK · PT1004',
      verdictTone: 'block' as const,
      detail: blockedFinding.message,
      resolvedValue: null,
      emitted: null,
      description: `${tokenPath} proposes a reference to component.color.brand. Policy PT1004 blocks the change: ${blockedFinding.message}`,
    }),
    Object.freeze({
      id: 'rename' as const,
      label: 'Rename',
      tokenPath: 'semantic.color.bg.primary',
      proposedValue: `{${aliasTarget}}`,
      verdict: '5 changes · 3 tokens affected',
      verdictTone: 'review' as const,
      detail: 'The rename reaches every consumer of the old path.',
      resolvedValue: baselineHex,
      emitted: emittedExcerpt(
        renameDocument,
        '--semantic-color-bg-primary:',
        '["semantic.color.bg.primary"]: "color('
      ),
      description: `semantic.color.bg.brand becomes semantic.color.bg.primary. The diff lists ${dependentList} as affected consumers.`,
    }),
  ])

  return Object.freeze({ outcomes, diffReport })
}
