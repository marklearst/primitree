import { act, renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { toDTCG, type DTCGColorValue, type DTCGDocument } from '@primitree/dtcg'
import { TokensProvider } from '../../src/tokens/TokensProvider'
import { useToken } from '../../src/tokens/useToken'
import { useTokens } from '../../src/tokens/useTokens'
import { useTheme } from '../../src/tokens/useTheme'
import { mockLocalVariablesResponse } from '../mocks/variables'

// Build real DTCG artifacts from a Figma-shaped fixture, exactly like
// `primitree build` would.
const fixture = {
  meta: {
    variableCollections: {
      c1: {
        id: 'c1',
        name: 'Primitives',
        modes: [{ modeId: 'm1', name: 'Value' }],
        defaultModeId: 'm1',
        hiddenFromPublishing: false,
        variableIds: ['v1', 'v2'],
      },
      c2: {
        id: 'c2',
        name: 'Theme',
        modes: [
          { modeId: 'l', name: 'Light' },
          { modeId: 'd', name: 'Dark' },
        ],
        defaultModeId: 'l',
        hiddenFromPublishing: false,
        variableIds: ['v3'],
      },
    },
    variables: {
      v1: {
        id: 'v1',
        name: 'color/white',
        variableCollectionId: 'c1',
        resolvedType: 'COLOR',
        valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
        description: '',
        hiddenFromPublishing: false,
        scopes: [],
        codeSyntax: {},
      },
      v2: {
        id: 'v2',
        name: 'color/black',
        variableCollectionId: 'c1',
        resolvedType: 'COLOR',
        valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 1 } },
        description: '',
        hiddenFromPublishing: false,
        scopes: [],
        codeSyntax: {},
      },
      v3: {
        id: 'v3',
        name: 'color/bg',
        variableCollectionId: 'c2',
        resolvedType: 'COLOR',
        valuesByMode: {
          l: { type: 'VARIABLE_ALIAS', id: 'v1' },
          d: { type: 'VARIABLE_ALIAS', id: 'v2' },
        },
        description: '',
        hiddenFromPublishing: false,
        scopes: [],
        codeSyntax: {},
      },
    },
  },
}

const built = toDTCG(fixture)

const plainTokens = {
  brand: {
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    },
  },
} satisfies DTCGDocument

const wrapper = ({ children }: { children: ReactNode }) => (
  <TokensProvider
    tokens={built.files}
    resolver={built.resolver}>
    {children}
  </TokensProvider>
)

describe('TokensProvider + useToken', () => {
  it('resolves token values through references in the default context', () => {
    const { result } = renderHook(() => useToken('theme.color.bg'), {
      wrapper,
    })
    expect(result.current.exists).toBe(true)
    expect((result.current.value as DTCGColorValue).hex).toBe('#ffffff')
    expect(result.current.css).toBe('color(srgb 1 1 1)')
    expect(result.current.cssVar).toBe('var(--theme-color-bg)')
  })

  it('returns exists=false for unknown paths', () => {
    const { result } = renderHook(() => useToken('nope.nothing'), { wrapper })
    expect(result.current.exists).toBe(false)
    expect(result.current.value).toBeUndefined()
    expect(result.current.css).toBeNull()
  })

  it('switches values when the theme context changes', () => {
    const { result } = renderHook(
      () => ({ token: useToken('theme.color.bg'), theme: useTheme() }),
      { wrapper }
    )
    expect((result.current.token.value as DTCGColorValue).hex).toBe('#ffffff')

    act(() => {
      result.current.theme.setContext('theme', 'dark')
    })
    expect(result.current.theme.contexts.theme).toBe('dark')
    expect((result.current.token.value as DTCGColorValue).hex).toBe('#000000')
  })
})

describe('useTheme', () => {
  it('exposes available contexts from the resolver with defaults active', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.availableContexts).toEqual({
      theme: ['light', 'dark'],
    })
    expect(result.current.contexts).toEqual({ theme: 'light' })
  })

  it('honors defaultContexts overrides', () => {
    const custom = ({ children }: { children: ReactNode }) => (
      <TokensProvider
        tokens={built.files}
        resolver={built.resolver}
        defaultContexts={{ theme: 'dark' }}>
        {children}
      </TokensProvider>
    )
    const { result } = renderHook(() => useToken('theme.color.bg'), {
      wrapper: custom,
    })
    expect((result.current.value as DTCGColorValue).hex).toBe('#000000')
  })

  it('supports setContexts wholesale replacement', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => {
      result.current.setContexts({ theme: 'dark' })
    })
    expect(result.current.contexts).toEqual({ theme: 'dark' })
  })
})

describe('useTokens', () => {
  it('lists all flattened tokens', () => {
    const { result } = renderHook(() => useTokens(), { wrapper })
    const paths = result.current.flat.map(f => f.path)
    expect(paths).toContain('primitives.color.white')
    expect(paths).toContain('theme.color.bg')
  })

  it('throws outside a provider', () => {
    expect(() => renderHook(() => useTokens())).toThrow(
      'Call useTokens inside a <TokensProvider>.'
    )
  })

  it('works with a plain document and no resolver', () => {
    const plain = ({ children }: { children: ReactNode }) => (
      <TokensProvider tokens={plainTokens}>{children}</TokensProvider>
    )
    const { result } = renderHook(() => useToken('brand'), { wrapper: plain })
    expect(result.current.css).toBe('color(srgb 1 0 0)')
  })

  it('merges an array of documents in order', () => {
    const docs = [
      { size: { $type: 'number', $value: 1 } },
      { size: { $type: 'number', $value: 2 } },
    ] as never[]
    const arrayWrapper = ({ children }: { children: ReactNode }) => (
      <TokensProvider tokens={docs}>{children}</TokensProvider>
    )
    const { result } = renderHook(() => useToken('size'), {
      wrapper: arrayWrapper,
    })
    expect(result.current.value).toBe(2)
  })
})

describe('sanity: existing live-API mocks are unaffected', () => {
  it('keeps the legacy fixture importable', () => {
    expect(mockLocalVariablesResponse.meta.variables).toBeDefined()
  })
})
