import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import useSWR from 'swr'
import { describe, expect, it, vi } from 'vitest'

import { FigmaVarsProvider } from '../../src/contexts/FigmaVarsProvider'
import { useVariables } from '../../src/hooks/useVariables'
import { mockVariablesResponse } from '../mocks/variables'

// Mock the useSWR hook
vi.mock('swr')

const mockUseSWR = useSWR as vi.Mock

describe('useVariables', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FigmaVarsProvider
      figmaToken="test-token"
      fileKey="test-key">
      {children}
    </FigmaVarsProvider>
  )

  it('should return loading state initially', () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeUndefined()
  })

  it('should return variables on successful fetch', async () => {
    mockUseSWR.mockReturnValue({
      data: mockVariablesResponse,
      error: undefined,
      isLoading: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toEqual(mockVariablesResponse)
      expect(result.current.error).toBeUndefined()
    })
  })

  it('should return an error when fetch fails', async () => {
    const error = new Error('Failed to fetch')
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: error,
      isLoading: false,
    })

    const { result } = renderHook(() => useVariables(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toBe(error)
    })
  })
})
