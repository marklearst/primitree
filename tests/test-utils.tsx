/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { FigmaVarsProvider } from '../src/contexts/FigmaVarsProvider'

// Wrapper component that provides the Figma context with credentials from environment variables.
export const TestWrapper = ({ children }: { children: ReactNode }) => {
  const token = process.env.VITE_FIGMA_TOKEN
  const fileKey = process.env.VITE_FIGMA_FILE_KEY

  if (!token || !fileKey) {
    throw new Error(
      'VITE_FIGMA_TOKEN and VITE_FIGMA_FILE_KEY must be defined in your .env file for integration tests.'
    )
  }

  return (
    <FigmaVarsProvider
      token={token}
      fileKey={fileKey}>
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
