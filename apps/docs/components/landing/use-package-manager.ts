'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  isPackageManager,
  PACKAGE_MANAGER_KEY,
  type PackageManager,
} from '@/lib/landing/package-managers'

const CHANGE_EVENT = 'primitree:package-manager'

/** The root carries the choice as `data-package-manager`, set before first
 * paint by the layout script, so CSS shows the right command before React
 * hydrates. This store reads that attribute and keeps every chooser on the
 * page in step. */
function read(): PackageManager {
  const value = document.documentElement.dataset.packageManager
  return isPackageManager(value) ? value : 'npm'
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PACKAGE_MANAGER_KEY && isPackageManager(event.newValue)) {
      document.documentElement.dataset.packageManager = event.newValue
      onChange()
    }
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** The visitor's package manager, shared by every chooser and command. */
export function usePackageManager() {
  const manager = useSyncExternalStore<PackageManager>(
    subscribe,
    read,
    () => 'npm'
  )
  const choose = useCallback((next: PackageManager) => {
    document.documentElement.dataset.packageManager = next
    try {
      window.localStorage.setItem(PACKAGE_MANAGER_KEY, next)
    } catch {
      // Storage can be unavailable; the choice still holds for this page.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [manager, choose] as const
}
