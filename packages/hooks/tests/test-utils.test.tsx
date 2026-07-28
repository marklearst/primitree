import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFigmaTokenContext } from '../src/contexts/useFigmaTokenContext'
import {
  TEST_FIGMA_FILE_KEY,
  TEST_FIGMA_TOKEN,
  TestWrapper,
} from './test-utils'

describe('TestWrapper', () => {
  it('provides fixed credentials to consumers', () => {
    const { result } = renderHook(() => useFigmaTokenContext(), {
      wrapper: TestWrapper,
    })

    expect(result.current.token).toBe(TEST_FIGMA_TOKEN)
    expect(result.current.fileKey).toBe(TEST_FIGMA_FILE_KEY)
  })
})
