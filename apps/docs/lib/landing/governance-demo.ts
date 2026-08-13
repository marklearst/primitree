import {
  composeGraph,
  createSourceView,
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

/** Builds the serializable evidence projection rendered by the Living Canopy. */
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
  })
}
