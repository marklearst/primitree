import type { CSSProperties } from 'react'
import type { TokenPath } from '@/tokens/generated/token-path'
import { cssVarOf } from './site-graph-names'

/* Binds an element to its tokens. The style and the data-tokens attribute come
   from the same call, so what the graph says an element reads is what the
   browser paints, by construction. A removed token is a compile error. */

type StyleProperty = keyof Pick<
  CSSProperties,
  | 'backgroundColor'
  | 'borderColor'
  | 'borderRadius'
  | 'color'
  | 'fill'
  | 'fontFamily'
  | 'fontWeight'
  | 'outlineColor'
  | 'stroke'
  | 'textDecorationColor'
>

export type TokenBinding = Partial<Record<StyleProperty, TokenPath>>

export interface BoundProps {
  readonly 'data-tokens': string
  readonly style: CSSProperties
}

export function bind(binding: TokenBinding): BoundProps {
  const style: CSSProperties = {}
  const paths: string[] = []
  for (const [property, path] of Object.entries(binding) as [
    StyleProperty,
    TokenPath,
  ][]) {
    Object.assign(style, { [property]: `var(${cssVarOf(path)})` })
    if (!paths.includes(path)) {
      paths.push(path)
    }
  }
  return { 'data-tokens': paths.join(' '), style }
}

/** Declares tokens an element reads through its stylesheet class, for rules
 * such as padding and transitions that an inline style cannot state. */
export const reads = (...paths: readonly TokenPath[]) => ({
  'data-tokens': paths.join(' '),
})

/** An ink panel paints these through its class. */
export const inkReads = reads(
  'component.code.background',
  'component.code.border',
  'component.code.radius',
  'semantic.syntax.base'
)
