import type { GraphViewId, TokenId } from '../graph/types'

declare const policyFindingIdBrand: unique symbol

export type PolicyFindingId = string & {
  readonly [policyFindingIdBrand]: 'PolicyFindingId'
}

export type PolicyValueRule = 'literal' | 'reference' | 'either'

export interface PolicyLayerInput {
  readonly id: string
  readonly roots: readonly string[]
  readonly values: PolicyValueRule
  readonly references: readonly string[]
}

export interface PolicyOwnershipInput {
  readonly default?: readonly string[]
  readonly paths?: Readonly<Record<string, readonly string[]>>
}

export interface PolicyInput {
  readonly id: string
  readonly viewId: string
  readonly layers: readonly PolicyLayerInput[]
  readonly ownership?: PolicyOwnershipInput
}

export interface PolicyLayer {
  readonly id: string
  readonly roots: readonly string[]
  readonly values: PolicyValueRule
  readonly references: readonly string[]
}

export interface PolicyOwnership {
  readonly default: readonly string[]
  readonly paths: Readonly<Record<string, readonly string[]>>
}

export interface Policy {
  readonly id: string
  readonly viewId: GraphViewId
  readonly layers: readonly PolicyLayer[]
  readonly ownership: PolicyOwnership
}

export type PolicyRuleId = 'PT1001' | 'PT1003' | 'PT1004' | 'PT1005'

export type PolicyFindingDisposition = 'active' | 'baseline'

export interface PolicyFinding {
  readonly findingId: PolicyFindingId
  readonly ruleId: PolicyRuleId
  readonly tokenId: TokenId
  readonly path: readonly string[]
  readonly message: string
  readonly owners: readonly string[]
  readonly disposition: PolicyFindingDisposition
  readonly layerId?: string
  readonly targetTokenId?: TokenId
}

export interface PolicyReport {
  readonly policyId: string
  readonly viewId: GraphViewId
  readonly findings: readonly PolicyFinding[]
  readonly summary: {
    readonly active: number
    readonly baseline: number
  }
}

export interface PolicyEvaluationOptions {
  readonly baseline?: readonly PolicyFindingId[]
}

export interface PolicyDiagnostic {
  readonly code: string
  readonly phase: 'policy'
  readonly message: string
}

export type PolicyResult<Value> =
  | {
      readonly ok: true
      readonly value: Value
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly [PolicyDiagnostic]
    }
