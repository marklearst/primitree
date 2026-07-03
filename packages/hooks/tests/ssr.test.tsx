// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TokensProvider, useToken } from '@primitree/hooks'

function TokenValue() {
  const token = useToken('brand')

  return <output>{token.css}</output>
}

describe('@primitree/hooks public entry on React 19 SSR', () => {
  it('renders token consumers without browser globals', () => {
    const html = renderToString(
      <TokensProvider tokens={{ brand: { $type: 'color', $value: '#3366ff' } }}>
        <TokenValue />
      </TokensProvider>
    )

    expect(html).toBe('<output>#3366ff</output>')
  })
})
