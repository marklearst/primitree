/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { FigmaVarsProvider } from '../src/contexts/FigmaVarsProvider'

export const TEST_FIGMA_TOKEN = 'figmavars-test-token'
export const TEST_FIGMA_FILE_KEY = 'figmavars-test-file'

// Wrapper component that provides deterministic unit-test credentials.
export const TestWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <FigmaVarsProvider
      token={TEST_FIGMA_TOKEN}
      fileKey={TEST_FIGMA_FILE_KEY}>
      {children}
    </FigmaVarsProvider>
  )
}

/**
 * Custom renderHook function that automatically wraps hooks with the TestWrapper.
 * @param hook The hook to render.
 */
export const renderHookWithWrapper = (hook: () => unknown) => {
  return renderHook(hook, { wrapper: TestWrapper })
}

// Re-export everything from testing-library for convenience
export * from '@testing-library/react'
