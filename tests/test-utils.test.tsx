import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TestWrapper } from './test-utils' // We test the wrapper directly

describe('TestWrapper', () => {
  let originalToken: string | undefined
  let originalFileKey: string | undefined

  beforeAll(() => {
    // Store original env variables
    originalToken = process.env.VITE_FIGMA_TOKEN
    originalFileKey = process.env.VITE_FIGMA_FILE_KEY
  })

  afterAll(() => {
    // Restore original env variables
    process.env.VITE_FIGMA_TOKEN = originalToken
    process.env.VITE_FIGMA_FILE_KEY = originalFileKey
  })

  it('should throw an error if VITE_FIGMA_TOKEN is not defined', () => {
    // Temporarily unset the token
    delete process.env.VITE_FIGMA_TOKEN

    // We expect the render to throw the specific error
    expect(() => renderHook(() => {}, { wrapper: TestWrapper })).toThrow(
      'VITE_FIGMA_TOKEN and VITE_FIGMA_FILE_KEY must be defined in your .env file for integration tests.'
    )
  })
})
