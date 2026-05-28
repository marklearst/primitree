import '@testing-library/jest-dom'

// Setup for Vitest
import { beforeEach, vi } from 'vitest'

// Mock environment variables for tests
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()
  // Provide defaults for integration tests that require envs
  process.env.VITE_FIGMA_TOKEN ||= 'test-token'
  process.env.VITE_FIGMA_FILE_KEY ||= 'test-file-key'
})
