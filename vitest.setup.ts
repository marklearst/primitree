import '@testing-library/jest-dom'

// Setup for Vitest
import { beforeEach, vi } from 'vitest'

// Mock environment variables for tests
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()
})
