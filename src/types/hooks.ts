// Hook-specific types

export interface HookState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSynced: Date | null;
  error: string | null;
}
