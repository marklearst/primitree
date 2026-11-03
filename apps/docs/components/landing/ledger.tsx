'use client'

import { Fragment, useState } from 'react'
import { BRAND_HUE } from '@/lib/tokens/page-store'

interface LedgerToken {
  readonly path: string
  readonly target: {
    readonly light: string | null
    readonly dark: string | null
  }
  readonly value: { readonly light: string; readonly dark: string }
}

/** A token path with a line break opportunity after each dot. */
function DottedPath({ path }: { path: string }) {
  return (
    <>
      {path.split('.').map((part, index, parts) => (
        <Fragment key={part}>
          {part}
          {index < parts.length - 1 ? (
            <>
              .<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

/** Every token on the page, read on demand: the table is long, and it has no job
 * until someone opens it. */
export function Ledger({ total }: { total: number }) {
  const [tokens, setTokens] = useState<readonly LedgerToken[] | null>(null)

  return (
    <details
      className='ledger-details'
      onToggle={event => {
        if (event.currentTarget.open && tokens === null) {
          void import('@/tokens/generated/graph.json').then(
            ({ default: graph }) => {
              setTokens(graph.tokens)
            }
          )
        }
      }}>
      <summary>
        <h2 id='ledger-title'>Read all {total} tokens.</h2>
      </summary>
      {tokens === null ? null : (
        <p className='ledger-note'>
          The values as shipped, at hue {BRAND_HUE}. The dial changes what the
          page paints, and this table keeps what the files hold.
        </p>
      )}
      {tokens === null ? null : (
        <table className='ledger-table'>
          <caption className='sr-only'>
            Every token on this page, with the token each one references
          </caption>
          <thead>
            <tr>
              <th scope='col'>Token</th>
              <th scope='col'>Light</th>
              <th scope='col'>Dark</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map(token => (
              <tr key={token.path}>
                <th
                  scope='row'
                  aria-label={token.path}>
                  <code>
                    <DottedPath path={token.path} />
                  </code>
                </th>
                <td>
                  <code>
                    {token.target.light === null ? (
                      token.value.light
                    ) : (
                      <DottedPath path={`{${token.target.light}}`} />
                    )}
                  </code>
                </td>
                <td>
                  <code>
                    {token.target.dark === null ? (
                      token.value.dark
                    ) : (
                      <DottedPath path={`{${token.target.dark}}`} />
                    )}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}
