import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FigmaVariablesProvider,
  type FigmaVariablesProviderProps,
} from '../src'
import { useFigmaTokenContext } from '../src/contexts/useFigmaTokenContext'
import {
  mockLocalVariablesResponse,
  mockPublishedVariablesResponse,
} from './mocks/variables'
import type { FallbackDataKind } from '@primitree/core'

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
  const { fallbackFile, parsedFallbackFile, validatedFallback } =
    useFigmaTokenContext()
  return (
    <div>
      <p>Has Fallback: {fallbackFile ? 'yes' : 'no'}</p>
      <p>Has Parsed Fallback: {parsedFallbackFile ? 'yes' : 'no'}</p>
      <p>Validated Fallback Kind: {validatedFallback?.kind ?? 'none'}</p>
    </div>
  )
}

describe('FigmaVariablesProvider', () => {
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
    const providerProps: FigmaVariablesProviderProps = {
      token: testToken,
      fileKey: testFileKey,
      children: <TestComponent />,
    }

    render(<FigmaVariablesProvider {...providerProps} />)

    expect(screen.getByText(`Token: ${testToken}`)).toBeInTheDocument()
    expect(screen.getByText(`File Key: ${testFileKey}`)).toBeInTheDocument()
  })

  it('shows "no" when fallbackFile is undefined', () => {
    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: no')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })

  it('throws an error if useFigmaTokenContext is used outside of a provider', () => {
    // console.error is already mocked in beforeEach

    // We need a function that will throw when called, so we wrap the render in it.
    const renderWithoutProvider = () => render(<TestComponent />)

    expect(renderWithoutProvider).toThrow(
      '[primitree] Call useFigmaTokenContext inside a FigmaVariablesProvider.'
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
      <FigmaVariablesProvider
        token={testToken}
        fileKey={testFileKey}
        swrConfig={swrConfig}>
        <SwrConfigTestComponent />
      </FigmaVariablesProvider>
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
      <FigmaVariablesProvider
        token={testToken}
        fileKey={testFileKey}>
        <SwrConfigTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has SWR Config: no')).toBeInTheDocument()
  })

  it('parses fallbackFile string JSON and provides parsedFallbackFile', () => {
    const fallbackJson = JSON.stringify(mockLocalVariablesResponse)

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={fallbackJson}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('provides parsedFallbackFile when fallbackFile is an object', () => {
    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('accepts an empty response when fallbackKind is local', () => {
    const emptyFallback = {
      meta: {
        variableCollections: {},
        variables: {},
      },
    }

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={emptyFallback}
        fallbackKind='local'>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
    expect(
      screen.getByText('Validated Fallback Kind: local')
    ).toBeInTheDocument()
  })

  it('warns and leaves an untagged empty response unclassified', () => {
    process.env.NODE_ENV = 'development'
    const emptyFallback = {
      meta: {
        variableCollections: {},
        variables: {},
      },
    }

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={emptyFallback}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
    expect(
      screen.getByText('Validated Fallback Kind: none')
    ).toBeInTheDocument()
    expect(console.warn).toHaveBeenCalledWith(
      '[primitree] fallbackFile does not match local or published Figma Variables API response data. Set fallbackKind for an empty response.'
    )
  })

  it('rejects a hostile runtime fallbackKind without logging fallback contents', () => {
    process.env.NODE_ENV = 'development'
    const fallbackContents = 'do-not-log-fallback-contents'
    const localFallback = {
      meta: {
        variableCollections: {
          collection: {
            modes: [],
            description: fallbackContents,
          },
        },
        variables: {},
      },
    } as unknown as typeof mockLocalVariablesResponse

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={localFallback}
        fallbackKind={'unexpected' as FallbackDataKind}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
    expect(
      screen.getByText('Validated Fallback Kind: none')
    ).toBeInTheDocument()
    expect(console.warn).toHaveBeenCalledWith(
      '[primitree] fallbackFile does not match local or published Figma Variables API response data. Set fallbackKind for an empty response.'
    )
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      fallbackContents
    )
  })

  it('handles invalid JSON string gracefully without crashing', () => {
    const invalidJson = '{ invalid json }'

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
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
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(console.warn).toHaveBeenCalledWith(
      '[primitree] fallbackFile does not match local or published Figma Variables API response data. Set fallbackKind for an empty response.'
    )
  })

  it('logs warning for invalid parsed JSON structure in non-production mode', () => {
    process.env.NODE_ENV = 'development'
    const invalidJson = JSON.stringify({ not: 'valid structure' })

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(console.warn).toHaveBeenCalledWith(
      '[primitree] fallbackFile does not match local or published Figma Variables API response data. Set fallbackKind for an empty response.'
    )
  })

  it('logs a fixed generic error without JSON source contents for parse failures', () => {
    process.env.NODE_ENV = 'development'
    const sourceContents = 'do-not-log-json-source'
    const invalidJson = `{ "secret": "${sourceContents}" `

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidJson}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(console.error).toHaveBeenCalledWith(
      '[primitree] Failed to parse fallbackFile JSON.'
    )
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      sourceContents
    )
  })

  it('handles non-Error exception in JSON parse error', () => {
    process.env.NODE_ENV = 'development'
    // Mock JSON.parse to throw a non-Error object
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw 'String error' // Not an Error instance
    })

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile='{"valid": "json"}'>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(console.error).toHaveBeenCalledWith(
      '[primitree] Failed to parse fallbackFile JSON.'
    )

    // Restore original
    parseSpy.mockRestore()
  })

  it('handles invalid structure gracefully without crashing', () => {
    const invalidStructure = {
      not: 'valid structure',
    } as unknown as typeof mockLocalVariablesResponse

    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })

  it('validates and accepts LocalVariablesResponse structure', () => {
    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('validates and accepts PublishedVariablesResponse structure', () => {
    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={mockPublishedVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Parsed Fallback: yes')).toBeInTheDocument()
  })

  it('generates stable providerId using useId', () => {
    const ProviderIdTestComponent = () => {
      const { providerId } = useFigmaTokenContext()
      return <div>Provider ID: {providerId}</div>
    }

    const { rerender } = render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'>
        <ProviderIdTestComponent />
      </FigmaVariablesProvider>
    )

    const firstId = screen.getByText(/Provider ID:/).textContent

    act(() => {
      rerender(
        <FigmaVariablesProvider
          token='test-token'
          fileKey='test-file-key'>
          <ProviderIdTestComponent />
        </FigmaVariablesProvider>
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
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={invalidStructure}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(console.warn).not.toHaveBeenCalled()
  })

  it('handles non-string, non-object fallbackFile gracefully', () => {
    // Test the fallback case when fallbackFile is neither string nor object
    render(
      <FigmaVariablesProvider
        token='test-token'
        fileKey='test-file-key'
        fallbackFile={123 as unknown as typeof mockLocalVariablesResponse}>
        <FallbackTestComponent />
      </FigmaVariablesProvider>
    )

    expect(screen.getByText('Has Fallback: yes')).toBeInTheDocument()
    expect(screen.getByText('Has Parsed Fallback: no')).toBeInTheDocument()
  })
})
