import type { ReactNode } from 'react'
import { bind } from '@/lib/tokens/bind'

/** A code panel bound to its tokens. The transcripts on the page are the
 * proof, and every one reads the same four. */
export function Transcript({ children }: { children: ReactNode }) {
  return (
    <pre
      {...bind({
        backgroundColor: 'component.code.background',
        borderColor: 'component.code.border',
        borderRadius: 'component.code.radius',
        color: 'semantic.syntax.base',
      })}>
      <code>{children}</code>
    </pre>
  )
}
