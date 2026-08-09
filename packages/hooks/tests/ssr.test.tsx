// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TokensProvider, useToken } from '@primitree/hooks'
import type { DTCGDocument } from '@primitree/dtcg'

const tokens = {
  brand: {
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: [0.2, 0.4, 1],
      hex: '#3366ff',
    },
  },
} satisfies DTCGDocument

function TokenValue() {
  const token = useToken('brand')

  return <output>{token.css}</output>
}

describe('@primitree/hooks public entry on React 19 SSR', () => {
  it('renders token consumers without browser globals', () => {
    const html = renderToString(
      <TokensProvider tokens={tokens}>
        <TokenValue />
      </TokensProvider>
    )

    expect(html).toBe('<output>color(srgb 0.2 0.4 1)</output>')
  })
})
