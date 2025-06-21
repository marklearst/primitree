import { renderHook, waitFor } from '@testing-library/react'
import useSWR from 'swr'
import { describe, expect, it, vi, Mock } from 'vitest'

import { FigmaVarsProvider } from '../../src/contexts/FigmaVarsProvider'
import { useVariables } from '../../src/hooks/useVariables'
import { mockVariablesResponse } from '../mocks/variables'
import type { ReactNode } from 'react'

// Mock the useSWR hook
vi.mock('swr')

const mockedUseSWR = useSWR as Mock

const wrapper = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token="test-token"
    fileKey="test-key">
    {children}
  </FigmaVarsProvider>
)

const wrapperNoToken = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token={null}
    fileKey="test-key">
    {children}
  </FigmaVarsProvider>
)

const wrapperNoFileKey = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token="test-token"
    fileKey={null}>
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
      data: mockVariablesResponse,
      error: undefined,
      isLoading: false,
      isValidating: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toEqual(mockVariablesResponse)
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
      data: mockVariablesResponse,
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

    expect(mockedUseSWR).toHaveBeenCalledWith(null, expect.any(Function))
  })

  it('should not call useSWR when fileKey is missing', () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    })

    renderHook(() => useVariables(), { wrapper: wrapperNoFileKey })

    expect(mockedUseSWR).toHaveBeenCalledWith(null, expect.any(Function))
  })
})
