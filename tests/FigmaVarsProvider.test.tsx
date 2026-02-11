import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FigmaVarsProvider } from '../src/contexts/FigmaVarsProvider'
import { useFigmaTokenContext } from '../src/contexts/useFigmaTokenContext'
import {
  mockLocalVariablesResponse,
  mockPublishedVariablesResponse,
} from './mocks/variables'

const TestComponent = () => {
  const { token, fileKey } = useFigmaTokenContext()
  return (
    <div>
      <p>Token: {token}</p>
      <p>File Key: {fileKey}</p>
    </div>
  )
}

const FallbackTestComponent = () => {
  const { fallbackFile, parsedFallbackFile } = useFigmaTokenContext()
  return (
    <div>
      <p>Has Fallback: {fallbackFile ? 'yes' : 'no'}</p>
      <p>Has Parsed Fallback: {parsedFallbackFile ? 'yes' : 'no'}</p>
    </div>
  )
}

describe('FigmaVarsProvider', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.NODE_ENV = originalEnv
  })

  it('provides token and fileKey to children', () => {
    const testToken = 'test-token'
    const testFileKey = 'test-file-key'

    render(
      <FigmaVarsProvider
        token={testToken}
        fileKey={testFileKey}>
        <TestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText(`Token: ${testToken}`)).toBeInTheDocument()
    expect(screen.getByText(`File Key: ${testFileKey}`)).toBeInTheDocument()
  })

  it('shows "no" when fallbackFile is undefined', () => {
    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: no')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })

  it('throws an error if useFigmaTokenContext is used outside of a provider', () => {
    // console.error is already mocked in beforeEach

    // We need a function that will throw when called, so we wrap the render in it.
    const renderWithoutProvider = () => render(<TestComponent />)

    expect(renderWithoutProvider).toThrow(
      'useFigmaTokenContext must be used within a FigmaVarsProvider'
    )
  })

  it('includes swrConfig in context when provided', () => {
    const testToken = 'test-token'
    const testFileKey = 'test-file-key'
    const swrConfig = { revalidateOnFocus: false }

    const SwrConfigTestComponent = () => {
      const { token, fileKey, swrConfig: config } = useFigmaTokenContext()
      return (
        <div>
          <p>Token: {token}</p>
          <p>File Key: {fileKey}</p>
          <p>SWR Config: {config ? 'present' : 'missing'}</p>
        </div>
      )
    }

    render(
      <FigmaVarsProvider
        token={testToken}
        fileKey={testFileKey}
        swrConfig={swrConfig}>
        <SwrConfigTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('SWR Config: present')).toBeInTheDocument()
  })

  it('does not include swrConfig in context when undefined', () => {
    const testToken = 'test-token'
    const testFileKey = 'test-file-key'

    const SwrConfigTestComponent = () => {
      const context = useFigmaTokenContext()
      return (
        <div>
          <p>Token: {context.token}</p>
          <p>File Key: {context.fileKey}</p>
          <p>Has SWR Config: {'swrConfig' in context ? 'yes' : 'no'}</p>
        </div>
      )
    }

    render(
      <FigmaVarsProvider
        token={testToken}
        fileKey={testFileKey}>
        <SwrConfigTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has SWR Config: no')).toBeInTheDocument()
  })

  it('parses fallbackFile string JSON and provides parsedFallbackFile', () => {
    const fallbackJson = JSON.stringify(mockLocalVariablesResponse)

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={fallbackJson}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('provides parsedFallbackFile when fallbackFile is an object', () => {
    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('handles invalid JSON string gracefully without crashing', () => {
    const invalidJson = '{ invalid json }'

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs warning for invalid object structure in non-production mode', () => {
    process.env.NODE_ENV = 'development'
    const invalidStructure = {
      not: 'valid structure',
    } as unknown as typeof mockLocalVariablesResponse

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('fallbackFile object does not match expected')
    )
  })

  it('logs warning for invalid parsed JSON structure in non-production mode', () => {
    process.env.NODE_ENV = 'development'
    const invalidJson = JSON.stringify({ not: 'valid structure' })

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Parsed fallbackFile JSON does not match expected'
      )
    )
  })

  it('logs error with error message for JSON parse error in non-production mode', () => {
    process.env.NODE_ENV = 'development'
    const invalidJson = '{ invalid json }'

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse fallbackFile JSON')
    )
  })

  it('handles non-Error exception in JSON parse error', () => {
    process.env.NODE_ENV = 'development'
    // Mock JSON.parse to throw a non-Error object
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw 'String error' // Not an Error instance
    })

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile='{"valid": "json"}'>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error')
    )

    // Restore original
    parseSpy.mockRestore()
  })

  it('handles invalid structure gracefully without crashing', () => {
    const invalidStructure = {
      not: 'valid structure',
    } as unknown as typeof mockLocalVariablesResponse

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })

  it('validates and accepts LocalVariablesResponse structure', () => {
    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('validates and accepts PublishedVariablesResponse structure', () => {
    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockPublishedVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('generates stable providerId using useId', () => {
    const ProviderIdTestComponent = () => {
      const { providerId } = useFigmaTokenContext()
      return <div>Provider ID: {providerId}</div>
    }

    const { rerender } = render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'>
        <ProviderIdTestComponent />
      </FigmaVarsProvider>
    )

    const firstId = screen.getByText(/Provider ID:/).textContent

    act(() => {
      rerender(
        <FigmaVarsProvider
          token='test-token'
          fileKey='test-file-key'>
          <ProviderIdTestComponent />
        </FigmaVarsProvider>
      )
    })

    const secondId = screen.getByText(/Provider ID:/).textContent
    // Provider ID should be stable across re-renders
    expect(firstId).toBe(secondId)
  })

  it('does not log warnings in production mode for invalid fallback', () => {
    process.env.NODE_ENV = 'production'
    const invalidStructure = {
      not: 'valid structure',
    } as unknown as typeof mockLocalVariablesResponse

    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(console.warn).not.toHaveBeenCalled()
  })

  it('handles non-string, non-object fallbackFile gracefully', () => {
    // Test the fallback case when fallbackFile is neither string nor object
    render(
      <FigmaVarsProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={123 as unknown as typeof mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVarsProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })
})
