export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

export interface ExportMode {
  modeId: string
  name: string
}

export interface ExportExtendedMode extends ExportMode {
  parentModeId: string
}

interface ExportCollectionBase {
  id: string
  name: string
  key?: string
  modes: ExportMode[]
  defaultModeId: string
  variableIds: string[]
  hiddenFromPublishing?: boolean
  remote?: boolean
}

export interface ExportRootCollection extends ExportCollectionBase {
  /** Legacy ordinary exports may omit the discriminator. */
  isExtension?: false
  parentVariableCollectionId?: never
  rootVariableCollectionId?: never
  variableOverrides?: never
}

export interface ExportExtendedCollection extends Omit<
  ExportCollectionBase,
  'modes'
> {
  isExtension: true
  parentVariableCollectionId: string
  rootVariableCollectionId: string
  variableOverrides: Record<string, Record<string, unknown>>
  modes: ExportExtendedMode[]
}

export type ExportCollection = ExportRootCollection | ExportExtendedCollection

export interface ExportVariable {
  id: string
  name: string
  key?: string
  variableCollectionId: string
  resolvedType: ResolvedType
  valuesByMode: Record<string, unknown>
  description?: string
  hiddenFromPublishing?: boolean
  scopes?: string[]
  codeSyntax?: Record<string, string>
  remote?: boolean
}

export interface LocalVariablesExport {
  status: number
  error: boolean
  meta: {
    variableCollections: Record<
      string,
      ExportCollection & { updatedAt?: string }
    >
    variables: Record<string, ExportVariable & { updatedAt?: string }>
  }
}

export interface ExportSummary {
  collections: number
  variables: number
  modes: number
  fileName: string
}
