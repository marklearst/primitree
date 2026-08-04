declare const graphIdBrand: unique symbol

type GraphId<Name extends string> = string & {
  readonly [graphIdBrand]: Name
}

export type SourceId = GraphId<'SourceId'>
export type GroupId = GraphId<'GroupId'>
export type TokenId = GraphId<'TokenId'>
export type GraphViewId = GraphId<'GraphViewId'>

export type QualifiedIdKind = 'group' | 'token'

export type QualifiedIdForKind<Kind extends QualifiedIdKind> =
  Kind extends 'group' ? GroupId : TokenId

export type GraphPhase =
  'source' | 'compose' | 'view' | 'resolve' | 'inspect' | 'diff'

export interface GraphDiagnostic {
  readonly code: string
  readonly phase: GraphPhase
  readonly message: string
  readonly path?: readonly string[]
  readonly tokenId?: TokenId
}

export type Result<Value> =
  | {
      readonly ok: true
      readonly value: Value
      readonly diagnostics: readonly GraphDiagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly [GraphDiagnostic, ...GraphDiagnostic[]]
    }

export type JsonPrimitive = null | boolean | number | string

export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type StandardTokenType =
  | 'border'
  | 'color'
  | 'cubicBezier'
  | 'dimension'
  | 'duration'
  | 'fontFamily'
  | 'fontWeight'
  | 'gradient'
  | 'number'
  | 'shadow'
  | 'string'
  | 'strokeStyle'
  | 'transition'
  | 'typography'

export type TokenType = StandardTokenType | 'boolean' | `extension:${string}`

export interface Provenance {
  readonly uri?: string
  readonly pointer?: string
  readonly digest?: string
  readonly line?: number
  readonly column?: number
}

export interface SourceRecord {
  readonly id: SourceId
  readonly type: string
  readonly name?: string
  readonly precedence: number
  readonly provenance: readonly Provenance[]
}

export interface GroupNode {
  readonly id: GroupId
  readonly sourceId: SourceId
  readonly name: string
  readonly path: readonly string[]
  readonly provenance: readonly Provenance[]
}

export type ContextSelection = Readonly<Record<string, string>>

export type TokenValue =
  | { readonly kind: 'literal'; readonly value: JsonValue }
  | { readonly kind: 'reference'; readonly target: TokenId }

export interface AuthoredTokenValue {
  readonly value: TokenValue
  readonly conditions: ContextSelection
  readonly priority: number
  readonly provenance: readonly Provenance[]
}

export interface TokenNode {
  readonly id: TokenId
  readonly sourceId: SourceId
  readonly groupId?: GroupId
  readonly name: string
  readonly path: readonly string[]
  readonly type: TokenType
  readonly values: readonly AuthoredTokenValue[]
  readonly provenance: readonly Provenance[]
}

export interface ReferenceEdge {
  readonly from: TokenId
  readonly to: TokenId
  readonly conditions: ContextSelection
}

export interface GraphFragment {
  readonly source: SourceRecord
  readonly groups: readonly GroupNode[]
  readonly tokens: readonly TokenNode[]
  readonly references: readonly ReferenceEdge[]
}

export interface TokenGraph {
  readonly sources: readonly SourceRecord[]
  readonly groups: readonly GroupNode[]
  readonly tokens: readonly TokenNode[]
  readonly references: readonly ReferenceEdge[]
}

export interface ViewToken {
  readonly tokenId: TokenId
  readonly path: readonly string[]
}

export interface GraphView {
  readonly schemaVersion: 1
  readonly id: GraphViewId
  readonly sourceIds: readonly SourceId[]
  readonly groups: readonly GroupId[]
  readonly tokens: readonly ViewToken[]
}

export interface DependencyQueryOptions {
  readonly transitive?: boolean
}

export interface ResolvedToken {
  readonly tokenId: TokenId
  readonly path: readonly string[]
  readonly type: TokenType
  readonly value: JsonValue
  readonly sourceSelection: ContextSelection
  readonly directReferences: readonly TokenId[]
  readonly referenceChain: readonly TokenId[]
}

export type TokenInspectionTarget =
  | { readonly kind: 'token-id'; readonly tokenId: TokenId }
  | { readonly kind: 'path'; readonly path: readonly string[] }

export interface GraphSnapshot {
  readonly graph: TokenGraph
  readonly view: GraphView
}

export interface TokenInspection {
  readonly tokenId: TokenId
  readonly path: readonly string[]
  readonly token: TokenNode
  readonly dependencies: readonly TokenId[]
  readonly dependents: readonly TokenId[]
  readonly resolution: ResolvedToken
}

export type GraphChangeKind = 'added' | 'removed' | 'changed'

export interface GraphChange {
  readonly kind: GraphChangeKind
  readonly tokenId: TokenId
  readonly impactedTokenIds: readonly TokenId[]
}

export interface GraphDiff {
  readonly changes: readonly GraphChange[]
}
