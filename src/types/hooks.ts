import type { VariableMode } from './figma'

// Hook-specific types

export interface HookState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

export interface UseVariableModesResult {
  modes: VariableMode[]
  modesByCollectionId: Record<string, VariableMode[]>
  modesById: Record<string, VariableMode>
  isLoading: boolean
  isValidating: boolean
  error: Error | null
}

export interface SyncStatus {
  isSyncing: boolean
  lastSynced: Date | null
  error: string | null
}
