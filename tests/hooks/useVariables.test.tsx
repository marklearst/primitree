import { renderHook, waitFor } from '@testing-library/react'
import useSWR from 'swr'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { fetcher as apiFetcher } from 'api/fetcher'

import { FigmaVarsProvider } from '../../src/contexts/FigmaVarsProvider'
import { useVariables } from '../../src/hooks/useVariables'
import * as useFigmaTokenContextModule from '../../src/contexts/useFigmaTokenContext'
import { mockLocalVariablesResponse } from '../mocks/variables'
import type { ReactNode } from 'react'

// Mock the useSWR hook
vi.mock('swr')

vi.mock('api/fetcher', () => ({
  fetcher: vi.fn(),
}))

const mockedUseSWR = useSWR as Mock
const mockedApiFetcher = apiFetcher as Mock

const wrapper = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token='test-token'
    fileKey='test-key'>
    {children}
  </FigmaVarsProvider>
)

const wrapperNoToken = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token={null}
    fileKey='test-key'>
    {children}
  </FigmaVarsProvider>
)

const wrapperNoFileKey = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token='test-token'
    fileKey={null}>
    {children}
  </FigmaVarsProvider>
)

const wrapperWithFallbackFile = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token='test-token'
    fileKey='test-key'
    fallbackFile={mockLocalVariablesResponse}>
    {children}
  </FigmaVarsProvider>
)

const wrapperWithFallbackFileString = ({
  children,
}: {
  children: ReactNode
}) => (
  <FigmaVarsProvider
    token='test-token'
    fileKey='test-key'
    fallbackFile={JSON.stringify(mockLocalVariablesResponse)}>
    {children}
  </FigmaVarsProvider>
)

const wrapperWithFallbackFileNoCredentials = ({
  children,
}: {
  children: ReactNode
}) => (
  <FigmaVarsProvider
    token={null}
    fileKey={null}
    fallbackFile={mockLocalVariablesResponse}>
    {children}
  </FigmaVarsProvider>
)

describe('useVariables', () => {
  it('should return loading state initially', () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isValidating).toBe(false)
  })

  it('should return variables on successful fetch', async () => {
    mockedUseSWR.mockReturnValue({
      data: mockLocalVariablesResponse,
      error: undefined,
      isLoading: false,
      isValidating: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toEqual(mockLocalVariablesResponse)
      expect(result.current.error).toBeUndefined()
      expect(result.current.isValidating).toBe(false)
    })
  })

  it('should return an error when fetch fails', async () => {
    const error = new Error('Failed to fetch')
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: error,
      isLoading: false,
      isValidating: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toBe(error)
      expect(result.current.isValidating).toBe(false)
    })
  })

  it('should return isValidating true when revalidating', () => {
    mockedUseSWR.mockReturnValue({
      data: mockLocalVariablesResponse,
      error: undefined,
      isLoading: false,
      isValidating: true,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    expect(result.current.isValidating).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('should not call useSWR when token is missing', () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    })

    renderHook(() => useVariables(), { wrapper: wrapperNoToken })

    expect(mockedUseSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      undefined
    )
  })

  it('should throw error from fetcher when token/fileKey/fallbackFile are missing', async () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      isValidating: false,
    })

    renderHook(() => useVariables(), { wrapper: wrapperNoToken })

    const useSWRCalls = mockedUseSWR.mock.calls
    expect(useSWRCalls.length).toBeGreaterThan(0)

    const call = useSWRCalls[0]
    expect(call).toBeDefined()
    const [key, fetcher] = call as [
      unknown,
      (
        ...args: [readonly [string, string]] | [string, string]
      ) => Promise<unknown>,
    ]

    expect(key).toBeNull()
    expect(typeof fetcher).toBe('function')

    // The fetcher should throw an error when called without credentials
    await expect(fetcher('', '')).rejects.toThrow(
      'Missing URL or token for live API request'
    )
  })

  it('should not call useSWR when fileKey is missing', () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    })

    renderHook(() => useVariables(), { wrapper: wrapperNoFileKey })

    expect(mockedUseSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      undefined
    )
  })

  it('should use fallbackFile when provided as object', () => {
    // Mock the custom fetcher behavior for fallbackFile
    mockedUseSWR.mockImplementation(key => {
      if (key && Array.isArray(key) && key[0] && key[1]) {
        // Simulate the custom fetcher being called and returning fallback data
        return {
          data: mockLocalVariablesResponse,
          error: null,
          isLoading: false,
          isValidating: false,
        }
      }
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isValidating: false,
      }
    })

    const { result } = renderHook(() => useVariables(), {
      wrapper: wrapperWithFallbackFile,
    })

    expect(result.current.data).toEqual(mockLocalVariablesResponse)
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isValidating).toBe(false)
  })

  it('should parse fallbackFile when provided as string in custom fetcher', async () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      isValidating: false,
    })

    const fallbackString = JSON.stringify(mockLocalVariablesResponse)
    const jsonParseSpy = vi.spyOn(JSON, 'parse')

    renderHook(() => useVariables(), {
      wrapper: wrapperWithFallbackFileString,
    })

    const useSWRCalls = mockedUseSWR.mock.calls
    expect(useSWRCalls.length).toBeGreaterThan(0)

    const call = useSWRCalls[0]
    expect(call).toBeDefined()
    const [, fetcher] = call as [
      unknown,
      ([url, token]: readonly [string, string]) => Promise<unknown>,
    ]
    expect(typeof fetcher).toBe('function')

    const url = 'https://api.figma.com/v1/files/test-key/variables/local'
    const resultData = await fetcher([url, 'test-token'] as const)

    expect(resultData).toEqual(mockLocalVariablesResponse)
    expect(jsonParseSpy).toHaveBeenCalledWith(fallbackString)

    jsonParseSpy.mockRestore()
  })

  it('should call api fetcher when fallbackFile is not provided', async () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      isValidating: false,
    })

    mockedApiFetcher.mockResolvedValue(mockLocalVariablesResponse)

    renderHook(() => useVariables(), {
      wrapper,
    })

    const useSWRCalls = mockedUseSWR.mock.calls
    expect(useSWRCalls.length).toBeGreaterThan(0)

    const call = useSWRCalls[0]
    expect(call).toBeDefined()
    const [key, fetcher] = call as [
      unknown,
      ([url, token]: readonly [string, string]) => Promise<unknown>,
    ]
    expect(key).toEqual([
      'https://api.figma.com/v1/files/test-key/variables/local',
      'test-token',
    ])
    expect(typeof fetcher).toBe('function')

    const resultData = await fetcher([
      'https://api.figma.com/v1/files/test-key/variables/local',
      'test-token',
    ] as const)
    expect(resultData).toEqual(mockLocalVariablesResponse)
    expect(mockedApiFetcher).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/test-key/variables/local',
      'test-token'
    )
  })

  it('should use fallbackFile when provided as string', () => {
    // Mock the custom fetcher behavior for fallbackFile string
    mockedUseSWR.mockImplementation(key => {
      if (key && Array.isArray(key) && key[0] && key[1]) {
        // Simulate the custom fetcher being called and returning fallback data
        return {
          data: mockLocalVariablesResponse,
          error: null,
          isLoading: false,
          isValidating: false,
        }
      }
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isValidating: false,
      }
    })

    const { result } = renderHook(() => useVariables(), {
      wrapper: wrapperWithFallbackFileString,
    })

    expect(result.current.data).toEqual(mockLocalVariablesResponse)
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isValidating).toBe(false)
  })

  it('should use fallbackFile when both token and fileKey are null', () => {
    // Mock the custom fetcher behavior for fallbackFile when both token and fileKey are null
    mockedUseSWR.mockImplementation(key => {
      if (key && Array.isArray(key) && key[0] && key[1]) {
        // Simulate the custom fetcher being called and returning fallback data
        return {
          data: mockLocalVariablesResponse,
          error: null,
          isLoading: false,
          isValidating: false,
        }
      }
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isValidating: false,
      }
    })

    const { result } = renderHook(() => useVariables(), {
      wrapper: wrapperWithFallbackFileNoCredentials,
    })

    expect(result.current.data).toEqual(mockLocalVariablesResponse)
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isValidating).toBe(false)
  })

  it('should test custom fetcher logic directly', async () => {
    // Test the actual custom fetcher logic by calling it directly
    renderHook(() => useVariables(), { wrapper: wrapperWithFallbackFile })

    // Get the custom fetcher function from the useSWR call
    const useSWRCalls = mockedUseSWR.mock.calls
    expect(useSWRCalls.length).toBeGreaterThan(0)

    const call = useSWRCalls[0]
    expect(call).toBeDefined()
    const [key, fetcher] = call as [
      unknown,
      (url: string, token: string) => Promise<unknown>,
    ]
    expect(key).toEqual([
      'https://api.figma.com/v1/files/test-key/variables/local',
      'test-token',
    ])
    expect(typeof fetcher).toBe('function')

    // Call the custom fetcher directly to test the fallbackFile logic
    const resultData = await fetcher(
      'https://api.figma.com/v1/files/test-key/variables/local',
      'test-token'
    )
    expect(resultData).toEqual(mockLocalVariablesResponse)
  })

  it('should test custom fetcher logic with no credentials', async () => {
    // Test the actual custom fetcher logic by calling it directly when both token and fileKey are null
    renderHook(() => useVariables(), {
      wrapper: wrapperWithFallbackFileNoCredentials,
    })

    // Get the custom fetcher function from the useSWR call
    const useSWRCalls = mockedUseSWR.mock.calls
    expect(useSWRCalls.length).toBeGreaterThan(0)

    const call = useSWRCalls[0]
    expect(call).toBeDefined()
    const [key, fetcher] = call as [
      unknown,
      (url: string, token: string) => Promise<unknown>,
    ]
    // Key should match pattern: ['fallback-${providerId}', 'fallback']
    expect(Array.isArray(key)).toBe(true)
    const keyArray = key as [string, string]
    expect(keyArray[0]).toMatch(/^fallback-figma-vars-provider-\d+$/)
    expect(keyArray[1]).toBe('fallback')
    expect(typeof fetcher).toBe('function')

    // Call the custom fetcher directly to test the fallbackFile logic
    const resultData = await fetcher(keyArray[0], 'fallback')
    expect(resultData).toEqual(mockLocalVariablesResponse)
  })

  it('should use default providerId when providerId is null', () => {
    // Mock the context hook to return undefined providerId for this test only
    // Omit providerId to test the ?? 'default' fallback
    const spy = vi
      .spyOn(useFigmaTokenContextModule, 'useFigmaTokenContext')
      .mockReturnValue({
        token: null,
        fileKey: null,
        fallbackFile: mockLocalVariablesResponse,
      } as ReturnType<typeof useFigmaTokenContextModule.useFigmaTokenContext>)

    mockedUseSWR.mockReturnValue({
      data: mockLocalVariablesResponse,
      error: null,
      isLoading: false,
      isValidating: false,
    })

    renderHook(() => useVariables())

    // Verify the key uses 'default' when providerId is null
    expect(mockedUseSWR).toHaveBeenCalledWith(
      ['fallback-default', 'fallback'],
      expect.any(Function),
      undefined
    )

    spy.mockRestore()
  })
})
