import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHookWithWrapper } from '../test-utils'
import useFigmaToken from '../../src/hooks/useFigmaToken'

describe('useFigmaToken', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should return the token from context', () => {
    const { result } = renderHookWithWrapper(() => useFigmaToken())

    // Should return the token from the test environment
    expect(result.current).toBe(process.env.VITE_FIGMA_TOKEN)
  })

  it('should throw error when no context provider is available', () => {
    // Test without wrapper (no context) should throw
    expect(() => renderHook(() => useFigmaToken())).toThrow()
  })
})
