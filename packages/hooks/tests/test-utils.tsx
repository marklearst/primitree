/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { FigmaVariablesProvider } from '../src/contexts/FigmaVariablesProvider'

export const TEST_FIGMA_TOKEN = 'primitree-test-token'
export const TEST_FIGMA_FILE_KEY = 'primitree-test-file'

// Wrapper component with fixed unit-test credentials.
export const TestWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <FigmaVariablesProvider
      token={TEST_FIGMA_TOKEN}
      fileKey={TEST_FIGMA_FILE_KEY}>
      {children}
    </FigmaVariablesProvider>
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
