'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { links } from '@/lib/shared'

/* Home and the Playground each carry a stylesheet of their own, which a
   prefetch would preload and leave unused on every other route. */
const ownStylesheet = new Set(['/', links.playground])

export function DocsLink({
  href = '#',
  prefetch,
  ...props
}: ComponentProps<'a'> & { prefetch?: boolean }) {
  return (
    <Link
      href={href}
      prefetch={ownStylesheet.has(href) ? false : prefetch}
      {...props}
    />
  )
}
