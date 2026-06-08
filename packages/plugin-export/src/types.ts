export type ResolvedType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'

export interface ExportMode {
  modeId: string
  name: string
}

export interface ExportCollection {
  id: string
  name: string
  key?: string
  modes: ExportMode[]
  defaultModeId: string
  variableIds: string[]
  hiddenFromPublishing?: boolean
  remote?: boolean
}

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
