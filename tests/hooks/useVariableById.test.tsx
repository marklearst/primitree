import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useVariableById } from '../../src/hooks/useVariableById'
import { useVariables } from '../../src/hooks/useVariables'
import { mockLocalVariablesResponse } from '../../tests/mocks/variables'

vi.mock('../../src/hooks/useVariables')

const mockedUseVariables = useVariables as Mock

describe('useVariableById', () => {
  it('should return undefined when useVariables has no data', () => {
    mockedUseVariables.mockReturnValue({
      data: undefined,
    })
    const { result } = renderHook(() => useVariableById('VariableID:1:1'))
    expect(result.current).toBeUndefined()
  })

  it('should return undefined when variables meta is missing', () => {
    mockedUseVariables.mockReturnValue({
      data: { meta: {} },
    })
    const { result } = renderHook(() => useVariableById('VariableID:1:1'))
    expect(result.current).toBeUndefined()
  })

  it('should return undefined when variable not found', () => {
    mockedUseVariables.mockReturnValue({
      data: mockLocalVariablesResponse,
    })
    const { result } = renderHook(() =>
      useVariableById('non-existent-variable-id')
    )
    expect(result.current).toBeUndefined()
  })

  it('should return the variable when found', () => {
    mockedUseVariables.mockReturnValue({
      data: mockLocalVariablesResponse,
    })
    const variableId = 'VariableID:1:1'
    const expectedVariable =
      mockLocalVariablesResponse.meta.variables[variableId]

    const { result } = renderHook(() => useVariableById(variableId))
    expect(result.current).toEqual(expectedVariable)
  })

  it('should return different variable when variableId changes', () => {
    mockedUseVariables.mockReturnValue({
      data: mockLocalVariablesResponse,
    })

    const { result, rerender } = renderHook(
      ({ variableId }) => useVariableById(variableId),
      {
        initialProps: { variableId: 'VariableID:1:1' },
      }
    )

    expect(result.current?.id).toBe('VariableID:1:1')

    rerender({ variableId: 'VariableID:1:2' })

    expect(result.current?.id).toBe('VariableID:1:2')
  })

  it('should memoize the result and not re-calculate on re-render with same variableId', () => {
    mockedUseVariables.mockReturnValue({
      data: mockLocalVariablesResponse,
    })

    const { result, rerender } = renderHook(() =>
      useVariableById('VariableID:1:1')
    )

    const initialVariable = result.current

    rerender()

    expect(result.current).toBe(initialVariable)
  })
})
