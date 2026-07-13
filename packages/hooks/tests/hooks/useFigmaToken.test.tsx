import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHookWithWrapper, TEST_FIGMA_TOKEN } from '../test-utils'
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

    expect(result.current).toBe(TEST_FIGMA_TOKEN)
  })

  it('should throw error when no context provider is available', () => {
    // Test without wrapper (no context) should throw
    expect(() => renderHook(() => useFigmaToken())).toThrow()
  })
})
