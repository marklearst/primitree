import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { useSWRConfig } from 'swr'
import { useInvalidateVariables } from '../../src/hooks/useInvalidateVariables'
import { useFigmaTokenContext } from '../../src/contexts/useFigmaTokenContext'

// Mock SWR
vi.mock('swr', () => ({
  useSWRConfig: vi.fn(),
}))

// Mock context hook
vi.mock('../../src/contexts/useFigmaTokenContext', () => ({
  useFigmaTokenContext: vi.fn(),
}))

const mockedUseSWRConfig = useSWRConfig as Mock
const mockedUseFigmaTokenContext = useFigmaTokenContext as Mock

describe('useInvalidateVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide invalidate and revalidate functions', () => {
    const mockMutate = vi.fn()
    mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
    mockedUseFigmaTokenContext.mockReturnValue({
      fileKey: 'test-file-key',
      providerId: 'test-provider-id',
    })

    const { result } = renderHook(() => useInvalidateVariables())

    expect(result.current.invalidate).toBeDefined()
    expect(result.current.revalidate).toBeDefined()
    expect(typeof result.current.invalidate).toBe('function')
    expect(typeof result.current.revalidate).toBe('function')
  })

  describe('invalidate', () => {
    it('should invalidate local, published, and fallback cache when fileKey and providerId are present', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        token: 'test-token',
        fileKey: 'test-file-key',
        providerId: 'test-provider-id',
        parsedFallbackFile: {},
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.invalidate()

      expect(mockMutate).toHaveBeenCalledTimes(3)

      // Check local variables invalidation
      expect(mockMutate).toHaveBeenCalledWith([
        'https://api.figma.com/v1/files/test-file-key/variables/local',
        'test-token',
      ])

      // Check published variables invalidation
      expect(mockMutate).toHaveBeenCalledWith([
        'https://api.figma.com/v1/files/test-file-key/variables/published',
        'test-token',
      ])

      // Check fallback cache invalidation
      expect(mockMutate).toHaveBeenCalledWith([
        'fallback-test-provider-id',
        'fallback',
      ])
    })

    it('should invalidate only local and published cache when providerId is missing', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        token: 'test-token',
        fileKey: 'test-file-key',
        providerId: undefined,
        fallbackFile: undefined,
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.invalidate()

      expect(mockMutate).toHaveBeenCalledTimes(2)

      // Should not call fallback invalidation
      expect(mockMutate).not.toHaveBeenCalledWith([
        expect.stringContaining('fallback'),
        'fallback',
      ])
    })

    it('should not invalidate anything when fileKey is missing', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: undefined,
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.invalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('should not invalidate anything when fileKey is null', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: null,
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.invalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('should not invalidate anything when fileKey is empty string', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: '',
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.invalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe('revalidate', () => {
    it('should revalidate local, published, and fallback cache when fileKey and providerId are present', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        token: 'test-token',
        fileKey: 'test-file-key',
        providerId: 'test-provider-id',
        parsedFallbackFile: {},
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.revalidate()

      expect(mockMutate).toHaveBeenCalledTimes(3)

      // Check local variables revalidation
      expect(mockMutate).toHaveBeenCalledWith(
        [
          'https://api.figma.com/v1/files/test-file-key/variables/local',
          'test-token',
        ],
        undefined,
        { revalidate: true }
      )

      // Check published variables revalidation
      expect(mockMutate).toHaveBeenCalledWith(
        [
          'https://api.figma.com/v1/files/test-file-key/variables/published',
          'test-token',
        ],
        undefined,
        { revalidate: true }
      )

      // Check fallback cache revalidation
      expect(mockMutate).toHaveBeenCalledWith(
        ['fallback-test-provider-id', 'fallback'],
        undefined,
        { revalidate: true }
      )
    })

    it('should revalidate only local and published cache when providerId is missing', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        token: 'test-token',
        fileKey: 'test-file-key',
        providerId: undefined,
        fallbackFile: undefined,
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.revalidate()

      expect(mockMutate).toHaveBeenCalledTimes(2)

      // Should not call fallback revalidation
      expect(mockMutate).not.toHaveBeenCalledWith(
        [expect.stringContaining('fallback'), 'fallback'],
        undefined,
        { revalidate: true }
      )
    })

    it('should not revalidate anything when fileKey is missing', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: undefined,
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.revalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('should not revalidate anything when fileKey is null', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: null,
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.revalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('should not revalidate anything when fileKey is empty string', () => {
      const mockMutate = vi.fn()
      mockedUseSWRConfig.mockReturnValue({ mutate: mockMutate })
      mockedUseFigmaTokenContext.mockReturnValue({
        fileKey: '',
        providerId: 'test-provider-id',
      })

      const { result } = renderHook(() => useInvalidateVariables())

      result.current.revalidate()

      expect(mockMutate).not.toHaveBeenCalled()
    })
  })
})
