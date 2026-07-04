import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { links } from '@/lib/shared'
import { cn } from '@/lib/cn'

const nav = [
  { label: 'Docs', href: '/docs', key: 'docs' as const },
  { label: 'Playground', href: links.playground, key: 'playground' as const },
  {
    label: 'GitHub',
    href: links.github,
    external: true,
    key: 'github' as const,
  },
]

export function SiteHeader({
  active,
}: {
  active?: 'home' | 'docs' | 'playground'
}) {
  return (
    <header className='sticky top-0 z-50 border-b border-primitree-border/80 bg-primitree-bg/70 backdrop-blur-2xl backdrop-saturate-150'>
      <div className='mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8'>
        <BrandLogo
          size='md'
          linked
        />
        <nav
          aria-label='Primary navigation'
          className='hidden items-center gap-1 sm:flex'>
          {nav.map(item => (
            <Link
              key={item.key}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              aria-current={active === item.key ? 'page' : undefined}
              className={cn(
                'site-nav-link rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors',
                active === item.key
                  ? 'bg-primitree-accent-wash text-primitree-accent'
                  : 'text-primitree-muted'
              )}>
              {item.label}
            </Link>
          ))}
          <Link
            href='/docs/getting-started'
            className='btn-primary ml-3 rounded-full px-4 py-2 text-[13px] font-semibold'>
            Get started
          </Link>
        </nav>
        <details
          className='mobile-nav sm:hidden'
          aria-label='Navigation'>
          <summary>Menu</summary>
          <nav aria-label='Mobile navigation'>
            {nav.map(item => (
              <Link
                key={item.key}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                aria-current={active === item.key ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
            <Link href='/docs/getting-started'>Get started</Link>
          </nav>
        </details>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className='border-t border-primitree-border'>
      <div className='mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-14 lg:px-8'>
        <div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <BrandLogo size='sm' />
          <div className='flex flex-wrap gap-x-6 gap-y-2 text-sm text-primitree-muted'>
            <Link
              href='/docs'
              className='site-footer-link transition-colors'>
              Documentation
            </Link>
            <Link
              href={links.playground}
              className='site-footer-link transition-colors'>
              Playground
            </Link>
            <Link
              href={links.npmCli}
              className='site-footer-link transition-colors'
              target='_blank'>
              npm
            </Link>
            <Link
              href={links.github}
              className='site-footer-link transition-colors'
              target='_blank'>
              GitHub
            </Link>
          </div>
        </div>
        <p className='text-sm text-primitree-dim'>MIT · Mark Learst</p>
      </div>
    </footer>
  )
}

export function MarketingShell({
  children,
  active,
}: {
  children: ReactNode
  active?: 'home' | 'docs' | 'playground'
}) {
  return (
    <>
      <SiteHeader active={active} />
      <main className='relative'>{children}</main>
      <SiteFooter />
    </>
  )
}
